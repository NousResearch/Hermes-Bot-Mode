import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load(activeSessionId = 'sess-1') {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }
  const registered = []
  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: {
      request: async () => ({}),
      notify: () => undefined,
      state: { profile: { get: () => 'researcher', listen: () => undefined } },
      activeSessionId: { get: () => activeSessionId }
    }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__api = { $botMeta, $selectedBot, plugin };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  context.plugin.register({
    storage: { get: () => null, set: () => undefined },
    register: item => registered.push(item)
  })
  return {
    ...context.__api,
    middleware: registered.find(item => item.id === 'mention-middleware')
  }
}

test('unit: /new in the bot chat becomes /compact', async () => {
  const runtime = load('sess-1')
  runtime.$selectedBot.set('researcher')
  runtime.$botMeta.set({ researcher: { chat: 'sess-1' } })
  const draft = await runtime.middleware.data.handler({ text: '/new' })
  assert.equal(draft.text, '/compact')
})

test('unit: /reset in the bot chat becomes /compact', async () => {
  const runtime = load('sess-1')
  runtime.$selectedBot.set('researcher')
  runtime.$botMeta.set({ researcher: { chat: 'sess-1' } })
  const draft = await runtime.middleware.data.handler({ text: '/reset' })
  assert.equal(draft.text, '/compact')
})

test('regression: /new in some other session is left alone', async () => {
  const runtime = load('scratch-9')
  runtime.$selectedBot.set('researcher')
  runtime.$botMeta.set({ researcher: { chat: 'sess-1' } })
  const draft = await runtime.middleware.data.handler({ text: '/new' })
  assert.equal(draft.text, '/new')
})
