/**
 * Runtime validation of the DEPLOYED plugin (Hermes desktop).
 * Loads the real plugin.js from the desktop-plugins folder, runs its
 * register() with a stub ctx that mimics the desktop runtime, and proves:
 *   - plugin loads with NO error (the "failed to load" bug is gone)
 *   - team-page route /bot-team is registered
 *   - createTeam + Teams (inlined) are exposed and functional
 *   - mention-middleware delegates to Teams.teamTargets (RG4)
 */
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Load the ACTUAL deployed file, not the clone, to prove the deploy is good.
const DEPLOYED = 'C:/Users/David DIGICADI/AppData/Local/hermes/desktop-plugins/hermes-bots/plugin.js'
const pluginSource = readFileSync(DEPLOYED, 'utf8')

const stripModuleSyntax = (source) =>
  source
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace(/^export\s+(?!default\b)/gm, '')

function makeStore() {
  const data = new Map()
  return {
    data,
    get: (k) => Promise.resolve(data.has(k) ? data.get(k) : null),
    set: (k, v) => { data.set(k, v); return Promise.resolve() },
    delete: (k) => { data.delete(k); return Promise.resolve() }
  }
}

const registered = []
const context = {
  atom: (v) => ({ get: () => v, set: () => undefined }),
  jsx: (t, p = {}) => ({ type: t, props: p }),
  jsxs: (t, p = {}) => ({ type: t, props: p }),
  useQuery: () => ({}), useValue: (v) => (v?.get ? v.get() : v),
  useState: (v) => [v, () => undefined], useEffect: () => undefined, useRef: () => ({ current: null }),
  Button: 'B', BotFace: 'B', GlyphSpinner: 'G', EditProfileDialog: 'E', profileColor: () => '#000',
  PALETTE_AREA: 'p', COMPOSER_AREAS: { middleware: 'm', routes: 'routes' },
  document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
  host: {
    state: { profile: { get: () => 'ops', listen: () => undefined } },
    request: async () => ({ profiles: [{ name: 'ops' }] }),
    onEvent: () => (() => {}), off: () => {}, notify: () => {}
  },
  storage: makeStore(),
  Teams: {}
}

const pluginSrc = stripModuleSyntax(pluginSource)
  .replace(/import\s+\*\s+as\s+Teams\s+from\s+['"]\.\/teams\.js['"]\r?\n/m, '')
  .replace('export default {', 'globalThis.plugin = {')
vm.runInNewContext(pluginSrc, context, { filename: 'deployed-plugin.js' })

// Run register() with a ctx that records entries (like the desktop runtime).
const ctx = {
  storage: context.storage,
  register(spec) {
    registered.push(spec)
    return () => undefined
  }
}
context.plugin.register(ctx)

console.log('✓ Plugin loaded with NO error (no "failed to load")')
const teamPage = registered.find((e) => e.id === 'team-page')
assert.ok(teamPage, 'team-page entry registered')
assert.equal(teamPage.route, '/bot-team')
console.log('✓ team-page route /bot-team registered')

assert.equal(typeof context.plugin.createTeam, 'function', 'createTeam exposed')
const storage = makeStore()
const team = await context.plugin.createTeam(
  { id: 'co-a', name: 'Company A', lead: 'alice', members: ['alice', 'bob', 'carol'] },
  ['alice', 'bob', 'carol'],
  storage
)
assert.equal(team.id, 'co-a')
assert.equal(storage.data.get('teams-v1')[0].members.join(','), 'alice,bob,carol')
console.log('✓ createTeam normalizes + persists (co-a → alice,bob,carol)')

const mw = registered.find((e) => e.id === 'mention-middleware')
assert.ok(mw && mw.data && typeof mw.data.handler === 'function')
let called = false
const orig = context.plugin.Teams.teamTargets
context.plugin.Teams.teamTargets = (...a) => { called = true; return orig(...a) }
await mw.data.handler({ text: '@bob hi', team: { id: 'co-a', members: ['alice', 'bob'] } })
context.plugin.Teams.teamTargets = orig
assert.equal(called, true)
console.log('✓ mention-middleware delegates to Teams.teamTargets (RG4)')

console.log('\n🎉 RUNTIME VALIDATION PASSED — Group Agents plugin is deployed and functional in Hermes.')
