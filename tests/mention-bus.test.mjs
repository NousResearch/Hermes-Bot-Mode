import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load() {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { state: { profile: { listen: () => undefined, get: () => 'staff' }, gateway: { listen: () => undefined } } }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__mentions = { parseRosterMentions, messagingProtocolSection };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return context
}

const names = ['staff', 'kernel', 'research', 'ops']

test('unit: one roster mention is captured, self and unknown are not', () => {
  const { __mentions } = load()
  assert.equal(JSON.stringify(__mentions.parseRosterMentions('@kernel look at the auth bug', names, 'staff')), JSON.stringify(['kernel']))
  assert.equal(JSON.stringify(__mentions.parseRosterMentions('ping @staff and user@example.com', names, 'staff')), JSON.stringify([]))
  assert.equal(JSON.stringify(__mentions.parseRosterMentions('see @ghost later', names, 'staff')), JSON.stringify([]))
})

test('unit: mentions inside fences or inline code are ignored', () => {
  const { __mentions } = load()
  assert.equal(JSON.stringify(__mentions.parseRosterMentions('use `@kernel` in the docs\n```\n@research\n```\nthen @ops', names, 'staff')), JSON.stringify(['ops']))
})

test('unit: @hermes maps to default when that profile exists', () => {
  const { __mentions } = load()
  assert.equal(JSON.stringify(__mentions.parseRosterMentions('ask @hermes', ['default', 'kernel'], 'kernel')), JSON.stringify(['default']))
})

test('unit: soul protocol never teaches hermes -p as a command to run', () => {
  const { __mentions } = load()
  const soul = __mentions.messagingProtocolSection('staff', [
    { name: 'staff' },
    { name: 'kernel', description: 'code' }
  ])
  assert.match(soul, /Never run `hermes -p`/)
  assert.doesNotMatch(soul, /wait for the reply/)
  assert.doesNotMatch(soul, /```[\s\S]*hermes -p/)
  assert.match(soul, /`kernel`/)
})

test('regression: mention middleware no longer appends a hermes -p draft note', () => {
  assert.doesNotMatch(pluginSource, /@mention handoff/)
  assert.match(pluginSource, /Already delivered to /)
  assert.match(pluginSource, /mentioned\.length >= 3/)
  assert.match(pluginSource, /profiles\.inbox\.send/)
})

test('system: mention middleware still registers', () => {
  const runtime = load()
  const registered = []
  runtime.plugin.register({ storage: { get: () => null }, register: entry => registered.push(entry) })
  assert.equal(registered.some(entry => entry.id === 'mention-middleware'), true)
})
