import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function transformedSource() {
  return pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__rosterFns = { rosterErrorText, isProfilesListUnsupported, rosterRefreshNotice, rosterUnavailableMessage }; globalThis.__BotsPane = BotsPane; globalThis.__BotRow = BotRow; globalThis.__useRoster = useRoster;\n')
}

function createRuntime(query) {
  const state = new Map()
  const atom = initial => {
    const slot = { get: () => state.get(slot), set: value => state.set(slot, value) }
    state.set(slot, initial)
    return slot
  }
  const jsx = (type, props = {}) => ({ type, props })
  const context = {
    atom, useQuery: () => query.current,
    useValue: value => typeof value === 'object' && value?.get ? value.get() : value,
    useEffect: () => undefined, useState: initial => [initial, () => undefined], jsx, jsxs: jsx,
    Button: 'Button', Codicon: 'Codicon', Tip: 'Tip', GlyphSpinner: 'GlyphSpinner', EmptyState: 'EmptyState', ScrollArea: 'ScrollArea',
    CreateAgentDialog: 'CreateAgentDialog', EditProfileDialog: 'EditProfileDialog', PALETTE_AREA: 'palette', COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { state: { gateway: 'open', profile: { listen: () => undefined } }, request: (...args) => query.calls.push(args), notify: () => undefined }
  }
  vm.runInNewContext(transformedSource(), context, { filename: 'plugin.js' })
  return context
}

function contains(node, predicate) {
  if (node == null) return false
  if (predicate(node)) return true
  return typeof node === 'object' ? Object.values(node).some(value => contains(value, predicate)) : false
}

function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return typeof node === 'object' ? Object.values(node).map(textOf).join(' ') : ''
}

test('unit: classifies unsupported profiles.list errors without restart guidance', () => {
  const helpers = createRuntime({ current: {}, calls: [] }).__rosterFns
  assert.equal(helpers.isProfilesListUnsupported(new Error('Unknown RPC method profiles.list')), true)
  assert.equal(helpers.isProfilesListUnsupported(new Error('connection reset')), false)
  assert.match(helpers.rosterRefreshNotice(new Error('unsupported method profiles.list')), /last successful Bot roster/)
  assert.doesNotMatch(helpers.rosterRefreshNotice(new Error('unsupported method profiles.list')), /restart/i)
})

test('integration: keeps the last successful roster visible after a refresh error', () => {
  const query = { current: { data: { profiles: [{ name: 'alpha' }] }, error: null, isLoading: false, refetch: () => undefined }, calls: [] }
  const runtime = createRuntime(query)
  runtime.__BotsPane()
  query.current = { data: undefined, error: new Error('Unknown RPC method profiles.list'), isLoading: false, refetch: () => undefined }
  const tree = runtime.__BotsPane()
  assert.equal(contains(tree, node => node?.type === runtime.__BotRow && node.props?.bot?.name === 'alpha'), true)
  assert.match(textOf(tree), /does not support profiles\.list/)
  assert.doesNotMatch(textOf(tree), /restart/i)
})

test('regression: continues to query profiles.list with the roster key', async () => {
  const query = { current: null, calls: [] }
  const runtime = createRuntime(query)
  runtime.useQuery = config => { query.current = config; return config }
  runtime.__useRoster()
  assert.deepEqual(Array.from(query.current.queryKey), ['hermes-bots', 'roster'])
  await query.current.queryFn()
  assert.equal(query.calls[0][0], 'profiles.list')
  assert.deepEqual({ ...query.calls[0][1] }, {})
})

test('system: the direct-file plugin still registers the Bots pane', () => {
  const runtime = createRuntime({ current: {}, calls: [] })
  const registered = []
  runtime.plugin.register({ storage: { get: () => null }, register: entry => registered.push(entry) })
  assert.equal(registered.some(entry => entry.id === 'pane' && entry.title === 'Bots'), true)
  assert.equal(registered.some(entry => entry.id === 'new-agent'), true)
})

test('performance: fallback classification stays bounded for repeated refresh errors', t => {
  const helpers = createRuntime({ current: {}, calls: [] }).__rosterFns
  const start = Date.now()
  for (let index = 0; index < 10000; index += 1) helpers.isProfilesListUnsupported(new Error('Unknown RPC method profiles.list'))
  const elapsed = Date.now() - start
  t.diagnostic(`10,000 classifications: ${elapsed} ms`)
  assert.ok(elapsed < 1000)
})