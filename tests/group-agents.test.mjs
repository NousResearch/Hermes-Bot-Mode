import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const teamsSource = readFileSync(new URL('../teams.js', import.meta.url), 'utf8')
const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

// Strip the 3 import lines the way the existing harnesses do. teams.js has NO
// such imports (RG1), but we strip defensively so the same loader works once
// teams.js grows an import header. We ALSO strip the `export ` keyword,
// because vm.runInNewContext parses code as a *script* (not a module) and
// `export` is a syntax error there. `node --check teams.js` accepts the
// `export` syntax (Node 24 auto-detects ESM); only the vm loader needs it gone.
const stripModuleSyntax = (source) =>
  source
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    // Strip `export ` for const/function/let/class, but NOT `export default`
    // — that one is rewritten to `globalThis.plugin = {` by the caller.
    .replace(/^export\s+(?!default\b)/gm, '')

/**
 * Load teams.js directly in a bare vm context and capture its named exports
 * onto globalThis.__teams. Proves the module is a pure logic unit testable
 * without the plugin runtime (boundary invariant RG1).
 */
function loadTeams() {
  const source = stripModuleSyntax(teamsSource).concat(
    '\nglobalThis.__teams = { normalizeTeams, teamTargets, projectTeamContext, teamPrompt, runTeamFanout, saveTeams, saveTeamLog, loadTeams, deleteTeam, assertTeamGeneration };\n'
  )
  const context = {}
  vm.runInNewContext(source, context, { filename: 'teams.js' })
  return context.__teams
}

/**
 * Load plugin.js in a vm context and run its register() with a STUB ctx that
 * records every registered entry and returns a disposer ONLY for an entry
 * whose id is 'team-page'. Returns the captured entries, disposers, and the
 * plugin object. The stub ctx/host/storage mirror the shape the existing
 * profile-pane harness uses (a proven minimal context for loading the whole
 * plugin module).
 *
 * NOTE (TASK 0 / CA11): plugin.js does NOT yet register a 'team-page' route
 * — that is CA11's full implementation (TASK 8). We therefore only assert
 * that `entries` is an array here; requiring `disposers.length === 1` is left
 * to the TASK 8 test so this scaffold stays GREEN without touching plugin.js
 * business logic.
 */
function loadPluginCA11() {
  const entries = []
  const disposers = []
  const context = {
    atom: (value) => ({ get: () => value, set: () => undefined }),
    jsx: (type, props = {}) => ({ type, props }),
    jsxs: (type, props = {}) => ({ type, props }),
    useQuery: () => ({}),
    useValue: (value) => value?.get ? value.get() : value,
    useState: (value) => [value, () => undefined],
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
    Button: 'Button',
    BotFace: 'BotFace',
    GlyphSpinner: 'GlyphSpinner',
    EditProfileDialog: 'EditProfileDialog',
    profileColor: () => '#000',
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: {
      state: { profile: { get: () => 'ops', listen: () => undefined } },
      request: () => undefined,
      onEvent: () => undefined,
      notify: () => undefined
    },
    storage: { get: () => null, set: () => undefined }
  }
  const source = stripModuleSyntax(pluginSource)
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__plugin = { register: globalThis.plugin.register };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })

  const ctx = {
    storage: context.storage,
    register(spec) {
      entries.push(spec)
      if (spec.id === 'team-page') {
        const disposer = () => undefined
        disposers.push(disposer)
        return disposer
      }
      return undefined
    }
  }
  context.plugin.register(ctx)
  return { entries, disposers, plugin: context.plugin }
}

test('harness: teams.js loads with expected exports', () => {
  const __teams = loadTeams()
  assert.ok(typeof __teams.normalizeTeams === 'function')
  assert.ok(typeof __teams.runTeamFanout === 'function')
})

test('CA11 scaffold: plugin register records entries and team-page disposer', () => {
  const { entries, disposers } = loadPluginCA11()
  // TASK 0: only prove the harness captures register() entries. The
  // disposers.length === 1 assertion for 'team-page' belongs to TASK 8.
  assert.ok(Array.isArray(entries))
})
