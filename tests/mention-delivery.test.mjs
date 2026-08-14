import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load(request) {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const calls = []
  const opened = []
  const timers = []
  const host = {
    state: {
      profile: {
        get: () => 'default',
        listen: () => undefined
      }
    },
    request: async (method, params) => {
      calls.push({ method, params })
      if (request) return request(method, params)
      if (method === 'profiles.list') {
        return { profiles: [{ name: 'default' }, { name: 'researcher' }] }
      }
      if (method === 'session.list') return { sessions: [] }
      if (method === 'session.create') {
        return { stored_session_id: 'new-bot-chat', session_id: 'rt-1' }
      }
      if (method === 'session.resume') return { session_id: 'rt-resumed' }
      if (method === 'prompt.submit') return { ok: true }
      return {}
    },
    openSession: async (id, opts) => {
      opened.push({ id, opts })
    },
    notify: () => undefined,
    notifyError: () => undefined
  }
  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host,
    window: {
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      }
    }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__api = { createCanonicalChat, $botMeta, plugin };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return { context, calls, opened, timers, host }
}

function middleware(context) {
  const registered = []
  context.__api.plugin.register({
    storage: { get: () => null, set: () => undefined },
    register: item => registered.push(item)
  })
  return registered.find(item => item.id === 'mention-middleware')
}

test('unit: a click still opens the new chat and sends the intro', async () => {
  const { context, opened, timers } = load()
  const sid = await context.__api.createCanonicalChat('newbie')
  assert.equal(sid, 'new-bot-chat')
  assert.equal(opened.length, 1)
  assert.equal(opened[0].id, 'new-bot-chat')
  assert.equal(opened[0].opts.profile, 'newbie')
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 400)
})

test('unit: background create does not open the session or send the intro', async () => {
  const { context, opened, timers } = load()
  const sid = await context.__api.createCanonicalChat('newbie', { navigate: false, kickoff: false })
  assert.equal(sid, 'new-bot-chat')
  assert.equal(opened.length, 0)
  assert.equal(timers.length, 0)
  assert.equal(context.__api.$botMeta.get().newbie.chat, 'new-bot-chat')
})

test('integration: mentioning an unpinned bot does not leave the current chat', async () => {
  const { context, opened, calls, timers } = load()
  const mw = middleware(context)
  await mw.data.handler({ text: '@researcher look at this' })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(opened.length, 0)
  assert.equal(timers.length, 0)
  assert.ok(calls.some(c => c.method === 'session.create' && c.params.title === 'Bot Chat'))
  assert.ok(calls.some(c => c.method === 'prompt.submit'))
})

test('integration: an existing Bot Chat is reused instead of making a second one', async () => {
  const { context, calls } = load((method, params) => {
    if (method === 'profiles.list') {
      return { profiles: [{ name: 'default' }, { name: 'researcher' }] }
    }
    if (method === 'session.list') {
      assert.equal(params.limit, 200)
      return { sessions: [{ id: 'old-bot-chat', title: 'Bot Chat' }] }
    }
    if (method === 'session.create') {
      throw new Error('must not create')
    }
    if (method === 'session.resume') return { session_id: 'rt' }
    if (method === 'prompt.submit') return { ok: true }
    return {}
  })
  const mw = middleware(context)
  await mw.data.handler({ text: '@researcher hello' })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(context.__api.$botMeta.get().researcher.chat, 'old-bot-chat')
  assert.ok(!calls.some(c => c.method === 'session.create'))
})

test('regression: extra @tokens keep their @ when a real mention is also present', async () => {
  const { context, calls } = load()
  context.__api.$botMeta.set({ researcher: { chat: 'c1' } })
  const mw = middleware(context)
  await mw.data.handler({ text: '@researcher see @webpack and @example.com' })
  await new Promise(r => setTimeout(r, 20))
  const submit = calls.find(c => c.method === 'prompt.submit')
  assert.match(submit.params.text, /see @webpack and @example.com/)
  assert.match(submit.params.text, /Message from/)
})

test('regression: a pinned bot still gets the message and does not navigate', async () => {
  const { context, opened, calls } = load()
  context.__api.$botMeta.set({ researcher: { chat: 'already-pinned' } })
  const mw = middleware(context)
  await mw.data.handler({ text: '@researcher hello' })
  await new Promise(r => setTimeout(r, 20))
  assert.equal(opened.length, 0)
  assert.ok(calls.some(c => c.method === 'session.resume' && c.params.session_id === 'already-pinned'))
  assert.ok(!calls.some(c => c.method === 'session.create'))
})
