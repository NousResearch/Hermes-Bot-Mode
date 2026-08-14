import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function extractMessages() {
  const match = source.match(/const I18N_MESSAGES = (\{[\s\S]*?\n\})\n\nfunction toMessageTree/)
  assert.ok(match, 'plugin.js must define I18N_MESSAGES immediately before toMessageTree()')
  return vm.runInNewContext(`(${match[1]})`)
}

function placeholders(value) {
  return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort()
}

test('English and Brazilian Portuguese bundles have identical keys', () => {
  const messages = extractMessages()
  assert.deepEqual(Object.keys(messages).sort(), ['en', 'pt-BR'])
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages['pt-BR']).sort())
  assert.ok(Object.keys(messages.en).length >= 90, 'expected all user-facing copy to be translated')
})

test('translations preserve every interpolation placeholder', () => {
  const messages = extractMessages()
  for (const key of Object.keys(messages.en)) {
    assert.deepEqual(placeholders(messages['pt-BR'][key]), placeholders(messages.en[key]), key)
  }
})

test('plugin registers both bundles through the official i18n API before contributions', () => {
  const registration = source.indexOf('ctx.i18n.register(I18N_BUNDLES)')
  const firstContribution = source.indexOf('ctx.register({')
  assert.ok(registration > 0, 'missing ctx.i18n.register(I18N_BUNDLES)')
  assert.ok(firstContribution > registration, 'translations must register before UI contributions')
})

test('flat catalogs are converted to the nested message tree required by the SDK', () => {
  assert.match(source, /function toMessageTree\(messages\)/)
  assert.match(source, /const I18N_BUNDLES = Object\.fromEntries/)
  assert.match(source, /key\.split\('\.'\)/)
})

test('translation helper interpolates placeholders after official locale resolution', () => {
  assert.match(source, /pluginCtx\?\.i18n\?\.t\?\.\(key\)/)
  assert.match(source, /localized === key \? fallback : localized/)
  assert.match(source, /interpolate\(localized === key \? fallback : localized, args\)/)
  assert.doesNotMatch(source, /i18n\?\.t\?\.\(key, args\)/)
  assert.match(source, /I18N_MESSAGES\.en\[key\]/)
})

test('bundles are static data and schedule choices translate after registration', () => {
  const bundleSource = source.match(/const I18N_MESSAGES = (\{[\s\S]*?\n\})\n\nfunction toMessageTree/)[1]
  assert.doesNotMatch(bundleSource, /translate\(/)
  assert.match(source, /function frequencyOptions\(\)/)
  assert.match(source, /function weekdayOptions\(\)/)
})

test('key user surfaces use translations rather than hardcoded English', () => {
  for (const key of [
    'panes.bots',
    'panes.cronjobs',
    'agents.new',
    'agents.editProfile',
    'agents.noAgentsTitle',
    'avatar.describePlaceholder',
    'routines.new',
    'routines.schedule.daily',
    'common.cancel',
    'common.save'
  ]) {
    assert.ok(source.includes(`translate('${key}'`), `missing translated surface ${key}`)
  }

  for (const hardcoded of [
    "children: 'New Agent'",
    "children: 'Edit Profile'",
    "children: 'Create Cronjob'",
    "children: 'Cancel'",
    "children: 'Save'",
    "placeholder: 'Describe your avatar…'",
    "placeholder: 'Inbox Triage'"
  ]) {
    assert.ok(!source.includes(hardcoded), `user-facing English remains: ${hardcoded}`)
  }
})

test('schedule copy uses natural singular and plural forms', () => {
  const messages = extractMessages()
  for (const locale of ['en', 'pt-BR']) {
    for (const unit of ['minute', 'hour', 'day', 'run']) {
      assert.ok(messages[locale][`routines.unit.${unit}.one`], `${locale} missing singular ${unit}`)
      assert.ok(messages[locale][`routines.unit.${unit}.other`], `${locale} missing plural ${unit}`)
    }
  }

  for (const value of Object.values(messages['pt-BR'])) {
    assert.doesNotMatch(value, /\(s\)|vez\(es\)/, `unnatural pt-BR plural: ${value}`)
  }

  assert.equal(messages['pt-BR']['routines.summary.weekly'], 'Executa semanalmente, {weekday}, às {time}{cap}')
  for (const weekday of ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']) {
    const summary = messages['pt-BR']['routines.summary.weekly']
      .replace('{weekday}', weekday)
      .replace('{time}', '09:00')
      .replace('{cap}', '')
    assert.doesNotMatch(summary, /\btod[ao]\s/i, `gendered weekday summary: ${summary}`)
  }
})

test('time labels are locale-aware without changing canonical scheduler values', () => {
  assert.match(source, /function timeOptions\(\)/)
  assert.match(source, /translate\('meta\.locale'\) === 'pt-BR'/)
  assert.match(source, /id: `\$\{h\}:\$\{m\}`/)
  assert.match(source, /timeOptions\(\)/)
  assert.doesNotMatch(source, /const TIMES =/)
})
