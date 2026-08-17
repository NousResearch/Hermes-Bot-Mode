import assert from 'node:assert/strict'
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
    atom,
    PALETTE_AREA: 'palette',
    COMPOSER_AREAS: { middleware: 'middleware' },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => undefined } },
    host: {
      request: () => Promise.resolve({}),
      notify: () => undefined,
      state: { profile: { get: () => 'default', listen: () => undefined }, gateway: { listen: () => undefined } }
    },
    pluginCtx: { storage: { set: () => Promise.resolve(), get: () => Promise.resolve(null) } }
  }
  const source = pluginSource
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__groups = { groupRoster, knownGroups, saveGroupOrder, moveGroup, renameGroup, $groupOrder, $botMeta };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  return context.__groups
}

const ROSTER = [{ name: 'hermes' }, { name: 'researcher' }, { name: 'builder' }, { name: 'pm' }]

test('groupRoster: ungrouped bots lead, groups follow alphabetically, roster order kept inside', () => {
  const { groupRoster } = load()
  const meta = {
    researcher: { group: 'Research' },
    pm: { group: 'Ops' },
    builder: { group: 'Research' }
  }

  const sections = groupRoster(ROSTER, meta)

  // JSON round-trip: vm-realm arrays fail deepEqual on prototype identity.
  assert.equal(
    JSON.stringify(sections.map(s => [s.group, s.bots.map(b => b.name)])),
    JSON.stringify([
      [null, ['hermes']],
      ['Ops', ['pm']],
      ['Research', ['researcher', 'builder']]
    ])
  )
})

test('groupRoster: no groups means one plain section — zero separators', () => {
  const { groupRoster } = load()

  const sections = groupRoster(ROSTER, {})

  assert.equal(sections.length, 1)
  assert.equal(sections[0].group, null)
  assert.equal(sections[0].bots.length, 4)
})

test('groupRoster: blank/whitespace group values count as ungrouped', () => {
  const { groupRoster } = load()

  const sections = groupRoster(ROSTER, { pm: { group: '  ' }, builder: { group: '' }, hermes: { group: null } })

  assert.equal(sections.length, 1)
  assert.equal(sections[0].group, null)
})

test('knownGroups: unique, trimmed, alphabetical', () => {
  const { knownGroups } = load()

  const groups = knownGroups({
    a: { group: 'research' },
    b: { group: 'Ops' },
    c: { group: 'research' },
    d: { group: '' },
    e: {}
  })
  assert.equal(JSON.stringify(groups), JSON.stringify(['Ops', 'research']))
})

test('groupRoster: groupOrder wins, unlisted groups fall back alphabetically at the tail', () => {
  const { groupRoster } = load()
  const meta = {
    researcher: { group: 'Research' },
    pm: { group: 'Ops' },
    builder: { group: 'Research' },
    hermes: { group: 'Zeta' }
  }
  const order = ['Zeta', 'Research']

  const sections = groupRoster(ROSTER, meta, order)

  assert.equal(
    JSON.stringify(sections.map(s => [s.group, s.bots.map(b => b.name)])),
    JSON.stringify([
      ['Zeta', ['hermes']],
      ['Research', ['researcher', 'builder']],
      ['Ops', ['pm']]
    ])
  )
})

test('groupRoster: partial groupOrder — listed first, unlisted alphabetical after', () => {
  const { groupRoster } = load()
  const meta = { pm: { group: 'Ops' }, researcher: { group: 'Research' } }

  const sections = groupRoster(ROSTER, meta, ['Research'])

  assert.equal(
    JSON.stringify(sections.map(s => [s.group, s.bots.map(b => b.name)])),
    JSON.stringify([
      [null, ['hermes', 'builder']],
      ['Research', ['researcher']],
      ['Ops', ['pm']]
    ])
  )
})

