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

// The complete public surface of teams.js: 11 functions + 8 constants.
const TEAMS_FUNCTIONS = [
  'normalizeTeams', 'teamTargets', 'projectTeamContext', 'teamPrompt',
  'runTeamFanout', 'saveTeams', 'saveTeamLog', 'loadTeams',
  'patchTeamReply', 'deleteTeam', 'assertTeamGeneration'
]
const TEAMS_CONSTANTS = [
  'TEAM_MEMBER_LIMIT', 'TEAM_MAX_COUNT', 'TEAM_CONTEXT_ROW_LIMIT',
  'TEAM_CONTEXT_CHAR_LIMIT', 'TEAM_TURN_TIMEOUT_MS', 'TEAM_GENERATION_KEY',
  'TEAM_PAGE_ROUTE', 'TEAM_PAGE_ID'
]

/**
 * Load teams.js directly in a bare vm context and capture ALL its named
 * exports (11 functions + 8 constants) onto globalThis.__teams. Proves the
 * module is a pure logic unit testable without the plugin runtime (RG1).
 */
function loadTeams() {
  const names = [...TEAMS_FUNCTIONS, ...TEAMS_CONSTANTS]
  const capture = `\nreturn { ${names.join(', ')} };\n`
  // Wrap in an IIFE and run in THIS realm so values the module returns share
  // the host's Array/Object prototypes (deepStrictEqual is prototype-aware).
  // The IIFE keeps the module's const/function declarations function-scoped,
  // so repeated loadTeams() calls don't collide on redeclaration.
  const source = `(function () {\n${stripModuleSyntax(teamsSource)}${capture}})()`
  return vm.runInThisContext(source, { filename: 'teams.js' })
}

/**
 * Load plugin.js in a vm context and run its register() with a STUB ctx that
 * records every registered entry and returns a disposer ONLY for an entry
 * whose id is 'team-page'. Returns the captured entries, disposers, and the
 * plugin object.
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

test('harness: teams.js loads with all 11 function exports', () => {
  const __teams = loadTeams()
  for (const name of TEAMS_FUNCTIONS) {
    assert.equal(typeof __teams[name], 'function', `${name} should be a function`)
  }
  const fnCount = TEAMS_FUNCTIONS.filter((n) => typeof __teams[n] === 'function').length
  assert.equal(fnCount, 11)
})

test('D1: teams.js source has NO import from @hermes/plugin-sdk or react (RG1)', () => {
  assert.equal(/from\s+['"]@hermes\/plugin-sdk|react/.test(teamsSource), false)
})

test('CA11 scaffold: plugin register records 4 entries', () => {
  const { entries } = loadPluginCA11()
  assert.ok(Array.isArray(entries))
  assert.equal(entries.length, 4)
})

// ── normalizeTeams (pure function, no IO) ────────────────────────────────────

test('CA1: valid team is normalized and kept', () => {
  const { normalizeTeams } = loadTeams()
  const result = normalizeTeams(
    [{ id: 'co-a', name: 'Company A', lead: 'alice', members: ['alice', 'bob', 'carol'] }],
    ['alice', 'bob', 'carol']
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].lead, 'alice')
  assert.deepEqual(result[0].members, ['alice', 'bob', 'carol'])
})

test('CA2: unknown member and <2 members are dropped', () => {
  const { normalizeTeams } = loadTeams()
  const result = normalizeTeams(
    [
      { id: 'x', lead: 'alice', members: ['alice', 'ghost', 'bob'] },
      { id: 'y', lead: 'bob', members: ['bob'] }
    ],
    ['alice', 'bob']
  )
  assert.deepEqual(result, [])
})

test('CA2b: team with 9 members (> TEAM_MEMBER_LIMIT=8) is dropped', () => {
  const { normalizeTeams } = loadTeams()
  const roster = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
  const result = normalizeTeams(
    [{ id: 'big', name: 'B', lead: 'a', members: roster.slice() }],
    roster
  )
  assert.deepEqual(result, [])
})

test('CA2c: lead not in members is dropped', () => {
  const { normalizeTeams } = loadTeams()
  const result = normalizeTeams(
    [{ id: 'bad', name: 'B', lead: 'x', members: ['alice', 'bob'] }],
    ['alice', 'bob']
  )
  assert.deepEqual(result, [])
})

test('CA2d: duplicate members are silently deduped (Q1)', () => {
  const { normalizeTeams } = loadTeams()
  const result = normalizeTeams(
    [{ id: 'dup', name: 'D', lead: 'alice', members: ['alice', 'alice', 'bob'] }],
    ['alice', 'bob']
  )
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].members, ['alice', 'bob'])
})

test('CA2e: more than TEAM_MAX_COUNT valid teams are capped at 50', () => {
  const { normalizeTeams, TEAM_MAX_COUNT } = loadTeams()
  const items = []
  for (let i = 0; i < 60; i++) {
    items.push({ id: `t${i}`, name: `t${i}`, lead: 'alice', members: ['alice', 'bob'] })
  }
  const result = normalizeTeams(items, ['alice', 'bob'])
  assert.equal(result.length, TEAM_MAX_COUNT)
  assert.equal(result.length, 50)
})
