import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function runtime() {
  const atom = value => ({ get: () => value, set: () => undefined })
  const jsx = (type, props = {}) => ({ type, props })
  const context = {
    atom,
    jsx,
    jsxs: jsx,
    useQuery: () => ({}),
    useValue: value => (value?.get ? value.get() : value),
    useState: value => [value, () => undefined],
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { state: { profile: { get: () => 'ops', listen: () => undefined } }, request: () => undefined }
  }
  const code = source
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat(
      '\nglobalThis.__previewKind = previewKind;\nglobalThis.__generatedSessionTitle = generatedSessionTitle;\nglobalThis.__isGenericTitle = isGenericTitle;\n\nglobalThis.__recentHandoffs = recentHandoffs;\nglobalThis.__openLoopsByBot = openLoopsByBot;globalThis.__fleetSummary = fleetSummary;\nglobalThis.__needsYouOf = needsYouOf;\nglobalThis.__rawChatCommand = rawChatCommand;\nglobalThis.__messagingProtocolSection = messagingProtocolSection;\n\n\n'
    )
  vm.runInNewContext(code, context)
  return context
}

// NOTE: objects created inside the vm realm carry that realm's Object
// prototype, so assert.deepEqual against host-realm literals fails on
// reference-equality. Compare fields explicitly.
function fromBotOf(preview) {
  return runtime().__previewKind(preview).fromBot
}

test('previewKind: a plain chat preview is a human exchange, not a DM', () => {
  assert.equal(fromBotOf('Can you check the vault sync?'), null)
})

test('previewKind: parses the current 🤖 delivery prefix and sender handle', () => {
  assert.equal(fromBotOf('Message from 🤖 manager (@manager): Learn-share: skill installed'), 'manager')
})

test('previewKind: parses the legacy agent-prefix shape', () => {
  assert.equal(fromBotOf("Message from agent 'researcher': here is the paper"), 'researcher')
})

test('previewKind: empty or absent preview is not a DM', () => {
  assert.equal(fromBotOf(''), null)
  assert.equal(fromBotOf(undefined), null)
})

test('isGenericTitle: auto-assigned titles are generic', () => {
  const r = runtime()
  assert.equal(r.__isGenericTitle('Bot Chat'), true)
  assert.equal(r.__isGenericTitle('New chat'), true)
  assert.equal(r.__isGenericTitle(''), true)
  assert.equal(r.__isGenericTitle('Weekly review planning'), false)
})

test('generatedSessionTitle: keeps a meaningful stored title', () => {
  const r = runtime()
  assert.equal(r.__generatedSessionTitle({ title: 'Weekly review' }, 'some preview'), 'Weekly review')
})

test('generatedSessionTitle: invents a label from the preview for generic titles', () => {
  const r = runtime()
  assert.equal(r.__generatedSessionTitle({ title: 'Bot Chat' }, 'The tailnet proxy binds 100.64.0.1'), 'The tailnet proxy binds 100.64.0.1')
})

test('generatedSessionTitle: strips the bot-to-bot prefix before generating', () => {
  const r = runtime()
  const out = r.__generatedSessionTitle({ title: '' }, 'Message from 🤖 manager (@manager): Learn-share: skill installed')
  assert.match(out, /Learn-share/)
  assert.doesNotMatch(out, /Message from/)
})

test('generatedSessionTitle: caps the generated label length', () => {
  const r = runtime()
  const out = r.__generatedSessionTitle({ title: '' }, 'this is a very long preview that goes on and on and on about something or other entirely')
  assert.ok(out.length <= 34, `expected <= 34 chars, got ${out.length}: ${out}`)
})

// ── render smoke: BotRow must paint the new row furniture without throwing ──

function renderRuntime() {
  const atom = value => ({ get: () => value, set: () => undefined })
  const jsx = (type, props = {}) => ({ type, props })
  const context = {
    atom,
    jsx,
    jsxs: jsx,
    cn: (...args) => args.filter(Boolean).join(' '),
    Button: 'Button',
    BotFace: 'BotFace',
    Codicon: 'Codicon',
    ContextMenu: 'ContextMenu',
    ContextMenuContent: 'ContextMenuContent',
    ContextMenuItem: 'ContextMenuItem',
    ContextMenuSeparator: 'ContextMenuSeparator',
    ContextMenuTrigger: 'ContextMenuTrigger',
    haptic: () => undefined,
    host: {
      state: {
        profile: { get: () => 'scribe', listen: () => undefined },
        gateway: { get: () => 'idle', listen: () => undefined }
      },
      request: () => Promise.resolve({ sessions: [] }),
      openSession: () => undefined,
      newChat: () => undefined,
      navigate: () => undefined
    },
    profileColor: () => '#8b5cf6',
    queryClient: { invalidateQueries: () => undefined },
    relativeTime: () => 'now',
    useQuery: () => ({}),
    useValue: value => (value?.get ? value.get() : value),
    useState: value => [value, () => undefined],
    useEffect: () => undefined,
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } }
  }
  const code = source
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__BotRow = BotRow;\nglobalThis.__openTooltip = openTooltip;')
  vm.runInNewContext(code, context)
  return context
}

