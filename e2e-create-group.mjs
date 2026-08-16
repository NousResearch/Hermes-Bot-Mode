/**
 * E2E test: "générer un groupe de bot" via le plugin Hermes DÉPLOYÉ.
 *
 * Simule un host Hermes complet (request/onEvent) et exerce le vrai
 * plugin.js (teams.js inliné) pour :
 *   1. createTeam → persiste Company A {alice, bob, carol}
 *   2. runTeamFanout → orchestre un tour (sessions isolées / membre)
 *   3. vérifie agrégation + isolation (RG4/RG6)
 *
 * Aucune dépendance UI — valide la logique de groupe de bout en bout.
 */
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

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

// ── Fake Hermes host: each session.create returns an id; prompt.submit
// triggers a message.complete event with a canned reply per member. ──
function makeHost() {
  const handlers = []
  const sessionToMember = new Map()
  let sessionSeq = 0
  const repliesByMember = { alice: 'ALICE: bonjour équipe', bob: 'BOB: reçu', carol: 'CAROL: ok' }
  return {
    host: {
      state: { profile: { get: () => 'ops', listen: () => undefined } },
      request: async (rpc, payload) => {
        if (rpc === 'session.create') {
          const id = `sess-${++sessionSeq}`
          const member = payload.title?.split('·')?.[1]?.trim()
          sessionToMember.set(id, member) // map session → member
          return { session_id: id }
        }
        if (rpc === 'prompt.submit') {
          const sid = payload.session_id
          const member = sessionToMember.get(sid)
          setTimeout(() => {
            for (const h of handlers) h({ session_id: sid, content: repliesByMember[member] || `REPLY:${member}` })
          }, 5)
          return { ok: true }
        }
        return {}
      },
      onEvent: (ev, cb) => { handlers.push(cb); return () => {} },
      off: () => {},
      notify: () => {}
    },
    handlers
  }
}

const { host } = makeHost()

const context = {
  atom: (v) => ({ get: () => v, set: () => undefined }),
  jsx: (t, p = {}) => ({ type: t, props: p }),
  jsxs: (t, p = {}) => ({ type: t, props: p }),
  useQuery: () => ({}), useValue: (v) => (v?.get ? v.get() : v),
  useState: (v) => [v, () => undefined], useEffect: () => undefined, useRef: () => ({ current: null }),
  Button: 'B', BotFace: 'B', GlyphSpinner: 'G', EditProfileDialog: 'E', profileColor: () => '#000',
  PALETTE_AREA: 'p', COMPOSER_AREAS: { middleware: 'm', routes: 'routes' },
  document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
  host,
  storage: makeStore(),
  Teams: {},
  setTimeout,
  clearTimeout,
  console
}

const pluginSrc = stripModuleSyntax(pluginSource)
  .replace(/import\s+\*\s+as\s+Teams\s+from\s+['"]\.\/teams\.js['"]\r?\n/m, '')
  .replace('export default {', 'globalThis.plugin = {')
vm.runInNewContext(pluginSrc, context, { filename: 'deployed-plugin.js' })

const registered = []
context.plugin.register({ storage: context.storage, register: (s) => { registered.push(s); return () => undefined } })

console.log('▶ Génération d\'un groupe de bot (Company A)...')

// 1. createTeam
const storage = context.storage
const team = await context.plugin.createTeam(
  { id: 'company-a', name: 'Company A', lead: 'alice', members: ['alice', 'bob', 'carol'] },
  ['alice', 'bob', 'carol'],
  storage
)
assert.equal(team.id, 'company-a')
assert.equal(storage.data.get('teams-v1')[0].members.join(','), 'alice,bob,carol')
console.log('  ✓ Équipe créée + persistée:', team.name, '→', team.members.join(', '))

// 2. runTeamFanout — real orchestration with fake host
// We need to drive session.create to map session→member. Our fake host encodes
// the member in the title; runTeamFanout passes `title` from team/opts.
const generation = context.plugin.Teams.getCurrentGeneration()
const replies = await context.plugin.Teams.runTeamFanout(
  team,
  'Salut équipe, on lance le projet ?',
  { host, storage, generation, turnId: 't1', timeoutMs: 2000 }
)
assert.equal(replies.alice, 'ALICE: bonjour équipe')
assert.equal(replies.bob, 'BOB: reçu')
assert.equal(replies.carol, 'CAROL: ok')
console.log('  ✓ Tour orchestré (sessions isolées / membre):')
for (const [m, r] of Object.entries(replies)) console.log(`      ${m} → ${r}`)

// 3. Isolation check: a non-member is never routed
const targets = context.plugin.Teams.teamTargets('@alice et @dave discutent', team.members, ['alice', 'bob', 'carol'])
assert.equal(targets.targets.join(','), 'alice') // dave is NOT a member → excluded (RG4)
assert.equal(targets.unknown.join(','), 'dave')
console.log('  ✓ Isolation RG4: @dave (non-membre) exclu du routage →', JSON.stringify(targets))

console.log('\n🎉 E2E "générer un groupe de bot" RÉUSSI — groupe créé, tour orchestré, isolation validée.')