test('moveGroup: swaps adjacent entries in the persisted order', () => {
  const { moveGroup, $groupOrder } = load()
  $groupOrder.set(['A', 'B', 'C'])

  moveGroup('B', -1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['B', 'A', 'C']))

  moveGroup('B', 1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['A', 'B', 'C']))
})

test('moveGroup: boundary moves on listed groups are no-ops (first up, last down)', () => {
  const { moveGroup, $groupOrder } = load()
  $groupOrder.set(['A', 'B'])

  moveGroup('A', -1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['A', 'B']))

  moveGroup('B', 1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['A', 'B']))
})

test('moveGroup: an unlisted group is adopted at its alphabetical position, then swapped', () => {
  const { moveGroup, $groupOrder } = load()
  $groupOrder.set(['Alpha', 'Gamma'])

  // 'Beta' sorts between Alpha and Gamma; moving down swaps it with Gamma.
  moveGroup('Beta', 1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['Alpha', 'Gamma', 'Beta']))

  // Moving up swaps it with its new neighbour Gamma — one slot, not to the top.
  moveGroup('Beta', -1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['Alpha', 'Beta', 'Gamma']))
})

test('moveGroup: adoption past the last listed group appends, then up swaps once', () => {
  const { moveGroup, $groupOrder } = load()
  $groupOrder.set(['Alpha'])

  // 'Zulu' sorts after everything — adopt at tail.
  moveGroup('Zulu', 1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['Alpha', 'Zulu']))

  // One up swaps with Alpha, not a full jump to the top.
  moveGroup('Zulu', -1)
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['Zulu', 'Alpha']))
})

test('saveGroupOrder: persists the given order and exposes it via the atom', () => {
  const { saveGroupOrder, $groupOrder } = load()

  saveGroupOrder(['X', 'Y'])
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['X', 'Y']))
})

test('renameGroup: re-tags every member bot and updates the display order', () => {
  const { renameGroup, $groupOrder, $botMeta } = load()
  $botMeta.set({
    researcher: { group: 'Research' },
    builder: { group: 'Research' },
    pm: { group: 'Ops' }
  })
  $groupOrder.set(['Ops', 'Research'])

  const renamed = renameGroup('Research', 'R&D')

  assert.equal(renamed, 'R&D')
  assert.equal($botMeta.get().researcher.group, 'R&D')
  assert.equal($botMeta.get().builder.group, 'R&D')
  assert.equal($botMeta.get().pm.group, 'Ops')
  assert.equal(JSON.stringify($groupOrder.get()), JSON.stringify(['Ops', 'R&D']))
})

test('renameGroup: blank, unchanged, or colliding names are rejected', () => {
  const { renameGroup, $botMeta } = load()
  $botMeta.set({
    researcher: { group: 'Research' },
    pm: { group: 'Ops' }
  })

  assert.equal(renameGroup('Research', '   '), null)
  assert.equal(renameGroup('Research', 'Research'), null)
  assert.equal(renameGroup('Research', 'Ops'), null)
  assert.equal($botMeta.get().researcher.group, 'Research')
})

test('renameGroup: unknown group is a harmless no-op', () => {
  const { renameGroup, $botMeta } = load()
  $botMeta.set({ researcher: { group: 'Research' } })

  assert.equal(renameGroup('Nope', 'Whatever'), 'Whatever')
  assert.equal($botMeta.get().researcher.group, 'Research')
})

test('source contract: sections are ordered, wrapped in a context menu with rename + move', () => {
  assert.match(pluginSource, /groupRoster\(filteredRoster, allMeta, groupOrder\)\.flatMap/)
  assert.match(pluginSource, /ContextMenuTrigger/)
  assert.match(pluginSource, /'Rename group…'/)
  assert.match(pluginSource, /'Move group up'/)
  assert.match(pluginSource, /'Move group down'/)
  assert.match(pluginSource, /onGroup: setGrouping/)
  assert.match(pluginSource, /'Move to group…'/)
})
