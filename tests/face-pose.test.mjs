import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function loadFacePose() {
  const start = source.indexOf('function facePose(mood, t)')
  const end = source.indexOf('function paintMathFace')

  assert.ok(start >= 0 && end > start, 'facePose must remain extractable')

  const context = {}
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.__facePose = facePose;`, context)

  return context.__facePose
}

function loadBotFaceMood() {
  const start = source.indexOf('const ACTIVE_WINDOW_S')
  const end = source.indexOf('// ── bot row ─')

  assert.ok(start >= 0 && end > start, 'botFaceMood block must remain extractable')

  const context = { atom: value => ({ get: () => value, listen: () => () => undefined }) }
  vm.runInNewContext(
    `${source.slice(start, end)}\nglobalThis.__botFaceMood = botFaceMood;`,
    context
  )

  return context.__botFaceMood
}

test('think pose leans left and shows marching dots', () => {
  const facePose = loadFacePose()
  const pose = facePose('think', 0)

  assert.ok(pose.turn < -8)
  assert.ok(Math.abs(pose.tilt) + Math.abs(pose.roll) > 0 || pose.lift !== undefined)
  assert.ok(pose.d0 > 0)
  assert.ok(pose.d1 > 0)
})

test('work pose bobs and hides the think dots', () => {
  const facePose = loadFacePose()
  const pose = facePose('work', 0)

  assert.equal(pose.d0, 0)
  assert.equal(pose.d1, 0)
  assert.equal(pose.d2, 0)
  assert.notEqual(pose.turn, facePose('think', 0).turn)
})

test('idle pose stays small and has no dots', () => {
  const facePose = loadFacePose()
  const pose = facePose('idle', 0)

  assert.equal(pose.d0, 0)
  assert.ok(Math.abs(pose.turn) < 2)
})

test('botFaceMood is think on a live focused turn', () => {
  const botFaceMood = loadBotFaceMood()

  assert.equal(botFaceMood({ isActive: true, turnBusy: true, activeNow: false }), 'think')
  assert.equal(botFaceMood({ isActive: true, turnBusy: true, activeNow: true }), 'think')
})

test('botFaceMood is idle when the turn ends, even if the bot just wrote', () => {
  const botFaceMood = loadBotFaceMood()

  assert.equal(botFaceMood({ isActive: false, turnBusy: true, activeNow: true }), 'idle')
  assert.equal(botFaceMood({ isActive: true, turnBusy: false, activeNow: true }), 'idle')
  assert.equal(botFaceMood({ isActive: true, turnBusy: false, activeNow: false }), 'idle')
})
