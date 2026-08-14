import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')
const start = source.indexOf('function BotRow(')
const end = source.indexOf('// ── model picker', start)

assert.notEqual(start, -1, 'BotRow declaration is missing')
assert.notEqual(end, -1, 'BotRow section delimiter is missing')

const botRowSource = source.slice(start, end)

test('regression: opening a pinned canonical chat does not replace it from a bounded session list', () => {
  assert.match(botRowSource, /let id = meta\?\.chat/)
  assert.match(botRowSource, /host\.openSession\(id, \{ profile: bot\.name \}\)/)
  assert.doesNotMatch(botRowSource, /host\.request\('session\.list'/)
  assert.doesNotMatch(botRowSource, /id = rows\[0\]\.id/)
})
