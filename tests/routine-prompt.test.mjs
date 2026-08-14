import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load() {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const context = {
    atom, PALETTE_AREA: 'palette', COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: { state: { profile: { listen: () => undefined } } }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__routines = { routinePrompt, normalizedProfileName };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return context
}

test('unit: direct execution is selected for the active bot profile', () => {
  const { __routines } = load()
  assert.equal(__routines.normalizedProfileName(' Default '), 'default')
  assert.equal(__routines.routinePrompt('default', 'Health', 'Collect status', ' DEFAULT '), 'Collect status')
})

test('integration: a different active profile retains the delegated routine wrapper', () => {
  const { __routines } = load()
  const prompt = __routines.routinePrompt('research', 'Digest', 'Summarize findings', 'default')
  assert.match(prompt, /hermes -p 'research' chat/)
  assert.match(prompt, /\[Scheduled routine\] Summarize findings/)
})

test('security: delegated routine arguments remain literal shell values', () => {
  const { __routines } = load()
  const title = 'Audit $(printf TITLE_EXPANDED) `printf TITLE_TICK` \'quoted\''
  const instruction = 'Line one $(printf TASK_EXPANDED) `printf TASK_TICK`\nLine two \'quoted\''
  const prompt = __routines.routinePrompt('research', title, instruction, 'default')
  const command = prompt.slice(prompt.indexOf('hermes '), prompt.lastIndexOf('\n\nIf the command'))
  const script = `hermes() { printf '%s\\037' "$@"; }\n${command}`
  const result = spawnSync('sh', ['-c', script], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.split('\x1f').slice(0, -1), [
    '-p',
    'research',
    'chat',
    '-c',
    `Routine: ${title}`,
    '-q',
    `[Scheduled routine] ${instruction}`
  ])
})

test('regression: Create Cronjob passes the active profile to routinePrompt', () => {
  assert.match(pluginSource, /prompt: routinePrompt\(bot, title, task, activeProfile\)/)
  const { __routines } = load()
  const instruction = 'Keep "quoted" output intact'
  assert.equal(__routines.routinePrompt('ops', 'Check', instruction, 'ops'), instruction)
  assert.doesNotMatch(__routines.routinePrompt('ops', 'Check', instruction, 'ops'), /hermes -p/)
})

test('system: the direct-file plugin still registers its panes', () => {
  const runtime = load()
  const registered = []
  runtime.plugin.register({ storage: { get: () => null }, register: entry => registered.push(entry) })
  assert.equal(registered.some(entry => entry.id === 'pane'), true)
  assert.equal(registered.some(entry => entry.id === 'routines'), true)
})

test('performance: direct prompt selection remains bounded', t => {
  const { __routines } = load()
  const start = Date.now()
  for (let index = 0; index < 10000; index += 1) __routines.routinePrompt('ops', 'Check', 'Inspect', 'ops')
  const elapsed = Date.now() - start
  t.diagnostic(`10,000 direct prompt selections: ${elapsed} ms`)
  assert.ok(elapsed < 1000)
})