import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

// openBotCanonicalChat() resolution matrix — behavioral tests through the
// same vm harness as canonical-chat-empty-recovery.test.mjs (no source-string
// assertions).
//
// Contract:
// - the click opens the session the roster row previews: the most recently
//   active one by last_active, never array position;
// - a valid pin that is still the newest opens as-is;
// - a stale pin is NOT rewritten: when a different session is strictly newer
//   we open THAT (matching the row) but preserve the deliberately pinned
//   canonical chat in meta.chat;
// - a pin missing from the list recovers to the newest and re-pins;
// - empty list / failed list / failed open never open an unrelated session,
//   and the bot's profile is preserved on host.openSession.

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function loadCanonical({ openSession, request }) {
  const start = source.indexOf('const canonicalCreations = new Map()')
  const end = source.indexOf('function displayName(', start)
  const saved = []
  const context = {
    host: { openSession, request },
    saveBotMeta: (name, patch) => saved.push({ name, patch }),
    $hideBotChats: { get: () => false },
    window: { setTimeout: callback => callback() }
  }
  const section = source
    .slice(start, end)
    .concat('\nglobalThis.__canonical = { openBotCanonicalChat };\n')

  assert.notEqual(start, -1, 'canonical chat section is missing')
  assert.notEqual(end, -1, 'canonical chat section delimiter is missing')
  vm.runInNewContext(section, context, { filename: 'canonical-pin.js' })
  return { ...context.__canonical, saved }
}

function sessionList(...sessions) {
  return async method => (method === 'session.list' ? { sessions } : {})
}

function sessionListWithCreate(...sessions) {
  return async method => {
    if (method === 'session.list') return { sessions }
    if (method === 'session.create') return { stored_session_id: 'replacement', session_id: 'replacement-runtime' }
    return {}
  }
}

test('a pin that is still the newest session opens unchanged', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionList({ id: 'pin', last_active: 200 }, { id: 'old', last_active: 100 })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'pin')
  assert.deepEqual(opened, ['pin'])
  assert.equal(r.saved.length, 0)
})

test('a stale pin opens the newer session but preserves the canonical pin (no silent re-pin)', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionList({ id: 'running', last_active: 300 }, { id: 'pin', last_active: 100 })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'running')
  assert.deepEqual(opened, ['running'])
  // The deliberately pinned canonical chat stays intact — meta.chat is not
  // rewritten to the unrelated running session.
  assert.equal(r.saved.length, 0)
})

test('a missing pin recovers to the most recently active session, not an arbitrary row', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionList({ id: 'newer', last_active: 99 }, { id: 'older', last_active: 10 }, { id: 'middle', last_active: 50 })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'gone'), 'newer')
  assert.deepEqual(opened, ['newer'])
  assert.deepEqual(JSON.parse(JSON.stringify(r.saved)), [{ name: 'ops', patch: { chat: 'newer' } }])
})

test('the newest session is selected by last_active, not array position', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionList({ id: 'first', last_active: 5 }, { id: 'hottest', last_active: 999 }, { id: 'middle', last_active: 50 })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'gone'), 'hottest')
  assert.deepEqual(opened, ['hottest'])
  assert.deepEqual(JSON.parse(JSON.stringify(r.saved)), [{ name: 'ops', patch: { chat: 'hottest' } }])
})

test('without last_active fields, the gateway newest-first order is trusted: a stale pin opens rows[0]', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    // session.list on this gateway drops the last_active timestamp; the rows
    // are still ordered newest-first (order_by_last_active) — rows[0] is the
    // session the roster previews, so the click must open it, not the pin.
    request: sessionList({ id: 'running' }, { id: 'pin' })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'running')
  assert.deepEqual(opened, ['running'])
  // The pinned canonical chat stays intact (no silent re-pin).
  assert.equal(r.saved.length, 0)
})

test('without last_active fields, a pin that is already rows[0] opens unchanged', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionList({ id: 'pin' }, { id: 'old' })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'pin')
  assert.deepEqual(opened, ['pin'])
  assert.equal(r.saved.length, 0)
})

test('a gateway/list failure falls back to the stored pin, never an unrelated session', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: async () => {
      throw new Error('gateway down')
    }
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'pin')
  assert.deepEqual(opened, ['pin'])
  assert.equal(r.saved.length, 0)
})

test('host.openSession failure clears the pin and recovers to a fresh canonical chat', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => {
      // The stored pin's resume is rejected; the replacement canonical is not.
      if (id === 'pin') {
        throw new Error('rejected resume')
      }
      opened.push(id)
    },
    request: sessionListWithCreate({ id: 'pin', last_active: 100 })
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'pin'), 'replacement')
  assert.deepEqual(opened, ['replacement'])
  assert.deepEqual(JSON.parse(JSON.stringify(r.saved)), [
    { name: 'ops', patch: { chat: null } },
    { name: 'ops', patch: { chat: 'replacement' } }
  ])
})

test('an empty session list clears the pin and creates the canonical Bot Chat', async () => {
  const opened = []
  const r = loadCanonical({
    openSession: async id => opened.push(id),
    request: sessionListWithCreate()
  })

  assert.equal(await r.openBotCanonicalChat('ops', 'stale-pin'), 'replacement')
  assert.deepEqual(opened, ['replacement'])
  assert.deepEqual(JSON.parse(JSON.stringify(r.saved)), [
    { name: 'ops', patch: { chat: null } },
    { name: 'ops', patch: { chat: 'replacement' } }
  ])
})

test('host.openSession is called with the bot profile preserved', async () => {
  const calls = []
  const r = loadCanonical({
    openSession: async (id, opts) => calls.push({ id, opts }),
    request: sessionList({ id: 'pin', last_active: 200 }, { id: 'old', last_active: 100 })
  })

  await r.openBotCanonicalChat('ops', 'pin')
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ id: 'pin', opts: { profile: 'ops' } }])
})
