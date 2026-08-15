/**
 * teams.js — Etude-Groupbot team orchestration module.
 *
 * TASK 0 scaffold (Phase 4, TDD). Business logic is NOT implemented yet;
 * every exported function throws `not implemented`. The harness loads this
 * file directly in a bare vm context (see tests/group-agents.test.mjs) by
 * stripping any `import` header and `export` keywords, then capturing the
 * named exports onto `globalThis.__teams`.
 *
 * Boundary invariant RG1: this module imports nothing from the plugin runtime
 * (no UI framework, no host SDK). It stays a pure data/logic unit so it can be
 * unit-tested without the plugin runtime.
 */

// ── Module-local constants ──────────────────────────────────────────────────

export const TEAM_MEMBER_LIMIT = 8
export const TEAM_MAX_COUNT = 50
export const TEAM_CONTEXT_ROW_LIMIT = 24
export const TEAM_CONTEXT_CHAR_LIMIT = 24000
export const TEAM_TURN_TIMEOUT_MS = 20 * 60 * 1000
export const TEAM_GENERATION_KEY = Symbol('team.generation')
export const TEAM_PAGE_ROUTE = '/bot-team'
export const TEAM_PAGE_ID = 'team-page'

// ── Stub exports (TASK 0: not implemented) ───────────────────────────────────

export function normalizeTeams(items, rosterNames = []) {
  if (!Array.isArray(items)) return []
  const roster = new Set(Array.isArray(rosterNames) ? rosterNames : [])
  const out = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.id !== 'string' || !item.id) continue
    if (item.name != null && typeof item.name !== 'string') continue
    if (typeof item.lead !== 'string' || !item.lead) continue
    if (!Array.isArray(item.members)) continue
    // Dedupe members silently (Q1), preserve first-seen order, drop non-strings.
    const seen = new Set()
    const members = []
    for (const m of item.members) {
      if (typeof m !== 'string' || seen.has(m)) continue
      seen.add(m)
      members.push(m)
    }
    // Every member must be a known roster name (drop team if any unknown).
    if (!members.every((m) => roster.has(m))) continue
    // Lead must be one of the members.
    if (!members.includes(item.lead)) continue
    // Size bounds: >=2 and <=TEAM_MEMBER_LIMIT.
    if (members.length < 2 || members.length > TEAM_MEMBER_LIMIT) continue
    const team = { id: item.id, lead: item.lead, members }
    if (typeof item.name === 'string') team.name = item.name
    out.push(team)
  }
  return out.length > TEAM_MAX_COUNT ? out.slice(0, TEAM_MAX_COUNT) : out
}

export function teamTargets() {
  throw new Error('not implemented')
}

export function projectTeamContext() {
  throw new Error('not implemented')
}

export function teamPrompt() {
  throw new Error('not implemented')
}

export function runTeamFanout() {
  throw new Error('not implemented')
}

export function saveTeams() {
  throw new Error('not implemented')
}

export function saveTeamLog() {
  throw new Error('not implemented')
}

export function loadTeams() {
  throw new Error('not implemented')
}

export function patchTeamReply() {
  throw new Error('not implemented')
}

export function deleteTeam() {
  throw new Error('not implemented')
}

export function assertTeamGeneration() {
  throw new Error('not implemented')
}
