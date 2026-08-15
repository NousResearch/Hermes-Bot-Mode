/**
 * teams.js — Etude-Groupbot team orchestration module.
 *
 * TASK 0 scaffold (Phase 4, TDD). Business logic is NOT implemented yet;
 * every exported function throws `not implemented`. The harness loads this
 * file directly in a bare vm context (see tests/group-agents.test.mjs) by
 * stripping any `import` header and `export` keywords, then capturing the
 * named exports onto `globalThis.__teams`.
 *
 * Boundary invariant RG1: NO top-level import from '@hermes/plugin-sdk'.
 * This module stays a pure data/logic unit so it can be unit-tested without
 * the plugin runtime.
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

export function normalizeTeams() {
  throw new Error('not implemented')
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
