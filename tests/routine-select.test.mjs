import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function loadSelect() {
  const start = source.indexOf('const BOT_TAG_RE =')
  const end = source.indexOf('function shellQuote(')
  const context = {}
  const section = source
    .slice(start, end)
    .concat('\nglobalThis.__select = { selectRoutineJobs };')
  vm.runInNewContext(section, context, { filename: 'select-routines.js' })
  return context.__select.selectRoutineJobs
}

const selectRoutineJobs = loadSelect()

const jobs = [
  { job_id: 'a', name: '[bot:research] Morning digest', enabled: true },
  { job_id: 'b', name: '[bot:default] Health sweep', enabled: true },
  { job_id: 'c', name: 'Untagged CLI job', enabled: true },
  { job_id: 'd', name: '[bot:archivist] Vault sweep', enabled: true }
]

test('default bot sees untagged jobs when it owns the store', () => {
  const view = selectRoutineJobs({ jobs }, null, [], 'default', 'default')
  assert.deepEqual(
    view.jobs.map(j => j.job_id).sort(),
    ['b', 'c'] // tagged default + untagged
  )
  assert.equal(view.ownsStore, true)
})

test('another bot on the same gateway does NOT see untagged jobs', () => {
  const view = selectRoutineJobs({ jobs }, null, [], 'research', 'default')
  assert.deepEqual(view.jobs.map(j => j.job_id), ['a'])
  assert.equal(view.ownsStore, false)
})

test('untagged jobs are hidden for a bot whose profile runs its own gateway (#37)', () => {
  // archivist runs its own gateway → the pane reads the DEFAULT store, not
  // archivist's. Untagged jobs in the default store are NOT archivist's.
  const view = selectRoutineJobs({ jobs }, null, [], 'archivist', 'default')
  assert.deepEqual(view.jobs.map(j => j.job_id), ['d'])
  assert.equal(view.ownsStore, false)
})

test('scoped read from a separate-gateway bot owns its store (#37)', () => {
  // On a gateway with profile-scoped cron support, archivist's OWN store is
  // read (data.scoped=true) — untagged jobs there belong to archivist.
  const own = [
    { job_id: 'e', name: '[bot:archivist] Vault sweep', enabled: true },
    { job_id: 'f', name: 'Untagged CLI job in archivist store', enabled: true }
  ]
  const view = selectRoutineJobs({ jobs: own, scoped: true }, null, [], 'archivist', 'default')
  assert.deepEqual(view.jobs.map(j => j.job_id), ['e', 'f'])
  assert.equal(view.ownsStore, true)
})

test('missing gateway profile defaults to owning the store', () => {
  const view = selectRoutineJobs({ jobs }, null, [], 'default', undefined)
  assert.equal(view.ownsStore, true)
  assert.ok(view.jobs.some(j => j.job_id === 'c'))
})

test('failed refresh keeps the last good list', () => {
  const view = selectRoutineJobs(null, new Error('boom'), jobs, 'research', 'default')
  assert.equal(view.live, null)
  assert.deepEqual(view.jobs.map(j => j.job_id), ['a'])
})
