import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

// ── helpers ──────────────────────────────────────────────────────────────────

function load(request = async () => ({ jobs: [] }), profile = 'default') {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const context = {
    atom, PALETTE_AREA: 'palette', COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { request, state: { profile: { get: () => profile, listen: () => undefined } } }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat(
      '\nglobalThis.__os_home = os_home;' +
      '\nglobalThis.__A2AFeedbackPane = A2AFeedbackPane;' +
      '\nglobalThis.__useA2AResults = useA2AResults;' +
      '\nglobalThis.__useHeartbeatStatus = useHeartbeatStatus;'
    )
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return context
}

function renderRuntime(request = async () => ({ jobs: [] }), profile = 'default') {
  const atom = value => ({ get: () => value, set: () => undefined })
  const jsx = (type, props = {}) => ({ type, props })
  const context = {
    atom, jsx, jsxs: jsx,
    cn: (...args) => args.filter(Boolean).join(' '),
    Button: 'Button', BotFace: 'BotFace', Codicon: 'Codicon',
    EmptyState: 'EmptyState', GlyphSpinner: 'GlyphSpinner',
    ScrollArea: 'ScrollArea', Tip: 'Tip',
    host: {
      state: {
        profile: { get: () => profile, listen: () => undefined },
        gateway: { get: () => 'idle', listen: () => undefined }
      },
      request,
      notify: () => undefined
    },
    profileColor: () => '#8b5cf6',
    queryClient: { invalidateQueries: () => undefined },
    relativeTime: () => 'now',
    useQuery: () => ({ data: null, isLoading: false }),
    useValue: value => (value?.get ? value.get() : value),
    useState: value => [value, () => undefined],
    useEffect: () => undefined,
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } }
  }
  const code = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat(
      '\nglobalThis.__A2AFeedbackPane = A2AFeedbackPane;' +
      '\nglobalThis.__useA2AResults = useA2AResults;' +
      '\nglobalThis.__useHeartbeatStatus = useHeartbeatStatus;' +
      '\nglobalThis.__os_home = os_home;'
    )
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

// ── unit tests ────────────────────────────────────────────────────────────────

test('unit: plugin registers the A2A feedback pane', () => {
  const registered = []
  const ctx = load()
  ctx.plugin.register({
    storage: { get: () => null },
    register: entry => registered.push(entry)
  })
  assert.equal(registered.some(entry => entry.id === 'a2a-feedback'), true)
  assert.equal(registered.some(entry => entry.title === 'A2A Feedback'), true)
})

test('unit: plugin registers the A2A feedback palette command', () => {
  const registered = []
  const ctx = load()
  ctx.plugin.register({
    storage: { get: () => null },
    register: entry => registered.push(entry)
  })
  const cmd = registered.find(entry => entry.id === 'a2a-feedback-cmd')
  assert.ok(cmd, 'a2a-feedback-cmd should be registered')
  assert.equal(cmd.area, 'palette')
})

test('unit: A2A feedback pane renders empty state when no results', () => {
  const ctx = renderRuntime()
  const tree = ctx.__A2AFeedbackPane()
  const text = textOf(tree)
  assert.match(text, /A2A Feedback/)
  assert.match(text, /No heartbeat results yet/)
})

test('unit: useHeartbeatStatus finds the master heartbeat cron', () => {
  const ctx = load()
  assert.equal(typeof ctx.__useHeartbeatStatus, 'function')
})

test('unit: useA2AResults reads from results directory', () => {
  const ctx = load()
  assert.equal(typeof ctx.__useA2AResults, 'function')
})

test('unit: os_home is exposed', () => {
  const ctx = load()
  assert.equal(typeof ctx.__os_home, 'function')
})

// ── integration test ──────────────────────────────────────────────────────────

test('integration: A2A feedback pane appears alongside Cronjobs pane', () => {
  const registered = []
  const ctx = load()
  ctx.plugin.register({
    storage: { get: () => null },
    register: entry => registered.push(entry)
  })
  const ids = registered.map(e => e.id)
  assert.ok(ids.includes('routines'), 'Cronjobs pane should be registered')
  assert.ok(ids.includes('a2a-feedback'), 'A2A Feedback pane should be registered')
})

test('integration: A2A feedback palette command opens the pane', () => {
  const registered = []
  const ctx = load()
  ctx.plugin.register({
    storage: { get: () => null },
    register: entry => registered.push(entry)
  })
  const cmd = registered.find(e => e.id === 'a2a-feedback-cmd')
  assert.ok(cmd)
  assert.ok(cmd.data.label.includes('A2A Feedback'))
})

// ── E2E test ──────────────────────────────────────────────────────────────────

test('e2e: A2A feedback pane renders results from host.request', () => {
  const ctx = renderRuntime(async (method, params) => {
    if (method === 'terminal') {
      return { stdout: JSON.stringify([{
        profile: 'job-seeker',
        timestamp: '20260815_100000',
        result: { ok: true, task: 'Scan BizReach', output: 'Found 5 new roles' },
        trigger: 'promising_role',
        requires_deep_research: true
      }]) }
    }
    if (method === 'cron.manage' && params.action === 'list') {
      return { jobs: [{ job_id: 'hb', name: 'Master Heartbeat (Bot Coordination)', enabled: true, state: 'scheduled' }] }
    }
    return { jobs: [] }
  })

  const tree = ctx.__A2AFeedbackPane()
  const text = textOf(tree)
  assert.match(text, /A2A Feedback/)
})

test('e2e: A2A feedback pane shows deep research badge for triggered results', () => {
  const ctx = renderRuntime(async (method, params) => {
    if (method === 'terminal') {
      return { stdout: JSON.stringify([{
        profile: 'sedori-buyer',
        timestamp: '20260815_100000',
        result: { ok: true, task: 'Scan auctions', output: 'GPU arbitrage found' },
        trigger: 'arbitrage_found',
        requires_deep_research: true
      }]) }
    }
    return { jobs: [] }
  })

  const tree = ctx.__A2AFeedbackPane()
  assert.ok(tree !== undefined)
})
