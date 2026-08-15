import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function loadMentions() {
  const start = source.indexOf('function botHandle(')
  const end = source.indexOf('// ── canonical bot chat ──')
  const roster = [
    { name: 'researcher', title: 'Model Research' },
    { name: 'bookie', title: 'Betting Analytics', description: 'Straight bets only' },
    { name: 'default', title: 'Hermes' }
  ]
  const meta = {
    researcher: { title: 'Researcher Prime' },
    bookie: {}
  }
  const context = {
    $lastRoster: { get: () => roster },
    $botMeta: { get: () => meta },
    // displayName lives later in the file — stub its contract: meta title
    // wins, else the profile title, else the handle.
    displayName: (bot, botMeta) => botMeta?.title || bot?.title || bot?.name
  }
  const section = source
    .slice(start, end)
    .concat('\nglobalThis.__mentions = { resolveMentions };')

  assert.notEqual(start, -1, 'resolveMentions section is missing')
  assert.notEqual(end, -1, 'resolveMentions delimiter is missing')
  vm.runInNewContext(section, context, { filename: 'mention-provider.js' })
  return context.__mentions.resolveMentions
}

const resolveMentions = loadMentions()

test('mention provider lists every roster bot except the active profile', () => {
  const mentions = resolveMentions({ gatewayProfile: 'default' })

  assert.deepEqual(
    mentions.map(m => m.text),
    ['@researcher', '@bookie']
  )
  assert.ok(mentions.every(m => m.group === 'Bots'))
})

test('mention display uses bot-meta title override', () => {
  const mentions = resolveMentions({ gatewayProfile: 'default' })
  const researcher = mentions.find(m => m.text === '@researcher')

  assert.equal(researcher.display, 'Researcher Prime')
})

test('mention meta falls back to description then title then Agent', () => {
  const mentions = resolveMentions({ gatewayProfile: 'default' })
  const byText = Object.fromEntries(mentions.map(m => [m.text, m]))

  assert.equal(byText['@bookie'].meta, 'Straight bets only')
  assert.equal(byText['@researcher'].meta, 'Model Research') // no description → title
})

test('active profile is excluded from its own mention list', () => {
  const mentions = resolveMentions({ gatewayProfile: 'bookie' })

  assert.ok(!mentions.some(m => m.text === '@bookie'))
  assert.ok(mentions.some(m => m.text === '@researcher'))
})
