import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

/** VM harness — same shape as bot-toggle.test.mjs: strips the SDK/react
 *  imports, runs the plugin source, and exposes the cost-classifier
 *  functions under globalThis.__cost. */
function load({ locale = 'en-US' } = {}) {
  const values = new Map()
  const atom = initial => {
    const slot = { get: () => values.get(slot), set: value => values.set(slot, value) }
    values.set(slot, initial)
    return slot
  }

  const host = {
    state: { profile: { get: () => 'default', listen: () => undefined } },
    notify: () => undefined,
    request: () => Promise.resolve({})
  }

  const context = {
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    navigator: { language: locale },
    host,
    queryClient: { invalidateQueries: () => undefined }
  }

  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__cost = { isFreeModel, botCostState, buildPricingByModel, userCurrencySymbol };')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })

  return { __cost: context.__cost }
}

test('unit: a :free model is classified free', () => {
  const { __cost } = load()
  assert.equal(__cost.isFreeModel('tencent/hy3:free', 'nous', {}), true)
  assert.equal(__cost.isFreeModel('meituan/longcat-2.0:free', 'nous', {}), true)
  assert.equal(__cost.botCostState({ model: 'tencent/hy3:free', provider: 'nous' }, {}), 'free')
})

test('unit: local serving providers are free regardless of model name', () => {
  const { __cost } = load()
  assert.equal(__cost.isFreeModel('google/gemma-4-12b', 'lmstudio', {}), true)
  assert.equal(__cost.isFreeModel('any/model', 'Ollama', {}), true)
  assert.equal(__cost.isFreeModel('any/model', 'llama.cpp', {}), true)
})

test('unit: a paid cloud model is paid, and unknown stays paid (fail-closed)', () => {
  const { __cost } = load()
  assert.equal(__cost.isFreeModel('deepseek/deepseek-v4-flash-0731', 'nous', {}), false)
  assert.equal(
    __cost.botCostState({ model: 'deepseek/deepseek-v4-flash-0731', provider: 'nous' }, {}),
    'paid'
  )
  // Unknown provider + no pricing evidence ⇒ paid — never hide a cost.
  assert.equal(__cost.botCostState({ model: 'weird/model', provider: '' }, {}), 'paid')
})

test('unit: catalog pricing (model.options) overrides the string heuristic', () => {
  const { __cost } = load()
  const map = __cost.buildPricingByModel({
    providers: [
      { slug: 'nous', pricing: { 'deepseek/deepseek-v4-flash-0731': { free: false } } },
      { slug: 'groq', pricing: { 'llama-3.3-70b-versatile': { free: true } } }
    ]
  })
  assert.equal(map['deepseek/deepseek-v4-flash-0731'], false)
  assert.equal(map['llama-3.3-70b-versatile'], true)
  // No `:free` suffix, but the catalog says $0 ⇒ free.
  assert.equal(__cost.isFreeModel('llama-3.3-70b-versatile', 'groq', map), true)
  assert.equal(__cost.isFreeModel('deepseek/deepseek-v4-flash-0731', 'nous', map), false)
  // Bare-id fallback matches provider-qualified pricing keys.
  assert.equal(__cost.isFreeModel('llama-3.3-70b-versatile', 'groq', map), true)
})

test('unit: buildPricingByModel ignores malformed/absent pricing', () => {
  const { __cost } = load()
  const empty = map => Object.keys(map).length === 0
  assert.ok(empty(__cost.buildPricingByModel(undefined)))
  assert.ok(empty(__cost.buildPricingByModel({ providers: [{ slug: 'x', pricing: null }] })))
  assert.ok(
    empty(__cost.buildPricingByModel({ providers: [{ slug: 'x', pricing: { a: { free: 'yes' } } }] }))
  )
})

test('unit: unknown model with no default is unknown (renders no badge)', () => {
  const { __cost } = load()
  assert.equal(__cost.botCostState({ model: '', provider: '' }, {}), 'unknown')
})

test('unit: an empty model resolves through the launch default', () => {
  const { __cost } = load()
  assert.equal(
    __cost.botCostState({ model: '', provider: '' }, { defaultModel: 'deepseek/deepseek-v4-flash' }),
    'paid'
  )
  assert.equal(
    __cost.botCostState({ model: '', provider: '' }, { defaultModel: 'tencent/hy3:free' }),
    'free'
  )
})

test('unit: currency symbol follows the user locale, $ as fallback', () => {
  assert.equal(load({ locale: 'en-US' }).__cost.userCurrencySymbol(), '$')
  assert.equal(load({ locale: 'en-GB' }).__cost.userCurrencySymbol(), '£')
  assert.equal(load({ locale: 'de-DE' }).__cost.userCurrencySymbol(), '€')
  assert.equal(load({ locale: 'ja-JP' }).__cost.userCurrencySymbol(), '¥')
  assert.equal(load({ locale: 'xx-XX' }).__cost.userCurrencySymbol(), '$')
})

test('regression: roster rows render a paid/free badge wired to the classifier', () => {
  assert.match(pluginSource, /const costState = botCostState\(/)
  assert.match(pluginSource, /costBadge\(costState, bot\.model \|\| defaultModel, bot\.provider\)/)
  assert.match(pluginSource, /'🆓'/)
  assert.match(pluginSource, /userCurrencySymbol\(\)/)
})

test('regression: the edit-profile dialog classifies the selected model live', () => {
  assert.match(pluginSource, /function AdvancedProfileConfig/)
  assert.match(pluginSource, /state\.model\s*\? costBadge|state\.model\s*\?[\s\S]{0,80}costBadge/)
  assert.match(pluginSource, /Inherits the launch profile model/)
})
