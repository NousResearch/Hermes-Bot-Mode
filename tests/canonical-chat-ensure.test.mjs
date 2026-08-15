import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function loadCanonical({ openSession, request, meta = {} }) {
  const start = source.indexOf('const canonicalCreations = new Map()')
  const end = source.indexOf('function displayName(', start)
  const saved = []
  const context = {
    host: { openSession, request },
    saveBotMeta: (name, patch) => saved.push({ name, patch }),
    $botMeta: { get: () => meta },
    $hideBotChats: { get: () => true },
    window: { setTimeout: callback => callback() }
  }
  const section = source
    .slice(start, end)
    .concat('\nglobalThis.__canonical = { createCanonicalChat, ensureCanonicalChat };')

  assert.notEqual(start, -1, 'canonical creation section is missing')
  assert.notEqual(end, -1, 'canonical creation section delimiter is missing')
  vm.runInNewContext(section, context, { filename: 'canonical-ensure.js' })
  return { ...context.__canonical, saved }
}

test('ensureCanonicalChat adopts an existing "Bot Chat" session when the pin is missing', async () => {
  const events = []
  const canonical = loadCanonical({
    request: async method => {
      if (method === 'session.list') {
        events.push('list')
        return {
          sessions: [
            { id: 'scratch-1', title: 'Scratchpad' },
            { id: 'canon-1', title: 'Bot Chat' }
          ]
        }
      }
      events.push(`unexpected:${method}`)
      return {}
    }
  })

  const id = await canonical.ensureCanonicalChat('ops')

  assert.equal(id, 'canon-1')
  assert.deepEqual(events, ['list'])
  // Cross-realm objects (vm) fail deepStrictEqual on prototype — compare fields.
  assert.equal(canonical.saved.length, 1)
  assert.equal(canonical.saved[0].name, 'ops')
  assert.equal(canonical.saved[0].patch.chat, 'canon-1')
})

test('ensureCanonicalChat creates a chat WITHOUT navigating when none exists', async () => {
  const events = []
  const canonical = loadCanonical({
    openSession: async id => events.push(`open:${id}`),
    request: async method => {
      if (method === 'session.list') {
        events.push('list')
        return { sessions: [{ id: 'scratch-1', title: 'Scratchpad' }] }
      }
      if (method === 'session.create') {
        events.push('create')
        return { stored_session_id: 'stored-1', session_id: 'runtime-1' }
      }
      if (method === 'prompt.submit') {
        events.push('kickoff')
        return {}
      }
      events.push(`unexpected:${method}`)
      return {}
    }
  })

  const id = await canonical.ensureCanonicalChat('ops')

  assert.equal(id, 'stored-1')
  // The kickoff still runs (the chat must be born with a message so the
  // gateway doesn't prune it), but the user's view is never hijacked.
  assert.deepEqual(events, ['list', 'create', 'kickoff'])
  assert.equal(canonical.saved.length, 1)
  assert.equal(canonical.saved[0].name, 'ops')
  assert.equal(canonical.saved[0].patch.chat, 'stored-1')
})

test('ensureCanonicalChat returns the pinned id without any RPC when present', async () => {
  const events = []
  const canonical = loadCanonical({
    openSession: async id => events.push(`open:${id}`),
    request: async method => events.push(`request:${method}`),
    meta: { ops: { chat: 'pinned-1' } }
  })

  const id = await canonical.ensureCanonicalChat('ops')

  assert.equal(id, 'pinned-1')
  assert.deepEqual(events, [])
})

test('createCanonicalChat with navigate:false never calls openSession', async () => {
  const events = []
  const canonical = loadCanonical({
    openSession: async id => events.push(`open:${id}`),
    request: async method => {
      if (method === 'session.create') {
        events.push('create')
        return { stored_session_id: 'stored-1', session_id: 'runtime-1' }
      }
      if (method === 'prompt.submit') {
        events.push('kickoff')
        return {}
      }
      events.push(`unexpected:${method}`)
      return {}
    }
  })

  const id = await canonical.createCanonicalChat('ops', { navigate: false })

  assert.equal(id, 'stored-1')
  assert.deepEqual(events, ['create', 'kickoff'])
})
