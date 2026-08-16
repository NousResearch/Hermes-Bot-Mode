import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

// Origin-chat return-path: injected teammate replies must persist through
// refresh / tab-switch via verified host APIs only. Mention middleware must
// still return the draft + CLI handoff note — never null — even when those
// APIs are missing. See NousResearch/Hermes-Bot-Mode#73.

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load({
  activeProfile = 'research',
  profiles = ['research', 'ops'],
  title = null,
  sessionId = 'origin-session-1',
  appendMessage,
  request,
  history = null
} = {}) {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const rpcCalls = []
  const appendCalls = []
  const warnings = []
  const defaultRequest = async (method, params) => {
    rpcCalls.push({ method, params })
    if (method === 'profiles.list') {
      return { profiles: profiles.map(name => ({ name })) }
    }
    if (method === 'session.history') {
      return { messages: history || [] }
    }
    if (method === 'session.append_message') {
      return { ok: true }
    }
    return {}
  }
  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    console: {
      warn: (...args) => warnings.push(args),
      log: () => undefined,
      error: () => undefined
    },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: {
      appendMessage:
        appendMessage === undefined
          ? (payload => {
              appendCalls.push(payload)
            })
          : appendMessage,
      request: request === undefined ? defaultRequest : request,
      notify: () => undefined,
      activeSessionId: { get: () => sessionId },
      state: {
        profile: { get: () => activeProfile, listen: () => undefined },
        gateway: { listen: () => undefined },
        activeSessionId: { get: () => sessionId }
      }
    }
  }
  const source = pluginSource
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat(
      '\nglobalThis.__origin = { persistOriginLine, settleOriginPrints, rememberOriginHandoff, rememberOriginPrint, applyRememberedPreview, trackInboundActivity, $originPrints, $originHandoffs, $botMeta };\n'
    )
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  context.__origin.$botMeta.set(title ? { [activeProfile]: { title } } : {})

  const registered = []
  context.plugin.register({
    storage: { get: () => null, set: () => undefined },
    register: entry => registered.push(entry)
  })
  const middleware = registered.find(entry => entry.id === 'mention-middleware')
  assert.ok(middleware, 'mention middleware did not register')
  return {
    handler: middleware.data.handler,
    host: context.host,
    rpcCalls,
    appendCalls,
    warnings,
    ...context.__origin
  }
}

test('persist calls appendMessage and session.append_message', async () => {
  const { persistOriginLine, appendCalls, rpcCalls } = load()
  const ok = await persistOriginLine('origin-session-1', 'assistant', 'ops: the paper is in')
  assert.equal(ok, true)
  assert.equal(appendCalls.length, 1)
  assert.equal(appendCalls[0].role, 'assistant')
  assert.equal(appendCalls[0].text, 'ops: the paper is in')
  assert.equal(appendCalls[0].sessionId, 'origin-session-1')
  const persist = rpcCalls.filter(call => call.method === 'session.append_message')
  assert.equal(persist.length, 1)
  assert.equal(persist[0].params.session_id, 'origin-session-1')
  assert.equal(persist[0].params.role, 'assistant')
  assert.equal(persist[0].params.content, 'ops: the paper is in')
  assert.equal(persist[0].params.observed, true)
  assert.equal(
    rpcCalls.some(call =>
      ['session.resume', 'session.append', 'messages.append'].includes(call.method)
    ),
    false
  )
})

test('missing APIs no-op without calling unverified methods', async () => {
  const unverified = []
  const { persistOriginLine, host } = load({
    appendMessage: null,
    request: async (method, params) => {
      if (method === 'profiles.list') {
        return { profiles: [{ name: 'research' }, { name: 'ops' }] }
      }
      unverified.push(method)
      return {}
    }
  })
  delete host.appendMessage
  delete host.request
  host.sessionResume = () => unverified.push('session.resume')
  const ok = await persistOriginLine('origin-session-1', 'assistant', 'ops: gone')
  assert.equal(ok, false)
  assert.deepEqual(unverified, [])
})

test('settle skips lines already in session.history', async () => {
  const { settleOriginPrints, rememberOriginPrint, appendCalls, rpcCalls } = load({
    history: [{ content: 'ops: already there' }]
  })
  rememberOriginPrint('origin-session-1', 'research', 'assistant', 'ops: already there')
  rememberOriginPrint('origin-session-1', 'research', 'assistant', 'ops: new reply')
  await settleOriginPrints()
  const persisted = rpcCalls.filter(call => call.method === 'session.append_message')
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].params.content, 'ops: new reply')
  assert.equal(appendCalls.length, 1)
  assert.equal(appendCalls[0].text, 'ops: new reply')
})

test('persist failure is warn/false, not swallowed', async () => {
  const { persistOriginLine, warnings } = load({
    appendMessage: () => {
      throw new Error('append failed')
    },
    request: async method => {
      if (method === 'profiles.list') {
        return { profiles: [{ name: 'research' }, { name: 'ops' }] }
      }
      if (method === 'session.append_message') {
        throw new Error('rpc failed')
      }
      return {}
    }
  })
  const ok = await persistOriginLine('origin-session-1', 'assistant', 'ops: boom')
  assert.equal(ok, false)
  assert.ok(warnings.length >= 1, 'failure must log warn')
  assert.ok(
    warnings.some(args => String(args[0] || '').includes('failed')),
    'warn names the failure'
  )
})

test('mention middleware still returns the draft+note, not null', async () => {
  const { handler, $originHandoffs } = load({
    appendMessage: null,
    request: async method => {
      if (method === 'profiles.list') {
        return { profiles: [{ name: 'research' }, { name: 'ops' }] }
      }
      throw new Error('no persist APIs')
    }
  })
  const draft = { text: 'please @ops review the diff' }
  const result = await handler(draft)
  assert.notEqual(result, null)
  assert.ok(result.text.startsWith('please @ops review the diff'))
  assert.ok(result.text.includes('[@mention handoff'))
  const remembered = $originHandoffs.get() || []
  assert.equal(remembered.length, 1)
  assert.equal(remembered[0].targets.length, 1)
  assert.equal(remembered[0].targets[0], 'ops')
  assert.equal(remembered[0].originSessionId, 'origin-session-1')
  assert.equal(remembered[0].originProfile, 'research')
})

test('roster preview for a remembered target persists handle: preview', async () => {
  const { rememberOriginHandoff, trackInboundActivity, appendCalls, rpcCalls } = load()
  rememberOriginHandoff({
    originSessionId: 'origin-session-1',
    originProfile: 'research',
    targets: ['ops']
  })
  trackInboundActivity([{ name: 'ops', last_session: { last_active: 1, preview: 'old' } }])
  trackInboundActivity([{ name: 'ops', last_session: { last_active: 2, preview: 'the paper is in' } }])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(appendCalls.length, 1)
  assert.equal(appendCalls[0].text, 'ops: the paper is in')
  const persist = rpcCalls.filter(call => call.method === 'session.append_message')
  assert.equal(persist.length, 1)
  assert.equal(persist[0].params.content, 'ops: the paper is in')
})