function textOf(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object') {
    if (node.props) return textOf(node.props.children ?? '')
    return Object.values(node).map(textOf).join(' ')
  }
  return ''
}

const DM_BOT = {
  name: 'scribe',
  title: 'Scribe',
  description: '',
  last_session: {
    id: 's1',
    title: 'Bot Chat',
    preview: 'Message from 🤖 manager (@manager): Learn-share: skill installed in your profile',
    last_active: Math.floor(Date.now() / 1000) - 5
  }
}

test('render: BotRow shows the sender badge and stripped DM preview', () => {
  const r = renderRuntime()
  const tree = r.__BotRow({ bot: DM_BOT, onEdit: () => undefined })
  const text = textOf(tree)
  assert.match(text, /@manager/)
  assert.match(text, /Learn-share/)
  assert.doesNotMatch(text, /Message from/)
})

test('render: BotRow renders plain previews without a badge', () => {
  const r = renderRuntime()
  const tree = r.__BotRow({
    bot: { name: 'ops', title: 'Ops', description: '', last_session: { id: 's2', title: 'Weekly review', preview: 'All hosts are healthy', last_active: 1_700_000_000 } },
    onEdit: () => undefined
  })
  const text = textOf(tree)
  assert.match(text, /All hosts are healthy/)
  assert.doesNotMatch(text, /@manager/)
  // The inline session-history chip is gone — stored history lives in the
  // Sessions workspace (context menu), so the title no longer renders inline.
  assert.doesNotMatch(text, /Weekly review/)
})

test('render: BotRow tolerates a fresh bot with no sessions yet', () => {
  const r = renderRuntime()
  const tree = r.__BotRow({ bot: { name: 'newbie', title: '', description: 'Fresh bot' }, onEdit: () => undefined })
  const text = textOf(tree)
  assert.match(text, /Fresh bot/)
})

test('tooltip: names the pinned canonical Bot Chat explicitly', () => {
  const r = renderRuntime()
  assert.equal(
    r.__openTooltip({ id: 's1', title: 'Bot Chat' }, 's1'),
    'Opens: Bot Chat (canonical)'
  )
})

test('tooltip: marks a different latest-active session so the divergence is visible', () => {
  const r = renderRuntime()
  assert.equal(
    r.__openTooltip({ id: 's2', title: 'Premarket' }, 's1'),
    'Opens: Premarket (latest active)'
  )
})

test('tooltip: falls back to the title without a marker when ids are unavailable', () => {
  const r = renderRuntime()
  assert.equal(r.__openTooltip({ title: 'Bot Chat' }, 's1'), 'Opens: Bot Chat')
})

test('tooltip: promises a new Bot Chat when the bot has no sessions yet', () => {
  const r = renderRuntime()
  assert.equal(r.__openTooltip(null, undefined), 'Opens: new Bot Chat')
})

// ── roster search: pure filter over name / handle / title / description ─────







// ── recent activity: newest-first, capped, DM-attributed ─────────────────────

function activityOf(roster, limit) {
}

const ACTIVE_ROSTER = [
  {
    name: 'scribe',
    last_session: { title: 'Bot Chat', preview: 'Message from 🤖 manager (@manager): Learn-share: skill installed', last_active: 100 }
  },
  { name: 'trader', last_session: { title: 'Premarket', preview: 'AAPL scan done', last_active: 200 } },
  { name: 'ops', last_session: { title: '', preview: 'Vault sync ok', last_active: 50 } },
  { name: 'fresh', description: 'no sessions yet' }
]





// ── handoff ledger: who threw what at whom, and whether they answered ───────

const HANDOFF_ROSTER = [
  {
    name: 'scribe',
    last_session: {
      title: 'Bot Chat',
      preview: 'Message from 🤖 manager (@manager): file the review',
      last_active: 100
    }
  },
  {
    name: 'manager',
    last_session: { title: 'Bot Chat', preview: 'Message from 🤖 scribe (@scribe): done — filed', last_active: 300 }
  },
  { name: 'trader', last_session: { title: 'Premarket', preview: 'AAPL scan done', last_active: 200 } },
  { name: 'fresh', description: 'no sessions yet' }
]

test('recentHandoffs: pairs a bot-to-bot send with the recipient reply', () => {
  const out = runtime().__recentHandoffs(HANDOFF_ROSTER)
  assert.equal(out.length, 1)
  assert.equal(out[0].from, 'manager')
  assert.equal(out[0].to, 'scribe')
  assert.equal(out[0].status, 'replied')
  assert.match(out[0].replyPreview, /done — filed/)
})

