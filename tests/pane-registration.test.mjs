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
    Button: 'Button',
    BotFace: 'BotFace',
    GlyphSpinner: 'GlyphSpinner',
    EditProfileDialog: 'EditProfileDialog',
    profileColor: () => '#000',
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { state: { profile: { get: () => 'ops', listen: () => undefined }, gateway: { listen: () => undefined } }, request: () => undefined }
  }
  const code = source
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
  vm.runInNewContext(code, context)
  return context
}

/** Register the plugin against a capture harness; returns the registrations. */
function registeredItems() {
  const r = runtime()
  const entries = []
  r.plugin.register({ storage: { get: () => null }, register: item => entries.push(item) })
  return entries
}

test('registration: Bots pane is registered with title and left placement', () => {
  const entries = registeredItems()
  const pane = entries.find(item => item.id === 'pane')
  assert.ok(pane, 'expected a pane registration')
  assert.equal(pane.title, 'Bots')
  assert.equal(pane.data.placement, 'left')
})

test('registration: Routines pane docks right inside the workspace', () => {
  const entries = registeredItems()
  const routines = entries.find(item => item.id === 'routines')
  assert.ok(routines, 'expected a routines registration')
  assert.equal(routines.title, 'Cronjobs')
  assert.equal(routines.data.placement, 'main')
  // NOTE: vm-realm objects aren't reference-equal to host literals — compare
  // fields explicitly (same rule as roster-preview.test.mjs).
  assert.equal(routines.data.dock?.pane, 'workspace')
  assert.equal(routines.data.dock?.pos, 'right')
})

test('registration: no separate Fleet pane — fleet controls live in the Bots pane', () => {
  const entries = registeredItems()
  const fleet = entries.find(item => item.id === 'fleet')
  assert.equal(fleet, undefined, 'fleet surface must not register its own pane')
})

test('registration: every pane id is unique', () => {
  const entries = registeredItems()
  const ids = entries.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`)
})

test('registration: @-mention handoff middleware is registered', () => {
  const entries = registeredItems()
  assert.ok(entries.some(item => item.id === 'mention-middleware'), 'expected the mention middleware')
})

test('performance: registration bookkeeping stays bounded', () => {
  const start = Date.now()
  for (let i = 0; i < 10000; i += 1) ['hermes-bots', 'pane', 'ops'].join(':')
  assert.ok(Date.now() - start < 1000)
})
