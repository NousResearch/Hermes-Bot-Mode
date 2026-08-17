import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load() {
  const context = {
    atom: initial => ({ get: () => initial, set() {} }),
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    host: { state: { profile: { listen: () => undefined } } }
  }
  const source = pluginSource
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__api = { paginatePets };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return context.__api
}

test('pet gallery paginates six pets per page and clamps page bounds', () => {
  const { paginatePets } = load()
  const pets = Array.from({ length: 13 }, (_, index) => index)
  const normalize = result => ({
    pageCount: result.pageCount,
    currentPage: result.currentPage,
    visible: Array.from(result.visible)
  })

  assert.deepEqual(normalize(paginatePets(pets, 0)), {
    pageCount: 3,
    currentPage: 0,
    visible: [0, 1, 2, 3, 4, 5]
  })
  assert.deepEqual(normalize(paginatePets(pets, 1)), {
    pageCount: 3,
    currentPage: 1,
    visible: [6, 7, 8, 9, 10, 11]
  })
  assert.deepEqual(normalize(paginatePets(pets, 99)), {
    pageCount: 3,
    currentPage: 2,
    visible: [12]
  })
  assert.deepEqual(normalize(paginatePets(pets, -2.8)), {
    pageCount: 3,
    currentPage: 0,
    visible: [0, 1, 2, 3, 4, 5]
  })
  assert.deepEqual(normalize(paginatePets(pets, Number.NaN)), {
    pageCount: 3,
    currentPage: 0,
    visible: [0, 1, 2, 3, 4, 5]
  })
  assert.deepEqual(normalize(paginatePets([], 4)), {
    pageCount: 0,
    currentPage: 0,
    visible: []
  })
})