test('recentHandoffs: unanswered sends are awaiting_reply', () => {
  const out = runtime().__recentHandoffs([
    {
      name: 'scribe',
      last_session: { title: 'Bot Chat', preview: 'Message from 🤖 manager (@manager): urgent?', last_active: 100 }
    },
    { name: 'manager', last_session: { title: 'Weekly', preview: 'reviewing notes', last_active: 50 } }
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].status, 'awaiting_reply')
})

test('recentHandoffs: caps the list', () => {
  const out = runtime().__recentHandoffs(HANDOFF_ROSTER, 1)
  assert.equal(out.length, 1)
})

test('openLoopsByBot: counts only unanswered sends per sender', () => {
  const out = runtime().__openLoopsByBot([
    {
      name: 'scribe',
      last_session: { title: 'Bot Chat', preview: 'Message from 🤖 manager (@manager): do thing A', last_active: 100 }
    },
    { name: 'manager', last_session: { title: 'Bot Chat', preview: 'Message from 🤖 scribe (@scribe): did it', last_active: 300 } },
    {
      name: 'trader',
      last_session: { title: 'Bot Chat', preview: 'Message from 🤖 manager (@manager): do thing B', last_active: 90 }
    }
  ])
  // thing A was answered (scribe replied); thing B is still open.
  assert.equal(out.manager, 1)
  assert.equal(out.scribe, undefined)
})

test('needsYouOf: surfaces only unseen bot-to-bot replies', () => {
  const out = runtime().__needsYouOf(HANDOFF_ROSTER, { manager: true })
  assert.equal(out.length, 1)
  assert.equal(out[0].bot.name, 'manager')
  assert.equal(out[0].from, 'scribe')
  assert.equal(out[0].kind, 'reply_to_relay')
})

test('needsYouOf: empty when everything is read', () => {
  assert.equal(runtime().__needsYouOf(HANDOFF_ROSTER, {}).length, 0)
})

// ── fleet summary: one-glance "what is happening" counts ───────────────────

const SUMMARY_ROSTER = [
  { name: 'scribe', last_session: { preview: 'Message from 🤖 manager (@manager): do thing A', last_active: 5 } },
  { name: 'trader', last_session: { preview: 'AAPL scan done', last_active: 200 } },
  { name: 'ops', last_session: { preview: 'vault sync ok', last_active: 400 } },
  { name: 'fresh', description: 'no sessions yet' }
]

function summaryOf(roster, meta, unread, active, busy, now) {
  return runtime().__fleetSummary(roster, meta, unread, active, busy, now)
}

test('fleetSummary: counts working only for the active profile while the gateway is busy', () => {
  assert.equal(summaryOf(SUMMARY_ROSTER, {}, {}, 'ops', true, 500).working, 1)
  assert.equal(summaryOf(SUMMARY_ROSTER, {}, {}, 'ops', false, 500).working, 0)
  assert.equal(summaryOf(SUMMARY_ROSTER, {}, {}, 'trader', true, 500).working, 1)
})

test('fleetSummary: counts unread and paused from meta', () => {
  const out = summaryOf(SUMMARY_ROSTER, { trader: { paused: true } }, { ops: true }, 'ops', false, 500)
  assert.equal(out.unread, 1)
  assert.equal(out.paused, 1)
})

test('fleetSummary: counts only bots that wrote within the 90s window as active', () => {
  const roster = [
    { name: 'a', last_session: { preview: 'x', last_active: 495 } }, // 5s before now → active
    { name: 'b', last_session: { preview: 'y', last_active: 400 } }, // 100s before now → not
    { name: 'c', last_session: { preview: 'z', last_active: 0 } } // ancient → not
  ]
  const out = summaryOf(roster, {}, {}, 'ops', false, 500)
  assert.equal(out.active, 1)
})

test('fleetSummary: needYou mirrors the needs-you inbox count', () => {
  const out = summaryOf(SUMMARY_ROSTER, {}, { scribe: true }, 'ops', false, 500)
  assert.equal(out.needYou, 1)
})

test('fleetSummary: tolerates empty roster and missing meta/unread', () => {
  const out = summaryOf([], null, null, 'ops', false, 100)
  assert.equal(out.working + out.unread + out.active + out.paused + out.needYou, 0)
})

// ── handoff protocol: the command and the SOUL protocol text ────────────────

test('rawChatCommand: is the canonical handoff command shape', () => {
  const r = runtime()
  const cmd = r.__rawChatCommand('ops', 'scribe', 'hello')
  assert.match(cmd, /^hermes -p 'scribe' chat --in ~ -c "Bot Chat" -Q -q /)
  assert.match(cmd, /Message from 🤖 ops \(@ops\): hello/)
})

test('messagingProtocolSection: documents the hermes chat handoff command', () => {
  const r = runtime()
  const section = r.__messagingProtocolSection('ops', [{ name: 'scribe', description: 'Scribe' }])
  assert.match(section, /hermes -p <agent-name> chat --in ~ -c "Bot Chat"/)
  assert.doesNotMatch(section, /fleet-dispatch/)
})

// ── needs-you: who is waiting on a human, and how long ──────────────────────


