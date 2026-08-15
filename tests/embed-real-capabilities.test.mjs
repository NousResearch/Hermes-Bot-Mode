import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// The bot editor (Edit Profile → Advanced) must render the REAL core Capabilities
// components — ToolsetConfigPanel (full per-toolset env/keys/model/post-setup)
// and McpTab (per-server enable + OAuth + API-key setup) — scoped to the bot's
// profile, instead of bare checkbox stand-ins. Both are feature-detected so the
// plugin still loads on older desktop builds that don't export them yet.

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

/** Edit Profile → Advanced "Toolsets (...)" labeled() control only. */
function toolsetsSection(src) {
  const start = src.indexOf('`Toolsets (${enabledToolsets}')
  assert.notEqual(start, -1, 'Toolsets labeled() heading not found')
  const end = src.indexOf("'MCP servers'", start)
  assert.notEqual(end, -1, 'MCP servers section after Toolsets not found')
  return src.slice(start, end)
}

test('imports the real Capabilities components from the SDK', () => {
  const importBlock = source.slice(0, source.indexOf("} from '@hermes/plugin-sdk'"))
  assert.match(importBlock, /\bMcpTab\b/)
  assert.match(importBlock, /\bToolsetConfigPanel\b/)
})

test('AdvancedProfileConfig embeds ToolsetConfigPanel per toolset, scoped to the bot profile', () => {
  const section = toolsetsSection(source)
  assert.match(section, /ToolsetConfigPanel && openToolset === tset\.name/)
  assert.match(section, /jsx\(ToolsetConfigPanel, \{ toolset: tset\.name, profile: bot \}\)/)
})

test('Toolsets section scrolls with native overflow, not a maxHeight-only Radix ScrollArea', () => {
  const section = toolsetsSection(source)
  assert.match(section, /overflowY:\s*'auto'/)
  assert.match(section, /maxHeight:\s*\d+/)
  assert.doesNotMatch(section, /jsx\(ScrollArea/)
  assert.doesNotMatch(section, /className: '[^']*max-h-\[/)
})

test('Toolsets accordion mounts at most one ToolsetConfigPanel (checkbox ≠ expand)', () => {
  const section = toolsetsSection(source)
  assert.match(source, /const \[openToolset, setOpenToolset\] = useState\(null\)/)
  assert.match(section, /openToolset === tset\.name/)
  assert.match(section, /['"]aria-expanded['"]:\s*openToolset === tset\.name/)
  assert.match(section, /setOpenToolset\(/)
  assert.match(section, /onCheckedChange: value => toggleToolset\(tset\.name, Boolean\(value\)\)/)
})

test('AdvancedProfileConfig embeds the real McpTab with a live gateway + profile, feature-detected', () => {
  assert.match(source, /McpTab && typeof host\.getGateway === 'function'/)
  assert.match(source, /jsx\(McpTab, \{ gateway: host\.getGateway\(\), profile: bot \}\)/)
})

test('older-build fallback: the checkbox MCP list + inline McpSetupButton is still present', () => {
  // The graceful path for desktops without the SDK export must remain intact.
  assert.match(source, /jsx\(McpSetupButton, \{/)
  assert.match(source, /No MCP servers configured or in the catalog\./)
})
