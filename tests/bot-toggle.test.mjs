import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

/** VM harness — same shape as routine-prompt.test.mjs, plus the RPC mocks
 *  the on/off toggle needs (profiles.list, cron.manage) and a storage spy. */
function load({ profiles = [], jobs = [] } = {}) {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }

  const calls = []
  const stored = []
  const jobState = new Map(jobs.map(job => [job.job_id, { ...job }]))

  const host = {
    state: { profile: { get: () => 'default', listen: () => undefined } },
    notify: () => undefined,
    request: (method, params) => {
      calls.push({ method, params })

      if (method === 'profiles.list') {
        return Promise.resolve({ profiles })
      }

      if (method === 'cron.manage' && params?.action === 'list') {
        return Promise.resolve({ jobs: [...jobState.values()] })
      }

      if (method === 'cron.manage') {
        const job = jobState.get(params?.name)
        if (job) {
          if (params.action === 'pause') job.state = 'paused'
          if (params.action === 'resume') job.state = null
        }
        return Promise.resolve({ ok: true })
      }

      return Promise.resolve({})
    }
  }

  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host,
    queryClient: { invalidateQueries: () => undefined }
  }

  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__toggle = { setBotEnabled, routineBot };')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })

  const register = () => {
    const entries = []
    context.plugin.register({
      storage: { get: () => null, set: (key, value) => stored.push([key, value]) },
      register: entry => entries.push(entry)
    })
    return entries
  }

  return { __toggle: context.__toggle, register, calls, stored }
}

test('unit: a bot switched off via ui_meta is excluded from @mention handoffs', async () => {
  const { register } = load({
    profiles: [
      { name: 'researcher', ui_meta: { 'hermes-bots': { enabled: false } } },
      { name: 'writer', ui_meta: { 'hermes-bots': { enabled: true } } }
    ]
  })
  const entries = register()
  const middleware = entries.find(entry => entry.id === 'mention-middleware')
  assert.ok(middleware, 'mention middleware is registered')

  const draft = await middleware.data.handler({ text: '@researcher and @writer look at this' })
  assert.equal(draft.text.includes('hermes -p researcher chat'), false, 'off bot gets no handoff')
  assert.equal(draft.text.includes('hermes -p writer chat'), true, 'on bot gets the handoff')
  assert.equal(draft.text.includes('@researcher'), true, 'mention text stays literal')
})

test('integration: switching a bot off pauses only its routines and persists the flag', async () => {
  const { __toggle, register, calls, stored } = load({
    profiles: [],
    jobs: [
      { job_id: 'j1', name: '[bot:researcher] Morning digest', enabled: true },
      { job_id: 'j2', name: '[bot:researcher] Nightly backup', state: 'paused' },
      { job_id: 'j3', name: '[bot:writer] Other routine', enabled: true }
    ]
  })
  register()
  await __toggle.setBotEnabled('researcher', false)

  const pauses = calls.filter(call => call.method === 'cron.manage' && call.params.action === 'pause')
  assert.deepEqual(pauses.map(call => call.params.name), ['j1'], 'only the active routine of that bot pauses')

  const metaWrite = stored.find(([key]) => key === 'bot-meta')
  assert.ok(metaWrite, 'bot meta is persisted')
  assert.equal(metaWrite[1].researcher.enabled, false)
})

test('integration: switching a bot back on resumes its paused routines', async () => {
  const { __toggle, register, calls } = load({
    profiles: [],
    jobs: [
      { job_id: 'j1', name: '[bot:researcher] Morning digest', enabled: true },
      { job_id: 'j2', name: '[bot:researcher] Nightly backup', enabled: false }
    ]
  })
  register()
  await __toggle.setBotEnabled('researcher', false)
  calls.length = 0
  await __toggle.setBotEnabled('researcher', true)

  const resumes = calls.filter(call => call.method === 'cron.manage' && call.params.action === 'resume')
  assert.deepEqual(resumes.map(call => call.params.name), ['j1', 'j2'], 'paused + disabled routines resume')
})

test('regression: each roster row renders an on/off switch wired to setBotEnabled', () => {
  assert.match(pluginSource, /const enabled = meta\?\.enabled !== false/)
  assert.match(pluginSource, /onCheckedChange: value => void setBotEnabled\(bot\.name, Boolean\(value\)\)/)
})

test('regression: newly created bots default to ON (create flow writes no enabled flag)', () => {
  assert.match(pluginSource, /saveBotMeta\(slug, \{ shape, color, image, title: title\.trim\(\), created: Date\.now\(\) \}\)/)
  assert.doesNotMatch(pluginSource, /saveBotMeta\(slug, \{[^}]*enabled/)
})
