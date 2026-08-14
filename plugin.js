/**
 * Hermes Bot Mode — a "one chat per agent" roster for the Hermes desktop.
 *
 * Left pane "Bots": one row per Hermes profile (a bot = an agent profile) with
 * a customizable avatar (shape + color + eyes, image, or pet). Click opens that
 * bot's chat; right-click → Edit Profile (avatar, title, description).
 * "New Agent" creates a profile — Name / Title / Description with an
 * "Advanced" disclosure for full profile config.
 *
 * Right tile "Routines": scheduled tasks (Hermes cron jobs) scoped to the
 * bot you're currently chatting with — follows the live gateway profile.
 *
 * Bots message each other via each bot's persistent "Agent Inbox" chat
 * (`hermes -p <bot> chat -c "Agent Inbox" -q ...`); @-mentions in any chat
 * become explicit handoffs via composer middleware.
 */

import {
  atom,
  Button,
  Checkbox,
  cn,
  Codicon,
  COMPOSER_AREAS,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  GlyphSpinner,
  haptic,
  host,
  Input,
  PALETTE_AREA,
  profileColor,
  queryClient,
  relativeTime,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Tip,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-bots'
const ROSTER_KEY = [ID, 'roster']
const ROUTINES_KEY = [ID, 'routines']
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

// Kept inline so plugin.js remains a dependency-free, directly loadable plugin.
const I18N_MESSAGES = {
  en: {
    'meta.locale': 'en',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.advanced': 'Advanced',
    'common.name': 'Name',
    'common.title': 'Title',
    'common.description': 'Description',
    'common.provider': 'Provider',
    'common.model': 'Model',
    'common.generate': 'Generate',
    'common.generating': 'Generating…',
    'panes.bots': 'Bots',
    'panes.cronjobs': 'Cronjobs',
    'agents.new': 'New Agent',
    'agents.newEllipsis': 'New Agent…',
    'agents.editProfile': 'Edit Profile',
    'agents.duplicate': 'Duplicate',
    'agents.newChat': 'New chat with this agent',
    'agents.noConversations': 'No conversations yet — say hi',
    'agents.noAgentsTitle': 'No agents yet',
    'agents.noAgentsDescription': 'Create your first teammate.',
    'agents.create': 'Create Agent',
    'agents.creating': 'Creating…',
    'agents.created': 'Agent “{name}” created',
    'agents.updated': '{name} updated',
    'agents.exists': 'An agent named “{name}” already exists.',
    'agents.dialogDescription': 'A named teammate with its own memory, skills, and chat. It can message your other agents.',
    'agents.editDescription': 'Appearance and role for {name}.',
    'agents.helpPlaceholder': 'What should this agent help with?',
    'agents.botHelpPlaceholder': 'What should this Bot help with?',
    'agents.titlePlaceholder': 'Inbox Triage',
    'agents.advancedDetails': 'Advanced — model, skills, toolsets, SOUL.md',
    'agents.cloneFrom': 'Clone from profile',
    'agents.freshProfile': 'Fresh profile (bundled skills)',
    'agents.createEmpty': 'Create empty (skip bundled skills)',
    'agents.skillSelectionNote': 'Per-skill and per-toolset selection lives in right-click → Edit Profile → Advanced once the agent exists (skills are installed during creation).',
    'agents.soulOptional': 'SOUL.md (optional — replaces the generated persona)',
    'agents.soulPlaceholder': 'Leave blank to auto-generate from name/title/description + agent-messaging roster.',
    'agents.soulLabel': 'SOUL.md (persona + agent-messaging protocol)',
    'agents.noDuplicateName': 'No free name for the duplicate.',
    'agents.copySuffix': '{title} (copy)',
    'agents.duplicating': 'Duplicating {name}…',
    'agents.duplicateCreated': 'Created {name} — full copy of {source}',
    'agents.duplicateFailed': 'Duplicate failed',
    'agents.descriptionUpdateFailed': 'Saved look locally; description update failed',
    'agents.sectionsFailed': 'Some sections failed: {sections}',
    'agents.advancedFailed': 'Advanced configuration failed',
    'avatar.bot': 'Bot',
    'avatar.generate': 'Generate',
    'avatar.upload': 'Upload',
    'avatar.pet': 'Pet',
    'avatar.removeImage': 'Remove image — use shape',
    'avatar.describePlaceholder': 'Describe your avatar…',
    'avatar.generateHint': 'Leave blank to generate from the agent’s name and description.',
    'avatar.noModel': 'No image model available. If you just enabled one (or updated Hermes), restart the gateway: Ctrl+K → “Restart gateway”.',
    'avatar.checkingBackend': 'Checking image backend…',
    'avatar.chooseImage': 'Choose an image…',
    'avatar.tooLarge': 'Image too large (max 15MB).',
    'avatar.generationFailed': 'Avatar generation failed',
    'pets.empty': 'No pets in the petdex gallery. Run `hermes pets` to explore.',
    'pets.pickHint': 'Pick a pet as this agent’s profile picture.',
    'pets.search': 'Search {count} pets…',
    'pets.remove': 'Remove — back to shape avatar',
    'pets.noMatch': 'No pets match.',
    'pets.loadFailed': 'Could not load that pet — try another.',
    'pets.more': 'Scroll for more ({visible} of {total})',
    'model.gatewayDefault': 'gateway default',
    'model.providerPlaceholder': 'nous / openrouter …',
    'model.inherit': 'Inherit (launch profile)',
    'model.launchInherited': 'inherited from launch profile',
    'config.newGateway': 'Full configuration needs a newer gateway (restart it after updating Hermes).',
    'config.skills': 'Skills ({enabled}/{total} enabled)',
    'config.filterSkills': 'Filter skills…',
    'config.toolsets': 'Toolsets ({enabled}/{total} enabled — unchecking all restores the default)',
    'routines.untitled': 'Untitled cronjob',
    'routines.updateFailed': 'Cronjob update failed',
    'routines.delete': 'Delete cronjob',
    'routines.next': 'next {time}',
    'routines.paused': 'paused',
    'routines.new': 'New Cronjob',
    'routines.create': 'Create Cronjob',
    'routines.creating': 'Scheduling…',
    'routines.scheduled': 'Cronjob “{name}” scheduled',
    'routines.dialogDescription': 'A recurring task {name} runs on a schedule. Runs land in its own chat history.',
    'routines.namePlaceholder': 'Name this cronjob',
    'routines.instruction': 'Instruction',
    'routines.instructionPlaceholder': 'What should this cronjob do each time it runs?',
    'routines.when': 'When to run',
    'routines.empty': 'Cronjobs are recurring tasks this agent runs on a schedule.',
    'routines.schedule.once': 'Once, in…',
    'routines.schedule.hourly': 'Every hour',
    'routines.schedule.daily': 'Every day',
    'routines.schedule.weekdays': 'Weekdays',
    'routines.schedule.weekly': 'Every week',
    'routines.schedule.monthly': 'Every month',
    'routines.schedule.interval': 'Interval',
    'routines.schedule.advanced': 'Advanced…',
    'routines.schedule.monday': 'Monday',
    'routines.schedule.tuesday': 'Tuesday',
    'routines.schedule.wednesday': 'Wednesday',
    'routines.schedule.thursday': 'Thursday',
    'routines.schedule.friday': 'Friday',
    'routines.schedule.saturday': 'Saturday',
    'routines.schedule.sunday': 'Sunday',
    'routines.schedule.onceLabel': 'Once ({duration})',
    'routines.schedule.dailyLabel': 'Daily',
    'routines.schedule.everyDays': 'Every {count} days',
    'routines.schedule.hourlyLabel': 'Hourly',
    'routines.schedule.everyHours': 'Every {count}h',
    'routines.schedule.everyMinutes': 'Every {count}m',
    'routines.schedule.minutesFromNow': 'minutes from now',
    'routines.schedule.hoursFromNow': 'hours from now',
    'routines.schedule.daysFromNow': 'days from now',
    'routines.schedule.minutes': 'minutes',
    'routines.schedule.hours': 'hours',
    'routines.schedule.days': 'days',
    'routines.schedule.dayOfMonth': 'Day of month',
    'routines.schedule.stopAfter': 'Stop after',
    'routines.schedule.runsForever': 'runs (blank = forever)',
    'routines.summary.times.one': ', {count} time total',
    'routines.summary.times.other': ', {count} times total',
    'routines.summary.once': 'Runs once, {count} {unit} from now',
    'routines.summary.hourly': 'Runs at the top of every hour{cap}',
    'routines.summary.daily': 'Runs every day at {time}{cap}',
    'routines.summary.weekdays': 'Runs Monday–Friday at {time}{cap}',
    'routines.summary.weekly': 'Runs every {weekday} at {time}{cap}',
    'routines.summary.monthly': 'Runs on day {day} of each month at {time}{cap}',
    'routines.summary.interval': 'Runs every {count} {unit}{cap}',
    'routines.summary.raw': 'Raw schedule — every Nm/Nh/Nd or 5-field cron',
    'routines.unit.minute.one': 'minute',
    'routines.unit.minute.other': 'minutes',
    'routines.unit.hour.one': 'hour',
    'routines.unit.hour.other': 'hours',
    'routines.unit.day.one': 'day',
    'routines.unit.day.other': 'days',
    'routines.unit.run.one': 'run',
    'routines.unit.run.other': 'runs',
    'roster.unavailable': 'Roster unavailable: {error}. If your gateway predates profiles.list, update Hermes and restart the gateway.',
    'roster.gatewayError': 'gateway error',
    'roster.waiting': 'Waiting for the gateway connection… (remote gateways can take a few seconds; retries automatically)',
    'roster.retry': 'Retry now',
    'palette.openBots': 'Open the Bots pane and hit “New Agent”.'
  },
  'pt-BR': {
    'meta.locale': 'pt-BR',
    'common.cancel': 'Cancelar',
    'common.save': 'Salvar',
    'common.saving': 'Salvando…',
    'common.advanced': 'Avançado',
    'common.name': 'Nome',
    'common.title': 'Título',
    'common.description': 'Descrição',
    'common.provider': 'Provedor',
    'common.model': 'Modelo',
    'common.generate': 'Gerar',
    'common.generating': 'Gerando…',
    'panes.bots': 'Bots',
    'panes.cronjobs': 'Tarefas agendadas',
    'agents.new': 'Novo agente',
    'agents.newEllipsis': 'Novo agente…',
    'agents.editProfile': 'Editar perfil',
    'agents.duplicate': 'Duplicar',
    'agents.newChat': 'Nova conversa com este agente',
    'agents.noConversations': 'Ainda não há conversas — diga oi',
    'agents.noAgentsTitle': 'Ainda não há agentes',
    'agents.noAgentsDescription': 'Crie seu primeiro colega de equipe.',
    'agents.create': 'Criar agente',
    'agents.creating': 'Criando…',
    'agents.created': 'Agente “{name}” criado',
    'agents.updated': '{name} atualizado',
    'agents.exists': 'Já existe um agente chamado “{name}”.',
    'agents.dialogDescription': 'Um colega de equipe com nome, memória, habilidades e conversa próprias. Ele pode enviar mensagens aos seus outros agentes.',
    'agents.editDescription': 'Aparência e função de {name}.',
    'agents.helpPlaceholder': 'Como este agente deve ajudar?',
    'agents.botHelpPlaceholder': 'Como este Bot deve ajudar?',
    'agents.titlePlaceholder': 'Triagem da caixa de entrada',
    'agents.advancedDetails': 'Avançado — modelo, habilidades, conjuntos de ferramentas e SOUL.md',
    'agents.cloneFrom': 'Clonar do perfil',
    'agents.freshProfile': 'Perfil novo (habilidades incluídas)',
    'agents.createEmpty': 'Criar vazio (sem habilidades incluídas)',
    'agents.skillSelectionNote': 'A seleção por habilidade e conjunto de ferramentas fica em clique direito → Editar perfil → Avançado depois que o agente for criado (as habilidades são instaladas durante a criação).',
    'agents.soulOptional': 'SOUL.md (opcional — substitui a persona gerada)',
    'agents.soulPlaceholder': 'Deixe em branco para gerar automaticamente com nome/título/descrição + lista de agentes.',
    'agents.soulLabel': 'SOUL.md (persona + protocolo de mensagens entre agentes)',
    'agents.noDuplicateName': 'Não há um nome livre para a cópia.',
    'agents.copySuffix': '{title} (cópia)',
    'agents.duplicating': 'Duplicando {name}…',
    'agents.duplicateCreated': '{name} criado — cópia completa de {source}',
    'agents.duplicateFailed': 'Falha ao duplicar',
    'agents.descriptionUpdateFailed': 'A aparência foi salva localmente; não foi possível atualizar a descrição',
    'agents.sectionsFailed': 'Falha em algumas seções: {sections}',
    'agents.advancedFailed': 'Falha na configuração avançada',
    'avatar.bot': 'Bot',
    'avatar.generate': 'Gerar',
    'avatar.upload': 'Enviar',
    'avatar.pet': 'Pet',
    'avatar.removeImage': 'Remover imagem — usar forma',
    'avatar.describePlaceholder': 'Descreva seu avatar…',
    'avatar.generateHint': 'Deixe em branco para gerar a partir do nome e da descrição do agente.',
    'avatar.noModel': 'Nenhum modelo de imagem disponível. Se você acabou de ativar um (ou atualizar o Hermes), reinicie o gateway: Ctrl+K → “Reiniciar gateway”.',
    'avatar.checkingBackend': 'Verificando o serviço de imagens…',
    'avatar.chooseImage': 'Escolher uma imagem…',
    'avatar.tooLarge': 'Imagem muito grande (máx. 15 MB).',
    'avatar.generationFailed': 'Falha ao gerar o avatar',
    'pets.empty': 'Não há pets na galeria do petdex. Execute `hermes pets` para explorar.',
    'pets.pickHint': 'Escolha um pet como foto de perfil deste agente.',
    'pets.search': 'Pesquisar entre {count} pets…',
    'pets.remove': 'Remover — voltar ao avatar de forma',
    'pets.noMatch': 'Nenhum pet encontrado.',
    'pets.loadFailed': 'Não foi possível carregar esse pet — tente outro.',
    'pets.more': 'Role para ver mais ({visible} de {total})',
    'model.gatewayDefault': 'padrão do gateway',
    'model.providerPlaceholder': 'nous / openrouter …',
    'model.inherit': 'Herdar (perfil de inicialização)',
    'model.launchInherited': 'herdado do perfil de inicialização',
    'config.newGateway': 'A configuração completa exige um gateway mais recente (reinicie-o após atualizar o Hermes).',
    'config.skills': 'Habilidades ({enabled}/{total} ativas)',
    'config.filterSkills': 'Filtrar habilidades…',
    'config.toolsets': 'Conjuntos de ferramentas ({enabled}/{total} ativos — desmarcar todos restaura o padrão)',
    'routines.untitled': 'Tarefa sem título',
    'routines.updateFailed': 'Falha ao atualizar a tarefa',
    'routines.delete': 'Excluir tarefa agendada',
    'routines.next': 'próxima {time}',
    'routines.paused': 'pausada',
    'routines.new': 'Nova tarefa agendada',
    'routines.create': 'Criar tarefa agendada',
    'routines.creating': 'Agendando…',
    'routines.scheduled': 'Tarefa “{name}” agendada',
    'routines.dialogDescription': 'Uma tarefa recorrente executada por {name} conforme a agenda. As execuções ficam no histórico de conversa do agente.',
    'routines.namePlaceholder': 'Dê um nome à tarefa',
    'routines.instruction': 'Instrução',
    'routines.instructionPlaceholder': 'O que esta tarefa deve fazer a cada execução?',
    'routines.when': 'Quando executar',
    'routines.empty': 'Tarefas agendadas são atividades recorrentes que este agente executa conforme uma agenda.',
    'routines.schedule.once': 'Uma vez, em…',
    'routines.schedule.hourly': 'A cada hora',
    'routines.schedule.daily': 'Todos os dias',
    'routines.schedule.weekdays': 'Dias úteis',
    'routines.schedule.weekly': 'Toda semana',
    'routines.schedule.monthly': 'Todo mês',
    'routines.schedule.interval': 'Intervalo',
    'routines.schedule.advanced': 'Avançado…',
    'routines.schedule.monday': 'Segunda-feira',
    'routines.schedule.tuesday': 'Terça-feira',
    'routines.schedule.wednesday': 'Quarta-feira',
    'routines.schedule.thursday': 'Quinta-feira',
    'routines.schedule.friday': 'Sexta-feira',
    'routines.schedule.saturday': 'Sábado',
    'routines.schedule.sunday': 'Domingo',
    'routines.schedule.onceLabel': 'Uma vez ({duration})',
    'routines.schedule.dailyLabel': 'Diariamente',
    'routines.schedule.everyDays': 'A cada {count} dias',
    'routines.schedule.hourlyLabel': 'A cada hora',
    'routines.schedule.everyHours': 'A cada {count} h',
    'routines.schedule.everyMinutes': 'A cada {count} min',
    'routines.schedule.minutesFromNow': 'minutos a partir de agora',
    'routines.schedule.hoursFromNow': 'horas a partir de agora',
    'routines.schedule.daysFromNow': 'dias a partir de agora',
    'routines.schedule.minutes': 'minutos',
    'routines.schedule.hours': 'horas',
    'routines.schedule.days': 'dias',
    'routines.schedule.dayOfMonth': 'Dia do mês',
    'routines.schedule.stopAfter': 'Parar após',
    'routines.schedule.runsForever': 'execuções (em branco = para sempre)',
    'routines.summary.times.one': ', {count} vez no total',
    'routines.summary.times.other': ', {count} vezes no total',
    'routines.summary.once': 'Executa uma vez, daqui a {count} {unit}',
    'routines.summary.hourly': 'Executa no início de cada hora{cap}',
    'routines.summary.daily': 'Executa todos os dias às {time}{cap}',
    'routines.summary.weekdays': 'Executa de segunda a sexta às {time}{cap}',
    'routines.summary.weekly': 'Executa semanalmente, {weekday}, às {time}{cap}',
    'routines.summary.monthly': 'Executa no dia {day} de cada mês às {time}{cap}',
    'routines.summary.interval': 'Executa a cada {count} {unit}{cap}',
    'routines.summary.raw': 'Agenda bruta — every Nm/Nh/Nd ou cron de 5 campos',
    'routines.unit.minute.one': 'minuto',
    'routines.unit.minute.other': 'minutos',
    'routines.unit.hour.one': 'hora',
    'routines.unit.hour.other': 'horas',
    'routines.unit.day.one': 'dia',
    'routines.unit.day.other': 'dias',
    'routines.unit.run.one': 'execução',
    'routines.unit.run.other': 'execuções',
    'roster.unavailable': 'Lista indisponível: {error}. Se o gateway for anterior a profiles.list, atualize o Hermes e reinicie o gateway.',
    'roster.gatewayError': 'erro do gateway',
    'roster.waiting': 'Aguardando conexão com o gateway… (gateways remotos podem levar alguns segundos; novas tentativas são automáticas)',
    'roster.retry': 'Tentar agora',
    'palette.openBots': 'Abra o painel Bots e clique em “Novo agente”.'
  }
}

function toMessageTree(messages) {
  const tree = {}
  for (const [key, value] of Object.entries(messages)) {
    const parts = key.split('.')
    let node = tree
    for (const part of parts.slice(0, -1)) {
      node = node[part] ||= {}
    }
    node[parts.at(-1)] = value
  }
  return tree
}

const I18N_BUNDLES = Object.fromEntries(Object.entries(I18N_MESSAGES).map(([locale, messages]) => [locale, toMessageTree(messages)]))

function interpolate(message, args) {
  return message.replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? `{${name}}`))
}

function translate(key, args = {}) {
  const fallback = I18N_MESSAGES.en[key] || key
  try {
    const localized = pluginCtx?.i18n?.t?.(key) || fallback
    return interpolate(localized === key ? fallback : localized, args)
  } catch {
    return interpolate(fallback, args)
  }
}

/** Captured in register() so components can reach plugin storage. */
let pluginCtx = null

/** Live roster snapshot for imperative handlers (context menus). */
const $lastRoster = atom([])

/** Bot the Routines tile is scoped to. Follows the live gateway profile
 *  (the bot you're actually chatting with) and roster clicks. */
const $selectedBot = atom('default')

/** Per-bot appearance + display meta, persisted via ctx.storage:
 *  { [botName]: { shape, color, title } } */
const $botMeta = atom({})

function saveBotMeta(name, patch) {
  const next = { ...$botMeta.get(), [name]: { ...($botMeta.get()[name] || {}), ...patch } }
  $botMeta.set(next)

  // Local plugin storage: instant, and the fallback for older gateways.
  try {
    Promise.resolve(pluginCtx?.storage?.set?.('bot-meta', next)).catch(() => undefined)
  } catch {
    /* storage unavailable — look persists for this window only */
  }

  // Server-side (source of truth when supported): profile.yaml ui_meta,
  // namespaced under this plugin's id — every client machine sees the same
  // roster. Older gateways reject the param shape; that's fine, local wins.
  // Data-URL fields are stripped from ui_meta (64KB cap, rides every
  // profiles.list); the avatar IMAGE goes to the profile asset store
  // instead (profiles.set_asset), which is server-side and uncapped by the
  // list call — so pfps follow the profile across machines too.
  try {
    const { image, pet, ...rest } = next[name] || {}
    host
      .request('profiles.configure', { name, ui_meta: { 'hermes-bots': rest } })
      .catch(() => undefined)
  } catch {
    /* older gateway */
  }

  // Avatar image → profile asset store (feature-detected; local storage
  // remains the fallback rendering source on older gateways).
  if ('image' in patch) {
    try {
      const req = patch.image
        ? host.request('profiles.set_asset', { name, asset: 'avatar', data: patch.image })
        : host.request('profiles.set_asset', { name, asset: 'avatar', clear: true })
      req.catch(() => undefined)
    } catch {
      /* older gateway */
    }
  }
}

/** Fetch server-side avatars for roster rows flagged has_avatar when the
 *  local cache doesn't already have an image for them. Fire-and-forget. */
const avatarFetchInflight = new Set()

function pullServerAvatars(roster) {
  for (const bot of roster) {
    if (!bot.has_avatar || avatarFetchInflight.has(bot.name)) {
      continue
    }

    if ($botMeta.get()[bot.name]?.image) {
      continue
    }

    avatarFetchInflight.add(bot.name)
    host
      .request('profiles.get_asset', { name: bot.name, asset: 'avatar' })
      .then(res => {
        if (res?.found && res.data) {
          const current = $botMeta.get()
          $botMeta.set({ ...current, [bot.name]: { ...(current[bot.name] || {}), image: res.data } })

          try {
            Promise.resolve(pluginCtx?.storage?.set?.('bot-meta', $botMeta.get())).catch(() => undefined)
          } catch {
            /* no storage */
          }
        }
      })
      .catch(() => undefined)
      .finally(() => avatarFetchInflight.delete(bot.name))
  }
}

/** Server ui_meta (per roster row) beats local storage for the compact
 *  fields it carries; local-only fields (avatar image data URL, extracted
 *  pet icon) are PRESERVED — the server copy never includes them, so a
 *  naive replace would wipe a just-saved image avatar on the next roster
 *  paint. Local also fills gaps for older gateways. */
function mergeServerMeta(roster) {
  const local = $botMeta.get()
  let changed = false
  const next = { ...local }

  for (const bot of roster) {
    const server = bot.ui_meta?.['hermes-bots']
    if (server && typeof server === 'object') {
      const mine = next[bot.name] || {}
      const merged = { ...mine, ...server }

      // Local-only fields survive the server overlay.
      if (mine.image) {
        merged.image = mine.image
      }

      if (JSON.stringify(next[bot.name] || null) !== JSON.stringify(merged)) {
        next[bot.name] = merged
        changed = true
      }
    }
  }

  if (changed) {
    $botMeta.set(next)
  }
}

/** Clone a bot: profile (config/skills/SOUL/memory via clone_from) + look.
 *  Name is "<base>-2", "-3", … — first free slot against the live roster. */
async function duplicateBot(bot, roster) {
  const base = bot.name
  let name = null
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 64)
    if (!roster.some(b => b.name === candidate)) {
      name = candidate
      break
    }
  }

  if (!name) {
    throw new Error(translate('agents.noDuplicateName'))
  }

  await host.request('profiles.create', {
    name,
    clone_from: base,
    description: bot.description || ''
  })

  // Same look: avatar shape/color/image, pet, and a "(copy)" title so the
  // two are tellable apart in the roster until the user renames.
  const meta = $botMeta.get()[base]
  if (meta) {
    saveBotMeta(name, {
      ...meta,
      title: meta.title ? translate('agents.copySuffix', { title: meta.title }) : ''
    })
  }

  return name
}

// ── avatars (shape + color + eyes) ──────────────────────────────────────────

// The original flat shapes. Sigils ('sigil-N') and platonic
// solids remain render-only so any bot that picked one during the experiments
// keeps its look.
const AVATAR_SHAPES = ['circle', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop']

/** xorshift PRNG seeded from a string — stable across sessions/platforms. */
function sigilRng(text) {
  let h = 2166136261
  for (const ch of text) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  let state = h >>> 0 || 88675123
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

/**
 * Angular hermetic sigil: strokes on the left half of a 5-column grid,
 * mirrored right, plus a chance of a diamond ring. Returns SVG path strings.
 */
function sigilGeometry(name, seed) {
  const rng = sigilRng(`${name}::${seed}`)
  const gx = i => 6 + i * 7 // 5 cols: 6..34
  const gy = j => 8 + j * 6 // 5 rows: 8..32
  const strokes = []
  const segments = 4 + Math.floor(rng() * 3)

  for (let k = 0; k < segments; k++) {
    const x1 = Math.floor(rng() * 3) // left half incl. center
    const y1 = Math.floor(rng() * 5)
    const x2 = Math.min(2, Math.max(0, x1 + (rng() > 0.5 ? 1 : -1)))
    const y2 = Math.min(4, Math.max(0, y1 + Math.floor(rng() * 3) - 1))

    strokes.push(`M${gx(x1)} ${gy(y1)} L${gx(x2)} ${gy(y2)}`)
    // mirror (col i → col 4-i)
    strokes.push(`M${gx(4 - x1)} ${gy(y1)} L${gx(4 - x2)} ${gy(y2)}`)

    // occasional cross-tie through the axis for connectedness
    if (rng() > 0.6) {
      strokes.push(`M${gx(x2)} ${gy(y2)} L${gx(4 - x2)} ${gy(y2)}`)
    }
  }

  // spine down the axis grounds every variant
  strokes.push(`M20 ${gy(0)} L20 ${gy(4)}`)

  const ring = rng() > 0.45 ? 'M20 4 L36 20 L20 36 L4 20 Z' : null
  return { strokes: strokes.join(' '), ring }
}

const AVATAR_COLORS = [
  '#f5f5f4', // white
  '#8d6748', // brown
  '#ef4444', // red
  '#f97316', // orange
  '#14b8a6', // teal
  '#38bdf8', // cyan
  '#3b40c8', // royal blue
  '#8b5cf6', // violet
  '#ec4899', // magenta
  '#9ca3af' // silver
]

/** Perceptual luminance — eyes/pupils flip light on dark bodies (ink, oxblood). */
function isDarkColor(hex) {
  try {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110
  } catch {
    return false
  }
}

function defaultShapeFor(name) {
  let hash = 0
  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }
  return AVATAR_SHAPES[hash % AVATAR_SHAPES.length]
}

/** The colored body of the avatar (no eyes). Platonic solids are a filled
 *  silhouette + translucent internal edge lines (the projected wireframe);
 *  legacy flat shapes keep their old geometry so stored picks still render. */
function shapeNode(shape, color, botName = 'agent') {
  if (shape.startsWith('sigil-')) {
    const seed = Number(shape.slice(6)) || 0
    const { strokes, ring } = sigilGeometry(botName, seed)
    const sw = { fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
    return jsxs('g', {
      children: [
        ring ? jsx('path', { d: ring, fill: 'none', stroke: color, strokeWidth: 1.2, opacity: 0.5 }) : null,
        jsx('path', { d: strokes, ...sw })
      ]
    })
  }

  const stroke = { fill: color, stroke: color, strokeWidth: 7, strokeLinejoin: 'round' }
  const edge = { fill: 'none', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' }
  const face = { fill: color, stroke: 'rgba(0,0,0,0.4)', strokeWidth: 1.4, strokeLinejoin: 'round' }

  switch (shape) {
    // ── platonic solids ──
    case 'tetrahedron':
      return jsxs('g', {
        children: [
          jsx('path', { d: 'M20 5 L36 33 L4 33 Z', ...face }),
          jsx('path', { d: 'M20 5 L20 25 M4 33 L20 25 M36 33 L20 25', ...edge })
        ]
      })
    case 'cube':
      return jsxs('g', {
        children: [
          jsx('path', { d: 'M20 4 L33 11 L33 29 L20 36 L7 29 L7 11 Z', ...face }),
          jsx('path', { d: 'M7 11 L20 18 L33 11 M20 18 L20 36', ...edge })
        ]
      })
    case 'octahedron':
      return jsxs('g', {
        children: [
          jsx('path', { d: 'M20 3 L36 20 L20 37 L4 20 Z', ...face }),
          jsx('path', { d: 'M4 20 L36 20 M20 3 L20 37', ...edge })
        ]
      })
    case 'dodecahedron':
      return jsxs('g', {
        children: [
          jsx('path', {
            d: 'M20 3 L30 6.2 L36.2 14.7 L36.2 25.3 L30 33.8 L20 37 L10 33.8 L3.8 25.3 L3.8 14.7 L10 6.2 Z',
            ...face
          }),
          jsx('path', {
            d:
              'M20 12 L27.6 17.5 L24.7 26.5 L15.3 26.5 L12.4 17.5 Z ' +
              'M20 12 L20 3 M27.6 17.5 L36.2 14.7 M24.7 26.5 L30 33.8 M15.3 26.5 L10 33.8 M12.4 17.5 L3.8 14.7',
            ...edge
          })
        ]
      })
    case 'icosahedron':
      return jsxs('g', {
        children: [
          jsx('path', { d: 'M20 3 L34.7 11.5 L34.7 28.5 L20 37 L5.3 28.5 L5.3 11.5 Z', ...face }),
          jsx('path', {
            d:
              'M20 11 L27.8 24.5 L12.2 24.5 Z ' +
              'M20 11 L20 3 M20 11 L34.7 11.5 M20 11 L5.3 11.5 ' +
              'M27.8 24.5 L34.7 11.5 M27.8 24.5 L34.7 28.5 M27.8 24.5 L20 37 ' +
              'M12.2 24.5 L5.3 11.5 M12.2 24.5 L5.3 28.5 M12.2 24.5 L20 37',
            ...edge
          })
        ]
      })

    // ── legacy flat shapes (stored picks from earlier versions) ──
    case 'squircle':
      return jsx('rect', { x: 3, y: 3, width: 34, height: 34, rx: 11, fill: color })
    case 'pill':
      return jsx('rect', { x: 2, y: 7, width: 36, height: 26, rx: 13, fill: color })
    case 'triangle':
      return jsx('path', { d: 'M20 5.5 L36 33.5 L4 33.5 Z', ...stroke })
    case 'hexagon':
      return jsx('path', { d: 'M20 3.5 L34.5 11.75 L34.5 28.25 L20 36.5 L5.5 28.25 L5.5 11.75 Z', ...stroke })
    case 'cloud':
      return jsx('path', {
        d: 'M11 32 a7.5 7.5 0 0 1 -1 -14.9 A9.5 9.5 0 0 1 29 12.5 A7 7 0 0 1 30 32 Z',
        fill: color
      })
    case 'drop':
      return jsx('path', { d: 'M20 3 C20 3 6 20 6 27 a14 13.5 0 0 0 28 0 C34 20 20 3 20 3 Z', fill: color })
    default:
      return jsx('circle', { cx: 20, cy: 20, r: 17.5, fill: color })
  }
}

const EYE_Y = {
  // solids: eyes sit on the upper face region, clear of the busiest edges
  tetrahedron: 26,
  cube: 22.5,
  octahedron: 14.5,
  dodecahedron: 20,
  icosahedron: 17.5,
  // legacy
  circle: 17,
  squircle: 17,
  pill: 20,
  triangle: 25,
  hexagon: 17,
  cloud: 22,
  drop: 24
}

// Solids draw eyes slightly tighter so they read as ON a face.
const EYE_X = {
  tetrahedron: [16.5, 23.5],
  cube: [15, 25],
  octahedron: [16, 24],
  dodecahedron: [16.5, 23.5],
  icosahedron: [16.5, 23.5]
}

/**
 * The face. `mood`: 'idle' (blinks every few seconds), 'work' (eyes scan
 * left-right), 'error' (X X). Eyes flip light-on-dark for ink/oxblood bodies.
 */
function BotFace({ shape, color, image, size = 36, name = 'agent', mood = 'idle' }) {
  const [blink, setBlink] = useState(false)
  const [scanX, setScanX] = useState(0)

  useEffect(() => {
    if (mood === 'work') {
      // scan: pupils sweep left → right → left
      let dir = 1
      let x = 0
      const t = setInterval(() => {
        x += dir
        if (x >= 2 || x <= -2) {
          dir = -dir
        }
        setScanX(x)
      }, 180)
      return () => clearInterval(t)
    }

    if (mood === 'idle') {
      // blink: 120ms closed, randomized 3-7s apart
      let closeTimer = null
      const schedule = () => {
        closeTimer = setTimeout(() => {
          setBlink(true)
          setTimeout(() => {
            setBlink(false)
            schedule()
          }, 120)
        }, 3000 + Math.random() * 4000)
      }
      schedule()
      return () => clearTimeout(closeTimer)
    }

    return undefined
  }, [mood])

  // A custom image (uploaded or generated) replaces the vector face.
  if (image) {
    return jsx('img', {
      src: image,
      alt: '',
      'aria-hidden': true,
      style: { width: size, height: size, borderRadius: '22%', objectFit: 'cover', display: 'block' }
    })
  }

  const isSigil = shape.startsWith('sigil-')
  const eyeY = isSigil ? 14 : (EYE_Y[shape] ?? 17)
  const [eyeL, eyeR] = isSigil ? [16, 24] : (EYE_X[shape] ?? [15.5, 24.5])
  // Sigils are line art (no fill behind the eyes) → eyes in the sigil color.
  // Filled bodies: dark eyes on light colors, parchment eyes on dark colors.
  const eyeFill = isSigil ? color : isDarkColor(color) ? 'rgba(232,220,195,0.95)' : 'rgba(0,0,0,0.85)'

  const eyes =
    mood === 'error'
      ? jsx('path', {
          d: `M${eyeL - 2} ${eyeY - 2} L${eyeL + 2} ${eyeY + 2} M${eyeL + 2} ${eyeY - 2} L${eyeL - 2} ${eyeY + 2} ` +
            `M${eyeR - 2} ${eyeY - 2} L${eyeR + 2} ${eyeY + 2} M${eyeR + 2} ${eyeY - 2} L${eyeR - 2} ${eyeY + 2}`,
          stroke: eyeFill,
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          fill: 'none'
        })
      : blink
        ? jsx('path', {
            d: `M${eyeL - 2.2} ${eyeY} L${eyeL + 2.2} ${eyeY} M${eyeR - 2.2} ${eyeY} L${eyeR + 2.2} ${eyeY}`,
            stroke: eyeFill,
            strokeWidth: 1.8,
            strokeLinecap: 'round',
            fill: 'none'
          })
        : jsxs('g', {
            children: [
              jsx('circle', { cx: eyeL + scanX, cy: eyeY, r: 2.4, fill: eyeFill }),
              jsx('circle', { cx: eyeR + scanX, cy: eyeY, r: 2.4, fill: eyeFill })
            ]
          })

  return jsxs('svg', {
    viewBox: '0 0 40 40',
    width: size,
    height: size,
    'aria-hidden': true,
    children: [shapeNode(shape, color, name), eyes]
  })
}

function botAppearance(name, meta) {
  return {
    shape: meta?.shape || defaultShapeFor(name),
    color: meta?.color || profileColor(name),
    image: meta?.image || null
  }
}

// ── image avatars: upload from device + generate via image.generate ─────────

/** Downscale to a small square so plugin storage stays light. */
function normalizeAvatarImage(dataUrl, edge = 256) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = edge
        canvas.height = edge
        const ctx2d = canvas.getContext('2d')
        const side = Math.min(img.width, img.height)
        ctx2d.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, edge, edge)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function pickImageFromDevice() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.onchange = () => {
      const file = input.files?.[0]

      if (!file) {
        return resolve(null)
      }

      if (file.size > 15_000_000) {
        host.notify({ kind: 'error', message: translate('avatar.tooLarge') })
        return resolve(null)
      }

      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

/** Cached probe: does the gateway have an image backend? A `false` answer
 *  is re-checked on every dialog open — the gateway may have been restarted
 *  (picking up image.generate) or a backend enabled since the last probe.
 *  Only `true` is sticky. */
const $imagenAvailable = atom(null)
let imagenProbeInflight = null

function probeImagen() {
  if (imagenProbeInflight) {
    return imagenProbeInflight
  }

  imagenProbeInflight = host
    .request('image.generate', { probe: true })
    .then(res => $imagenAvailable.set(Boolean(res?.available)))
    .catch(() => $imagenAvailable.set(false))
    .finally(() => {
      imagenProbeInflight = null
    })

  return imagenProbeInflight
}

async function generateAvatarImage(bot, title, description) {
  const who = [title || bot, description].filter(Boolean).join(' — ')
  const res = await host.request('image.generate', {
    prompt:
      `Cute minimal robot avatar for an AI agent named "${who}". ` +
      'Friendly simple mascot face, bold flat vector style, solid color background, centered, no text.',
    aspect_ratio: 'square'
  })

  if (!res?.success) {
    throw new Error(res?.error || 'generation failed')
  }

  // image_data (data URL) works over local AND remote gateways; the raw
  // backend URL is the fallback when the gateway couldn't inline it.
  return res.image_data || res.image
}

/** Shape grid + color swatches, shared by Edit Profile and New Agent.
 *  Layout uses inline grid styles — arbitrary Tailwind classes like
 *  `grid-cols-7` are NOT in the app's precompiled CSS, which collapsed
 *  this into a single vertical column. */
function AvatarPicker({ shape, color, image, onShape, onColor, onImage, generateSeed }) {
  const pickerName = generateSeed?.name || 'agent'
  const imagen = useValue($imagenAvailable)
  const [tab, setTab] = useState('bot')
  const [describe, setDescribe] = useState('')
  const [genBusy, setGenBusy] = useState(false)

  if (imagen === null) {
    void probeImagen()
  }

  // Re-check a stale "unavailable" whenever the user lands on the Generate
  // tab — the gateway may have restarted with image.generate since.
  const goTab = id => {
    setTab(id)

    if (id === 'generate' && $imagenAvailable.get() === false) {
      $imagenAvailable.set(null)
      void probeImagen()
    }
  }

  const upload = async () => {
    const raw = await pickImageFromDevice()

    if (raw) {
      onImage(await normalizeAvatarImage(raw))
    }
  }

  const generate = async () => {
    if (genBusy) {
      return
    }

    setGenBusy(true)

    try {
      const custom = describe.trim()
      const img = custom
        ? await (async () => {
            const res = await host.request('image.generate', {
              prompt: `${custom}. Avatar for an AI agent: centered, bold flat vector style, solid color background, no text.`,
              aspect_ratio: 'square'
            })

            if (!res?.success) {
              throw new Error(res?.error || 'generation failed')
            }

            return res.image_data || res.image
          })()
        : await generateAvatarImage(generateSeed?.name || 'agent', generateSeed?.title, generateSeed?.description)

      if (img) {
        onImage(await normalizeAvatarImage(img))
      }
    } catch (err) {
      host.notifyError(err, translate('avatar.generationFailed'))
    } finally {
      setGenBusy(false)
    }
  }

  const tabButton = (id, label) =>
    jsx(
      'button',
      {
        type: 'button',
        className: cn(
          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
          tab === id
            ? 'bg-(--chrome-action-hover) text-foreground'
            : 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
        ),
        onClick: () => goTab(id),
        children: label
      },
      id
    )

  return jsxs('div', {
    className: 'grid justify-items-center gap-3',
    children: [
      // Tab pills: Bot | Generate | Upload | Pet
      jsxs('div', {
        className: 'flex items-center gap-1',
        children: [tabButton('bot', translate('avatar.bot')), tabButton('generate', translate('avatar.generate')), tabButton('upload', translate('avatar.upload')), tabButton('pet', translate('avatar.pet'))]
      }),

      image && tab !== 'generate'
        ? jsx(Button, {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            onClick: () => onImage(null),
            children: translate('avatar.removeImage')
          })
        : null,

      tab === 'bot'
        ? jsxs('div', {
            className: 'grid justify-items-center gap-3',
            children: [
              jsx('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: '6px',
                  justifyItems: 'center'
                },
                children: AVATAR_SHAPES.map(s =>
                  jsx(
                    'button',
                    {
                      type: 'button',
                      className: cn(
                        'flex items-center justify-center rounded-md transition-colors hover:bg-(--chrome-action-hover)',
                        s === shape && !image && 'ring-1 ring-(--ui-accent)'
                      ),
                      style: { width: 44, height: 44 },
                      onClick: () => {
                        onImage(null)
                        onShape(s)
                      },
                      children: jsx(BotFace, { shape: s, color, size: 32, name: pickerName })
                    },
                    s
                  )
                )
              }),
              jsx('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: '8px',
                  justifyItems: 'center'
                },
                children: AVATAR_COLORS.map(c =>
                  jsx(
                    'button',
                    {
                      type: 'button',
                      className: cn(
                        'rounded-full transition-transform hover:scale-110',
                        c === color && 'ring-2 ring-(--ui-accent) ring-offset-1 ring-offset-(--ui-bg, transparent)'
                      ),
                      style: { width: 22, height: 22, backgroundColor: c },
                      onClick: () => onColor(c)
                    },
                    c
                  )
                )
              })
            ]
          })
        : null,

      tab === 'generate'
        ? imagen
          ? jsxs('div', {
              className: 'grid w-full gap-2',
              children: [
                jsx(Textarea, {
                  className: 'min-h-16 text-xs',
                  placeholder: translate('avatar.describePlaceholder'),
                  value: describe,
                  onChange: event => setDescribe(event.target.value)
                }),
                jsxs(Button, {
                  type: 'button',
                  variant: 'secondary',
                  className: 'w-full justify-center',
                  disabled: genBusy,
                  onClick: generate,
                  children: [
                    genBusy
                      ? jsx(GlyphSpinner, { spinner: 'breathe', className: 'mr-1 text-[0.8rem]' })
                      : jsx(Codicon, { name: 'sparkle', className: 'mr-1 text-[0.8rem]' }),
                    genBusy ? translate('common.generating') : translate('common.generate')
                  ]
                }),
                describe.trim()
                  ? null
                  : jsx('div', {
                      className: 'text-center text-[0.65rem] text-(--ui-text-quaternary)',
                      children: translate('avatar.generateHint')
                    })
              ]
            })
          : jsx('div', {
              className: 'px-2 py-3 text-center text-xs leading-5 text-(--ui-text-tertiary)',
              children:
                imagen === false
                  ? translate('avatar.noModel')
                  : translate('avatar.checkingBackend')
            })
        : null,

      tab === 'upload'
        ? jsxs(Button, {
            type: 'button',
            variant: 'secondary',
            className: 'w-full justify-center',
            onClick: upload,
            children: [jsx(Codicon, { name: 'device-camera', className: 'mr-1 text-[0.8rem]' }), translate('avatar.chooseImage')]
          })
        : null,

      tab === 'pet' ? jsx(PetTab, { image, onImage }) : null
    ]
  })
}

// ── pet tab: attach a petdex companion that lives beside the avatar ─────────

// A petdex "spritesheet" is the FULL animation sheet (1536×1872 webp, ~2MB;
// 8×9 grid of 192×208 frames). Using it as an <img> both downloads megabytes
// per tile and shows the whole sheet squashed. Extract frame 0 once per slug
// via canvas, downscale to 96px, and cache the data URL. Concurrency-capped
// so opening the tab doesn't fire dozens of 2MB fetches at once.
const PET_FRAME_W = 192
const PET_FRAME_H = 208
const petFrameCache = new Map()
let petFetchActive = 0
const petFetchQueue = []

function pumpPetQueue() {
  while (petFetchActive < 4 && petFetchQueue.length) {
    const job = petFetchQueue.shift()
    petFetchActive++
    job().finally(() => {
      petFetchActive--
      pumpPetQueue()
    })
  }
}

function petFrameIcon(spriteUrl) {
  if (!spriteUrl) {
    return Promise.resolve(null)
  }

  if (!petFrameCache.has(spriteUrl)) {
    petFrameCache.set(
      spriteUrl,
      new Promise(resolve => {
        petFetchQueue.push(async () => {
          try {
            const resp = await fetch(spriteUrl)
            const blob = await resp.blob()
            // Crop frame 0 during decode — never materialize the full sheet.
            const bitmap = await createImageBitmap(blob, 0, 0, PET_FRAME_W, PET_FRAME_H)
            const canvas = document.createElement('canvas')
            canvas.width = 96
            canvas.height = 104
            canvas.getContext('2d').drawImage(bitmap, 0, 0, 96, 104)
            bitmap.close()
            resolve(canvas.toDataURL('image/png'))
          } catch {
            resolve(null)
          }
        })
        pumpPetQueue()
      })
    )
  }

  return petFrameCache.get(spriteUrl)
}

/** One pet tile image: frame 0 only, resolved lazily through the cache. */
function PetThumb({ spriteUrl, size = 40 }) {
  const [icon, setIcon] = useState(null)

  useEffect(() => {
    let alive = true
    petFrameIcon(spriteUrl).then(url => {
      if (alive) {
        setIcon(url)
      }
    })
    return () => {
      alive = false
    }
  }, [spriteUrl])

  if (!icon) {
    return jsx('div', {
      style: { width: size, height: size, borderRadius: 6, background: 'var(--chrome-action-hover, rgba(255,255,255,0.06))' }
    })
  }

  return jsx('img', {
    src: icon,
    alt: '',
    style: { width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated', borderRadius: 6 }
  })
}

function PetTab({ image, onImage }) {
  // Selection is dialog-local: committed by the dialog's Save like any
  // uploaded/generated image (a direct meta write here gets clobbered by
  // Save's own image state).
  const [selectedSlug, setSelectedSlug] = useState(null)
  const { data, isLoading } = useQuery({
    queryKey: [ID, 'pet-gallery'],
    queryFn: () => host.request('pet.gallery', {}),
    staleTime: 300000
  })
  const [query, setQuery] = useState('')
  // Windowed rendering: the gallery is 4500+ pets — mounting an <img> per pet
  // froze the dialog. Render `limit` at a time and grow on scroll-to-bottom.
  const [limit, setLimit] = useState(24)
  const pets = data?.pets ?? []

  if (isLoading) {
    return jsx('div', {
      className: 'flex justify-center py-4',
      children: jsx(GlyphSpinner, { spinner: 'breathe', className: 'text-(--ui-text-tertiary)' })
    })
  }

  if (!pets.length) {
    return jsx('div', {
      className: 'px-2 py-3 text-center text-xs text-(--ui-text-tertiary)',
      children: translate('pets.empty')
    })
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? pets.filter(pet => (pet.displayName || '').toLowerCase().includes(q) || (pet.slug || '').includes(q))
    : pets
  // Installed and curated pets surface first — they're the likeliest picks.
  const ranked = filtered.slice().sort((a, b) => {
    const rank = pet => (pet.installed ? 0 : pet.curated ? 1 : 2)
    return rank(a) - rank(b)
  })
  const visible = ranked.slice(0, limit)

  const onScroll = event => {
    const el = event.currentTarget

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && limit < ranked.length) {
      setLimit(prev => Math.min(prev + 24, ranked.length))
    }
  }

  return jsxs('div', {
    className: 'grid w-full gap-2',
    children: [
      jsx('div', {
        className: 'text-center text-[0.65rem] text-(--ui-text-quaternary)',
        children: translate('pets.pickHint')
      }),
      jsx(Input, {
        className: 'h-7 text-xs',
        placeholder: translate('pets.search', { count: pets.length }),
        value: query,
        onChange: event => {
          setQuery(event.target.value)
          setLimit(24)
        }
      }),
      image && selectedSlug
        ? jsx(Button, {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className: 'justify-center',
            onClick: () => {
              setSelectedSlug(null)
              onImage(null)
            },
            children: translate('pets.remove')
          })
        : null,
      filtered.length === 0
        ? jsx('div', {
            className: 'py-3 text-center text-xs text-(--ui-text-quaternary)',
            children: translate('pets.noMatch')
          })
        : jsxs('div', {
            onScroll,
            style: { maxHeight: 220, overflowY: 'auto' },
            children: [
              jsx('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '6px'
                },
                children: visible.map(pet =>
                  jsxs(
                    'button',
                    {
                      type: 'button',
                      className: cn(
                        'grid justify-items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-(--chrome-action-hover)',
                        selectedSlug === pet.slug && 'ring-1 ring-(--ui-accent)'
                      ),
                      onClick: () => {
                        // The pet IS the profile picture: extract frame 0
                        // and hand it to the dialog as the avatar image.
                        // Persisted when the user hits Save.
                        setSelectedSlug(pet.slug)
                        void petFrameIcon(pet.spritesheetUrl).then(icon => {
                          if (icon) {
                            onImage(icon)
                          } else {
                            setSelectedSlug(null)
                            host.notify({ kind: 'error', message: translate('pets.loadFailed') })
                          }
                        })
                      },
                      children: [
                        jsx(PetThumb, { spriteUrl: pet.spritesheetUrl, size: 40 }),
                        jsx('span', {
                          className: 'w-full truncate text-center text-[0.6rem] text-(--ui-text-tertiary)',
                          children: pet.displayName
                        })
                      ]
                    },
                    pet.slug
                  )
                )
              }),
              limit < ranked.length
                ? jsx('div', {
                    className: 'py-2 text-center text-[0.65rem] text-(--ui-text-quaternary)',
                    children: translate('pets.more', { visible: limit, total: ranked.length })
                  })
                : null
            ]
          })
    ]
  })
}

// ── data ─────────────────────────────────────────────────────────────────────

function useRoster() {
  return useQuery({
    queryKey: ROSTER_KEY,
    queryFn: () => host.request('profiles.list', {}),
    refetchInterval: 12000,
    staleTime: 5000,
    // Remote (SSH) gateways connect slowly and drop on sleep/wake; keep
    // retrying instead of latching a terminal error card.
    retry: true,
    retryDelay: attempt => Math.min(15000, 1000 * 2 ** attempt)
  })
}

function displayName(bot, meta) {
  if (meta?.title?.trim()) {
    return meta.title.trim()
  }

  const raw = (bot.title || bot.name || '').replace(/[-_]+/g, ' ').trim()
  return raw.replace(/\b\w/g, ch => ch.toUpperCase())
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** SOUL.md for a new bot: identity + how to message the other bots. */
function composeSoul({ name, title, description, roster, customSoul }) {
  if (customSoul && customSoul.trim()) {
    return customSoul
  }

  const teammates = roster.filter(b => b.name !== name)
  const lines = [
    `# ${displayName({ name, title })}`,
    '',
    title ? `**Role:** ${title}` : null,
    description ? `**Mission:** ${description}` : null,
    '',
    `You are ${displayName({ name, title })}, a persistent named agent (profile \`${name}\`) on this machine.`,
    'You keep your own memory, skills, and conversation history across sessions.',
    '',
    '## Messaging other agents',
    '',
    'You work alongside other named agents. Every agent (including you) has a',
    'persistent chat titled "Agent Inbox" where agent-to-agent messages land.',
    'To message a teammate, deliver into THEIR inbox via the terminal:',
    '',
    '```',
    'hermes -p <agent-name> chat -c "Agent Inbox" -q "[Message from agent \'' + name + '\'] your message"',
    '```',
    '',
    '(`-c "Agent Inbox"` appends to that named conversation, creating it on',
    'first use — never a throwaway session. Always open with the',
    "[Message from agent '" + name + "'] prefix so they know who is talking.)",
    'Their reply prints to stdout — relay the relevant part back to the user,',
    'and mention it came from that agent.',
    '',
    'If a message in YOUR chat starts with "[Message from agent \'<name>\']",',
    'it is a teammate messaging you, not the user. Answer it directly; if a',
    'reply back is needed, use the same command aimed at their inbox.',
    '',
    'When the user writes @<agent-name> or says "ask <name> to ..." /',
    '"tell <name> ...", that is a handoff: message that agent, wait for the',
    'reply, and report back.',
    '',
    'Current teammates:',
    ...(teammates.length
      ? teammates.map(b => `- \`${b.name}\`${b.description ? ` — ${b.description}` : ''}`)
      : ['- (none yet — the roster grows as agents are created)'])
  ]

  return lines.filter(line => line !== null).join('\n')
}

// ── bot row ──────────────────────────────────────────────────────────────────

function BotRow({ bot, onEdit }) {
  const activeProfile = useValue(host.state.profile)
  const meta = useValue($botMeta)[bot.name]
  const last = bot.last_session
  const isActive = bot.name === activeProfile
  const { shape, color, image } = botAppearance(bot.name, meta)
  // Reactive eyes: scan while this bot's backend is running a turn in the
  // active window; calm otherwise. gatewayState is app-wide, so scope to the
  // active profile's row only.
  const gatewayState = useValue(host.state.gateway)
  const botMood = isActive && gatewayState === 'busy' ? 'work' : 'idle'

  const open = () => {
    haptic('tap')
    $selectedBot.set(bot.name)

    if (last && typeof host.openSession === 'function') {
      void host.openSession(last.id, { profile: bot.name })
    } else if (typeof host.newChat === 'function') {
      host.newChat(bot.name)
    } else {
      host.navigate(last ? `/${encodeURIComponent(last.id)}` : '/')
    }
  }

  const row = jsxs('button', {
    type: 'button',
    onClick: open,
    className: cn(
      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
      'hover:bg-(--chrome-action-hover)',
      isActive && 'bg-(--chrome-action-hover)'
    ),
    children: [
      jsx('div', {
        className: 'shrink-0',
        children: jsx(BotFace, { shape, color, image, size: 34, name: bot.name, mood: botMood })
      }),
      jsxs('div', {
        className: 'min-w-0 flex-1',
        children: [
          jsxs('div', {
            className: 'flex items-baseline justify-between gap-2',
            children: [
              jsxs('div', {
                className: 'flex min-w-0 items-baseline gap-1.5 truncate',
                children: [
                  jsx('span', {
                    className: 'truncate text-[0.8125rem] font-medium',
                    children: displayName(bot, meta)
                  }),
                  bot.name && meta?.title?.trim() && bot.name.toLowerCase() !== meta.title.trim().toLowerCase()
                    ? jsx('span', {
                        className: 'shrink-0 font-mono text-[0.6875rem] text-(--ui-text-quaternary)',
                        children: `@${bot.name}`
                      })
                    : null
                ]
              }),
              last
                ? jsx('span', {
                    className: 'shrink-0 text-[0.6875rem] text-(--ui-text-quaternary)',
                    children: relativeTime(last.last_active * 1000)
                  })
                : null
            ]
          }),
          jsx('div', {
            className: 'truncate text-xs text-(--ui-text-tertiary)',
            children: last?.preview || bot.description || translate('agents.noConversations')
          })
        ]
      })
    ]
  })

  return jsxs(ContextMenu, {
    children: [
      jsx(ContextMenuTrigger, { asChild: true, children: row }),
      jsxs(ContextMenuContent, {
        children: [
          jsx(ContextMenuItem, { onSelect: () => onEdit(bot), children: translate('agents.editProfile') }),
          jsx(ContextMenuItem, {
            onSelect: () => {
              host.notify({ kind: 'info', message: translate('agents.duplicating', { name: displayName(bot, meta) }) })
              duplicateBot(bot, $lastRoster.get())
                .then(name => {
                  queryClient.invalidateQueries({ queryKey: ROSTER_KEY })
                  host.notify({ kind: 'success', message: translate('agents.duplicateCreated', { name, source: bot.name }) })
                })
                .catch(err => host.notifyError(err, translate('agents.duplicateFailed')))
            },
            children: translate('agents.duplicate')
          }),
          jsx(ContextMenuSeparator, {}),
          jsx(ContextMenuItem, {
            onSelect: () => {
              $selectedBot.set(bot.name)

              if (typeof host.newChat === 'function') {
                host.newChat(bot.name)
              }
            },
            children: translate('agents.newChat')
          })
        ]
      })
    ]
  })
}

// ── model picker (provider/model dropdowns via model.options) ───────────────

function useModelOptions() {
  return useQuery({
    queryKey: [ID, 'model-options'],
    queryFn: () => host.request('model.options', {}),
    staleTime: 120000,
    retry: false
  })
}

/**
 * Provider + model dropdowns from the gateway's configured inventory — the
 * same data the core model picker shows. `value = {provider, model}`;
 * onChange receives the merged patch. Older gateways (no model.options)
 * degrade to the previous free-text inputs.
 */
function ModelPicker({ value, onChange, placeholderModel = translate('model.gatewayDefault') }) {
  const { data, isLoading, error } = useModelOptions()

  if (isLoading) {
    return jsx('div', {
      className: 'flex justify-center py-2',
      children: jsx(GlyphSpinner, { spinner: 'breathe', className: 'text-(--ui-text-tertiary)' })
    })
  }

  const providers = (data?.providers || []).filter(p => (p.models || []).length)

  if (error || !providers.length) {
    // Fallback: free text (older gateway or empty inventory).
    return jsxs('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
      children: [
        labeled(
          translate('common.provider'),
          jsx(Input, {
            placeholder: translate('model.providerPlaceholder'),
            value: value.provider,
            onChange: event => onChange({ provider: event.target.value })
          })
        ),
        labeled(
          translate('common.model'),
          jsx(Input, {
            placeholder: 'anthropic/claude-fable-5',
            value: value.model,
            onChange: event => onChange({ model: event.target.value })
          })
        )
      ]
    })
  }

  const NONE = '__default__'
  const activeProvider = providers.find(p => p.slug === value.provider) || null
  const models = activeProvider ? (activeProvider.models || []).map(m => (typeof m === 'string' ? m : m.id)) : []

  return jsxs('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '10px' },
    children: [
      labeled(
        translate('common.provider'),
        jsxs(Select, {
          value: value.provider || NONE,
          onValueChange: v => {
            if (v === NONE) {
              onChange({ provider: '', model: '' })
            } else {
              const prov = providers.find(p => p.slug === v)
              const first = prov?.models?.[0]
              onChange({
                provider: v,
                // Keep the model if it exists under the new provider,
                // otherwise preselect that provider's first model.
                model:
                  prov && (prov.models || []).some(m => (typeof m === 'string' ? m : m.id) === value.model)
                    ? value.model
                    : typeof first === 'string'
                      ? first
                      : first?.id || ''
              })
            }
          },
          children: [
            jsx(SelectTrigger, { className: 'h-8 rounded-md', children: jsx(SelectValue, {}) }),
            jsxs(SelectContent, {
              children: [
                jsx(SelectItem, { value: NONE, children: translate('model.inherit') }),
                ...providers.map(p => jsx(SelectItem, { value: p.slug, children: p.slug }, p.slug))
              ]
            })
          ]
        })
      ),
      labeled(
        translate('common.model'),
        activeProvider
          ? jsxs(Select, {
              value: value.model || (models[0] ?? ''),
              onValueChange: v => onChange({ model: v }),
              children: [
                jsx(SelectTrigger, { className: 'h-8 rounded-md', children: jsx(SelectValue, {}) }),
                jsx(SelectContent, {
                  children: models.map(m => jsx(SelectItem, { value: m, children: m }, m))
                })
              ]
            })
          : jsx(Input, {
              disabled: true,
              placeholder: placeholderModel,
              value: '',
              onChange: () => undefined
            })
      )
    ]
  })
}

// ── advanced profile config (skills / toolsets / model / SOUL) ──────────────
//
// Shared by Edit Profile and New Agent (edit mode only for skills/toolsets —
// a not-yet-created profile has nothing installed to toggle). Backed by
// profiles.describe / profiles.configure; feature-detects older gateways.

function CheckList({ items, onToggle, columns = 2 }) {
  return jsx('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: '2px 12px'
    },
    children: items.map(item =>
      jsxs(
        'label',
        {
          className: 'flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5 text-xs text-(--ui-text-secondary)',
          title: item.description || item.name,
          children: [
            jsx(Checkbox, {
              checked: item.enabled,
              onCheckedChange: value => onToggle(item.name, Boolean(value))
            }),
            jsx('span', { className: 'truncate', children: item.name }),
            item.tool_count
              ? jsx('span', {
                  className: 'shrink-0 text-[0.6rem] text-(--ui-text-quaternary)',
                  children: `${item.tool_count}`
                })
              : null
          ]
        },
        item.name
      )
    )
  })
}

function AdvancedProfileConfig({ bot, state, setState }) {
  const [loaded, setLoaded] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  const [skillFilter, setSkillFilter] = useState('')

  if (!loaded) {
    setLoaded(true)
    host
      .request('profiles.describe', { name: bot })
      .then(res => {
        setState(prev => ({
          ...prev,
          provider: res.model?.provider || '',
          model: res.model?.default || '',
          soul: res.soul || '',
          skills: res.skills || [],
          toolsets: res.toolsets || [],
          loaded: true
        }))
      })
      .catch(() => setUnsupported(true))
  }

  if (unsupported) {
    return jsx('div', {
      className: 'px-2 py-3 text-center text-xs text-(--ui-text-tertiary)',
      children: translate('config.newGateway')
    })
  }

  if (!state.loaded) {
    return jsx('div', {
      className: 'flex justify-center py-4',
      children: jsx(GlyphSpinner, { spinner: 'breathe', className: 'text-(--ui-text-tertiary)' })
    })
  }

  const visibleSkills = skillFilter.trim()
    ? state.skills.filter(s => s.name.toLowerCase().includes(skillFilter.trim().toLowerCase()))
    : state.skills

  const toggleSkill = (name, enabled) =>
    setState(prev => ({
      ...prev,
      dirtySkills: true,
      skills: prev.skills.map(s => (s.name === name ? { ...s, enabled } : s))
    }))

  const toggleToolset = (name, enabled) =>
    setState(prev => ({
      ...prev,
      dirtyToolsets: true,
      toolsets: prev.toolsets.map(t => (t.name === name ? { ...t, enabled } : t))
    }))

  const enabledSkills = state.skills.filter(s => s.enabled).length
  const enabledToolsets = state.toolsets.filter(t => t.enabled).length

  return jsxs('div', {
    className: 'grid gap-4',
    children: [
      jsx(ModelPicker, {
        value: { provider: state.provider, model: state.model },
        onChange: patch => setState(prev => ({ ...prev, dirtyModel: true, ...patch }))
      }),
      labeled(
        translate('config.skills', { enabled: enabledSkills, total: state.skills.length }),
        jsxs('div', {
          className: 'grid gap-1.5 rounded-md border border-(--ui-stroke-secondary) p-2',
          children: [
            jsx(Input, {
              className: 'h-7 text-xs',
              placeholder: translate('config.filterSkills'),
              value: skillFilter,
              onChange: event => setSkillFilter(event.target.value)
            }),
            jsx(ScrollArea, {
              style: { maxHeight: 180 },
              children: jsx(CheckList, { items: visibleSkills, onToggle: toggleSkill, columns: 2 })
            })
          ]
        })
      ),
      labeled(
        translate('config.toolsets', { enabled: enabledToolsets, total: state.toolsets.length }),
        jsx('div', {
          className: 'rounded-md border border-(--ui-stroke-secondary) p-2',
          children: jsx(ScrollArea, {
            style: { maxHeight: 160 },
            children: jsx(CheckList, { items: state.toolsets, onToggle: toggleToolset, columns: 2 })
          })
        })
      ),
      labeled(
        translate('agents.soulLabel'),
        jsx(Textarea, {
          className: 'min-h-28 font-mono text-xs leading-5',
          value: state.soul,
          onChange: event => setState(prev => ({ ...prev, dirtySoul: true, soul: event.target.value }))
        })
      )
    ]
  })
}

function emptyAdvancedState() {
  return {
    loaded: false,
    provider: '',
    model: '',
    soul: '',
    skills: [],
    toolsets: [],
    dirtyModel: false,
    dirtySoul: false,
    dirtySkills: false,
    dirtyToolsets: false
  }
}

/** Persist only the dirty sections of the advanced editor. */
async function applyAdvancedConfig(bot, state) {
  const payload = { name: bot }

  if (state.dirtySoul) {
    payload.soul = state.soul
  }

  if (state.dirtyModel && state.model.trim() && state.provider.trim()) {
    payload.model = state.model.trim()
    payload.provider = state.provider.trim()
  }

  if (state.dirtySkills) {
    payload.disabled_skills = state.skills.filter(s => !s.enabled).map(s => s.name)
  }

  if (state.dirtyToolsets) {
    const all = state.toolsets.length
    const enabled = state.toolsets.filter(t => t.enabled)
    // All enabled (or none) = clear the pin; otherwise pin the checked set.
    payload.enabled_toolsets = enabled.length === all || enabled.length === 0 ? [] : enabled.map(t => t.name)
  }

  if (Object.keys(payload).length === 1) {
    return { ok: true, applied: {} }
  }

  return host.request('profiles.configure', payload)
}

// ── edit profile dialog ──────────────────────────────────────────────────────

function labeled(label, control) {
  return jsxs('div', {
    className: 'grid gap-1.5',
    children: [
      jsx('label', {
        className: 'text-xs font-medium text-(--ui-text-secondary)',
        children: label
      }),
      control
    ]
  })
}

function EditProfileDialog({ bot, open, onClose }) {
  const metaAll = useValue($botMeta)
  const meta = bot ? metaAll[bot.name] : null
  const appearance = bot ? botAppearance(bot.name, meta) : { shape: 'circle', color: AVATAR_COLORS[3] }
  const [shape, setShape] = useState(appearance.shape)
  const [color, setColor] = useState(appearance.color)
  const [image, setImage] = useState(appearance.image)
  const [title, setTitle] = useState(meta?.title || '')
  const [description, setDescription] = useState(bot?.description || '')
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [adv, setAdv] = useState(emptyAdvancedState())

  // Re-seed local state each time a different bot opens the dialog.
  const [seedKey, setSeedKey] = useState(null)
  const currentKey = bot ? `${bot.name}:${open}` : null
  if (currentKey !== seedKey) {
    setSeedKey(currentKey)
    if (bot && open) {
      setShape(appearance.shape)
      setColor(appearance.color)
      setImage(appearance.image)
      setTitle(meta?.title || '')
      setDescription(bot.description || '')
      setBusy(false)
      setAdvanced(false)
      setAdv(emptyAdvancedState())
    }
  }

  if (!bot) {
    return null
  }

  const submit = async () => {
    if (busy) {
      return
    }

    setBusy(true)
    saveBotMeta(bot.name, { shape, color, image, title: title.trim() })

    const desc = description.trim()
    if (desc !== (bot.description || '').trim()) {
      try {
        await host.request('cli.exec', {
          argv: ['profile', 'describe', bot.name, '--text', desc]
        })
        queryClient.invalidateQueries({ queryKey: ROSTER_KEY })
      } catch (err) {
        host.notifyError(err, translate('agents.descriptionUpdateFailed'))
      }
    }

    if (adv.loaded && (adv.dirtyModel || adv.dirtySoul || adv.dirtySkills || adv.dirtyToolsets)) {
      try {
        const res = await applyAdvancedConfig(bot.name, adv)
        const failed = Object.entries(res?.applied || {}).filter(([, ok]) => !ok)

        if (failed.length) {
          host.notify({ kind: 'error', message: translate('agents.sectionsFailed', { sections: failed.map(([k]) => k).join(', ') }) })
        }
      } catch (err) {
        host.notifyError(err, translate('agents.advancedFailed'))
      }
    }

    host.notify({ kind: 'success', message: translate('agents.updated', { name: displayName(bot, { title }) }) })
    setBusy(false)
    onClose()
  }

  return jsx(Dialog, {
    open,
    onOpenChange: value => !value && !busy && onClose(),
    children: jsxs(DialogContent, {
      className: advanced ? 'max-w-2xl' : 'max-w-sm',
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: translate('agents.editProfile') }),
            jsx(DialogDescription, { children: translate('agents.editDescription', { name: bot.name }) })
          ]
        }),
        jsxs('div', {
          className: 'grid gap-4',
          children: [
            jsx('div', {
              className: 'flex justify-center py-1',
              children: jsx(BotFace, { shape, color, image, size: 64, name: bot.name })
            }),
            jsx(AvatarPicker, {
              shape,
              color,
              image,
              onShape: setShape,
              onColor: setColor,
              onImage: setImage,
              generateSeed: { name: bot.name, title, description }
            }),
            labeled(
              translate('common.title'),
              jsx(Input, {
                placeholder: displayName(bot, null),
                value: title,
                onChange: event => setTitle(event.target.value)
              })
            ),
            labeled(
              translate('common.description'),
              jsx(Textarea, {
                className: 'min-h-16',
                placeholder: translate('agents.helpPlaceholder'),
                value: description,
                onChange: event => setDescription(event.target.value)
              })
            ),
            jsxs('button', {
              type: 'button',
              className:
                'flex items-center gap-1 text-xs font-medium text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
              onClick: () => setAdvanced(v => !v),
              children: [
                jsx(Codicon, { name: advanced ? 'chevron-down' : 'chevron-right', className: 'text-[0.8rem]' }),
                translate('agents.advancedDetails')
              ]
            }),
            advanced
              ? jsx('div', {
                  className: 'rounded-md border border-(--ui-stroke-secondary) p-3',
                  children: jsx(AdvancedProfileConfig, { bot: bot.name, state: adv, setState: setAdv })
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(Button, { variant: 'ghost', disabled: busy, onClick: onClose, children: translate('common.cancel') }),
            jsx(Button, { disabled: busy, onClick: submit, children: busy ? translate('common.saving') : translate('common.save') })
          ]
        })
      ]
    })
  })
}

// ── create dialog ────────────────────────────────────────────────────────────

function CreateAgentDialog({ open, onClose, roster }) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [shape, setShape] = useState('circle')
  const [color, setColor] = useState(AVATAR_COLORS[3])
  const [image, setImage] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const [cloneFrom, setCloneFrom] = useState('__none__')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [soul, setSoul] = useState('')
  const [noSkills, setNoSkills] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const slug = slugify(name)
  const valid = slug.length > 0 && NAME_RE.test(slug)
  const taken = roster.some(b => b.name === slug)

  const reset = () => {
    setName('')
    setTitle('')
    setDescription('')
    setShape('circle')
    setColor(AVATAR_COLORS[3])
    setImage(null)
    setAdvanced(false)
    setCloneFrom('__none__')
    setModel('')
    setProvider('')
    setSoul('')
    setNoSkills(false)
    setBusy(false)
    setError(null)
  }

  const submit = async () => {
    if (!valid || taken || busy) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const descriptionText = [title, description].filter(Boolean).join(' — ')

      await host.request('profiles.create', {
        name: slug,
        description: descriptionText,
        clone_from: cloneFrom === '__none__' ? null : cloneFrom,
        no_skills: noSkills,
        soul: composeSoul({ name: slug, title, description, roster, customSoul: soul }),
        ...(model.trim() && provider.trim() ? { model: model.trim(), provider: provider.trim() } : {})
      })

      saveBotMeta(slug, { shape, color, image, title: title.trim() })
      queryClient.invalidateQueries({ queryKey: ROSTER_KEY })
      host.notify({ kind: 'success', message: translate('agents.created', { name: displayName({ name: slug, title }) }) })
      reset()
      onClose()
      $selectedBot.set(slug)

      if (typeof host.newChat === 'function') {
        host.newChat(slug)
      }
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return jsx(Dialog, {
    open,
    onOpenChange: value => {
      if (!value && !busy) {
        reset()
        onClose()
      }
    },
    children: jsxs(DialogContent, {
      className: advanced ? 'max-w-xl' : 'max-w-md',
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: translate('agents.new') }),
            jsx(DialogDescription, {
              children: translate('agents.dialogDescription')
            })
          ]
        }),
        jsxs('div', {
          className: 'grid gap-3.5',
          children: [
            jsx('div', {
              className: 'flex justify-center py-1',
              children: jsx(BotFace, { shape, color, image, size: 56, name: slug || 'agent' })
            }),
            jsx(AvatarPicker, {
              shape,
              color,
              image,
              onShape: setShape,
              onColor: setColor,
              onImage: setImage,
              generateSeed: { name: slug || 'agent', title, description }
            }),
            labeled(
              translate('common.name'),
              jsx(Input, {
                autoFocus: true,
                placeholder: 'inbox-triage',
                value: name,
                onChange: event => setName(event.target.value)
              })
            ),
            taken
              ? jsx('div', {
                  className: 'text-xs text-(--ui-accent)',
                  children: translate('agents.exists', { name: slug })
                })
              : null,
            labeled(
              translate('common.title'),
              jsx(Input, {
                placeholder: translate('agents.titlePlaceholder'),
                value: title,
                onChange: event => setTitle(event.target.value)
              })
            ),
            labeled(
              translate('common.description'),
              jsx(Textarea, {
                className: 'min-h-16',
                placeholder: translate('agents.botHelpPlaceholder'),
                value: description,
                onChange: event => setDescription(event.target.value)
              })
            ),
            jsxs('button', {
              type: 'button',
              className:
                'flex items-center gap-1 text-xs font-medium text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
              onClick: () => setAdvanced(v => !v),
              children: [
                jsx(Codicon, { name: advanced ? 'chevron-down' : 'chevron-right', className: 'text-[0.8rem]' }),
                translate('common.advanced')
              ]
            }),
            advanced
              ? jsxs('div', {
                  className: 'grid gap-3.5 rounded-md border border-(--ui-stroke-secondary) p-3',
                  children: [
                    labeled(
                      translate('agents.cloneFrom'),
                      jsxs(Select, {
                        value: cloneFrom,
                        onValueChange: setCloneFrom,
                        children: [
                          jsx(SelectTrigger, {
                            className: 'h-8 rounded-md',
                            children: jsx(SelectValue, {})
                          }),
                          jsxs(SelectContent, {
                            children: [
                              jsx(SelectItem, { value: '__none__', children: translate('agents.freshProfile') }),
                              ...roster.map(b => jsx(SelectItem, { value: b.name, children: b.name }, b.name))
                            ]
                          })
                        ]
                      })
                    ),
                    jsx(ModelPicker, {
                      value: { provider, model },
                      onChange: patch => {
                        if ('provider' in patch) {
                          setProvider(patch.provider)
                        }
                        if ('model' in patch) {
                          setModel(patch.model)
                        }
                      },
                      placeholderModel: translate('model.launchInherited')
                    }),
                    labeled(
                      translate('agents.soulOptional'),
                      jsx(Textarea, {
                        className: 'min-h-24 font-mono text-xs leading-5',
                        placeholder:
                          translate('agents.soulPlaceholder'),
                        value: soul,
                        onChange: event => setSoul(event.target.value)
                      })
                    ),
                    jsxs('label', {
                      className: 'flex items-center gap-2 text-xs text-(--ui-text-secondary)',
                      children: [
                        jsx(Checkbox, {
                          checked: noSkills,
                          onCheckedChange: value => setNoSkills(Boolean(value))
                        }),
                        translate('agents.createEmpty')
                      ]
                    }),
                    jsx('div', {
                      className: 'text-[0.65rem] leading-4 text-(--ui-text-quaternary)',
                      children:
                        translate('agents.skillSelectionNote')
                    })
                  ]
                })
              : null,
            error
              ? jsx('div', {
                  className: 'rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-xs text-(--ui-accent)',
                  children: error
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(Button, {
              variant: 'ghost',
              disabled: busy,
              onClick: () => {
                reset()
                onClose()
              },
              children: translate('common.cancel')
            }),
            jsx(Button, {
              disabled: busy || !valid || taken,
              onClick: submit,
              children: busy ? translate('agents.creating') : translate('agents.create')
            })
          ]
        })
      ]
    })
  })
}

// ── routines (cron) ──────────────────────────────────────────────────────────
//
// One "On a schedule" trigger for now. Jobs are namespaced
// "[bot:<name>] <routine>"; the prompt runs the routine AS the bot
// (hermes -p <bot> chat -c "Routine: …"), so runs land in that bot's own
// history. The tile follows the bot you're chatting with (gateway profile).

const BOT_TAG_RE = /^\[bot:([a-z0-9][a-z0-9_-]*)\]\s*/i

function routineBot(job) {
  const match = BOT_TAG_RE.exec(job?.name || '')
  return match ? match[1].toLowerCase() : null
}

function routineTitle(job) {
  return (job?.name || '').replace(BOT_TAG_RE, '') || translate('routines.untitled')
}

function useRoutines() {
  return useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => host.request('cron.manage', { action: 'list', include_disabled: true }),
    refetchInterval: 20000,
    staleTime: 8000
  })
}

function routinePrompt(bot, title, instruction) {
  return (
    `You are running the scheduled routine "${title}" for agent '${bot}'. ` +
    `Execute it AS that agent so the run lands in its own history: run this in the terminal and relay the output:\n\n` +
    `hermes -p ${bot} chat -c "Routine: ${title}" -q ${JSON.stringify(`[Scheduled routine] ${instruction}`)}\n\n` +
    `If the command fails, report the error instead.`
  )
}

function scheduleLabel(schedule) {
  const once = /^once in (.+)$/.exec(schedule || '')

  if (once) {
    return translate('routines.schedule.onceLabel', { duration: once[1] })
  }

  const bare = /^(\d+)([mhd])$/.exec(schedule || '')

  if (bare) {
    return translate('routines.schedule.onceLabel', { duration: `${bare[1]}${bare[2]}` })
  }

  const match = /^every (\d+)m$/.exec(schedule || '')

  if (match) {
    const minutes = Number(match[1])

    if (minutes % 1440 === 0) {
      const d = minutes / 1440
      return d === 1 ? translate('routines.schedule.dailyLabel') : translate('routines.schedule.everyDays', { count: d })
    }

    if (minutes % 60 === 0) {
      const h = minutes / 60
      return h === 1 ? translate('routines.schedule.hourlyLabel') : translate('routines.schedule.everyHours', { count: h })
    }

    return translate('routines.schedule.everyMinutes', { count: minutes })
  }

  return schedule || ''
}

function RoutineRow({ job, onChanged }) {
  const [busy, setBusy] = useState(false)
  // Optimistic overlay: null = trust server state. Set immediately on
  // toggle so the switch responds even before the refetch lands.
  const [pendingActive, setPendingActive] = useState(null)
  const serverActive = job.enabled !== false && job.state !== 'paused'
  const active = pendingActive === null ? serverActive : pendingActive

  if (pendingActive !== null && pendingActive === serverActive) {
    setPendingActive(null) // server caught up
  }

  const act = async action => {
    if (busy) {
      return
    }

    setBusy(true)

    if (action === 'pause' || action === 'resume') {
      setPendingActive(action === 'resume')
    }

    try {
      await host.request('cron.manage', { action, name: job.job_id })
      onChanged()
    } catch (err) {
      setPendingActive(null)
      host.notifyError(err, translate('routines.updateFailed'))
    } finally {
      setBusy(false)
    }
  }

  return jsxs('div', {
    className: cn(
      'group grid gap-1.5 rounded-lg border border-(--ui-stroke-secondary) p-2.5 transition-colors',
      'hover:border-(--ui-stroke-primary, var(--ui-stroke-secondary))'
    ),
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          jsx('span', {
            'aria-hidden': true,
            className: cn('size-1.5 shrink-0 rounded-full', active ? 'bg-emerald-500' : 'bg-(--ui-text-quaternary)')
          }),
          jsx('span', {
            className: cn('min-w-0 flex-1 truncate text-xs font-medium', !active && 'text-(--ui-text-tertiary)'),
            children: routineTitle(job)
          }),
          jsx(Switch, {
            checked: active,
            disabled: busy,
            onCheckedChange: value => act(value ? 'resume' : 'pause')
          }),
          jsx(Tip, {
            label: translate('routines.delete'),
            children: jsx('button', {
              type: 'button',
              disabled: busy,
              className:
                'flex size-5 items-center justify-center rounded text-(--ui-text-quaternary) opacity-0 transition-opacity group-hover:opacity-100 hover:bg-(--chrome-action-hover) hover:text-foreground',
              onClick: () => act('remove'),
              children: jsx(Codicon, { name: 'trash', className: 'text-[0.75rem]' })
            })
          })
        ]
      }),
      jsxs('div', {
        className: 'flex items-center justify-between gap-2 pl-3.5',
        children: [
          jsxs('span', {
            className:
              'inline-flex items-center gap-1 rounded-full border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)',
            children: [jsx(Codicon, { name: 'calendar', className: 'text-[0.7rem]' }), scheduleLabel(job.schedule)]
          }),
          jsx('span', {
            className: 'truncate text-[0.65rem] text-(--ui-text-quaternary)',
            children: active && job.next_run_at ? translate('routines.next', { time: relativeTime(new Date(job.next_run_at).getTime()) }) : translate('routines.paused')
          })
        ]
      })
    ]
  })
}

// Structured schedule picker: frequency first, then only the detail that
// frequency needs (time of day, weekday, day of month, interval). Emits a
// Hermes-native schedule string; Advanced exposes it raw.
function frequencyOptions() {
  return [
    { id: 'once', label: translate('routines.schedule.once') },
    { id: 'hourly', label: translate('routines.schedule.hourly') },
    { id: 'daily', label: translate('routines.schedule.daily') },
    { id: 'weekdays', label: translate('routines.schedule.weekdays') },
    { id: 'weekly', label: translate('routines.schedule.weekly') },
    { id: 'monthly', label: translate('routines.schedule.monthly') },
    { id: 'interval', label: translate('routines.schedule.interval') },
    { id: 'advanced', label: translate('routines.schedule.advanced') }
  ]
}

function weekdayOptions() {
  return [
    { id: '1', label: translate('routines.schedule.monday') },
    { id: '2', label: translate('routines.schedule.tuesday') },
    { id: '3', label: translate('routines.schedule.wednesday') },
    { id: '4', label: translate('routines.schedule.thursday') },
    { id: '5', label: translate('routines.schedule.friday') },
    { id: '6', label: translate('routines.schedule.saturday') },
    { id: '0', label: translate('routines.schedule.sunday') }
  ]
}

function timeOptions() {
  const out = []
  const brazilian = translate('meta.locale') === 'pt-BR'
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const minutes = String(m).padStart(2, '0')
      const label = brazilian
        ? `${String(h).padStart(2, '0')}:${minutes}`
        : `${h % 12 === 0 ? 12 : h % 12}:${minutes} ${h < 12 ? 'AM' : 'PM'}`
      out.push({ id: `${h}:${m}`, label, h, m })
    }
  }
  return out
}

/** Compose the Hermes schedule string from picker state. */
function composeSchedule(state) {
  const [h, m] = (state.time || '9:0').split(':').map(Number)

  switch (state.freq) {
    case 'once': {
      const n = Math.max(1, parseInt(state.onceN, 10) || 1)
      return `${n}${state.onceUnit || 'h'}`
    }
    case 'hourly':
      return 'every 1h'
    case 'daily':
      return `${m} ${h} * * *`
    case 'weekdays':
      return `${m} ${h} * * 1-5`
    case 'weekly':
      return `${m} ${h} * * ${state.weekday || '1'}`
    case 'monthly':
      return `${m} ${h} ${state.monthday || '1'} * *`
    case 'interval': {
      const n = Math.max(1, parseInt(state.intervalN, 10) || 1)
      return `every ${n}${state.intervalUnit || 'h'}`
    }
    default:
      return state.raw || ''
  }
}

function scheduleSummary(state) {
  const weekdays = weekdayOptions()
  const times = timeOptions()
  const t = times.find(x => x.id === state.time)
  const tl = t ? t.label : times[18].label

  const pluralKey = (unit, count) => `routines.unit.${unit}.${count === 1 ? 'one' : 'other'}`
  const unitWord = (u, count) => translate(pluralKey(u === 'm' ? 'minute' : u === 'd' ? 'day' : 'hour', count))
  const cap =
    state.freq !== 'once' && String(state.repeatN || '').trim()
      ? (() => {
          const count = Math.max(1, parseInt(state.repeatN, 10) || 1)
          return translate(`routines.summary.times.${count === 1 ? 'one' : 'other'}`, { count })
        })()
      : ''

  switch (state.freq) {
    case 'once':
      return (() => {
        const count = Math.max(1, parseInt(state.onceN, 10) || 1)
        return translate('routines.summary.once', { count, unit: unitWord(state.onceUnit, count) })
      })()
    case 'hourly':
      return translate('routines.summary.hourly', { cap })
    case 'daily':
      return translate('routines.summary.daily', { time: tl, cap })
    case 'weekdays':
      return translate('routines.summary.weekdays', { time: tl, cap })
    case 'weekly':
      return translate('routines.summary.weekly', { weekday: (weekdays.find(w => w.id === state.weekday) || weekdays[0]).label, time: tl, cap })
    case 'monthly':
      return translate('routines.summary.monthly', { day: state.monthday || '1', time: tl, cap })
    case 'interval':
      return (() => {
        const count = Math.max(1, parseInt(state.intervalN, 10) || 1)
        return translate('routines.summary.interval', { count, unit: unitWord(state.intervalUnit, count), cap })
      })()
    default:
      return translate('routines.summary.raw')
  }
}

function pickerSelect(value, onChange, options) {
  return jsxs(Select, {
    value,
    onValueChange: onChange,
    children: [
      jsx(SelectTrigger, { className: 'h-8 rounded-md', children: jsx(SelectValue, {}) }),
      jsx(SelectContent, {
        children: options.map(o => jsx(SelectItem, { value: o.id, children: o.label }, o.id))
      })
    ]
  })
}

function SchedulePicker({ state, setState }) {
  const upd = patch => setState(prev => ({ ...prev, ...patch }))
  const needsTime = ['daily', 'weekdays', 'weekly', 'monthly'].includes(state.freq)
  const times = timeOptions()

  return jsxs('div', {
    className: 'grid gap-2',
    children: [
      jsxs('div', {
        style: { display: 'grid', gridTemplateColumns: needsTime ? '1fr 1fr' : '1fr', gap: '8px' },
        children: [
          pickerSelect(state.freq, v => upd({ freq: v }), frequencyOptions()),
          needsTime ? pickerSelect(state.time, v => upd({ time: v }), times) : null
        ]
      }),
      state.freq === 'once'
        ? jsxs('div', {
            style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
            children: [
              jsx(Input, {
                className: 'h-8',
                placeholder: '30',
                value: state.onceN,
                onChange: event => upd({ onceN: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) })
              }),
              pickerSelect(state.onceUnit, v => upd({ onceUnit: v }), [
                { id: 'm', label: translate('routines.schedule.minutesFromNow') },
                { id: 'h', label: translate('routines.schedule.hoursFromNow') },
                { id: 'd', label: translate('routines.schedule.daysFromNow') }
              ])
            ]
          })
        : null,
      state.freq === 'weekly'
        ? pickerSelect(state.weekday, v => upd({ weekday: v }), weekdayOptions())
        : null,
      state.freq === 'monthly'
        ? labeled(
            translate('routines.schedule.dayOfMonth'),
            jsx(Input, {
              className: 'h-8',
              placeholder: '1',
              value: state.monthday,
              onChange: event => upd({ monthday: event.target.value.replace(/[^0-9]/g, '').slice(0, 2) })
            })
          )
        : null,
      state.freq === 'interval'
        ? jsxs('div', {
            style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
            children: [
              jsx(Input, {
                className: 'h-8',
                placeholder: '2',
                value: state.intervalN,
                onChange: event => upd({ intervalN: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) })
              }),
              pickerSelect(state.intervalUnit, v => upd({ intervalUnit: v }), [
                { id: 'm', label: translate('routines.schedule.minutes') },
                { id: 'h', label: translate('routines.schedule.hours') },
                { id: 'd', label: translate('routines.schedule.days') }
              ])
            ]
          })
        : null,
      state.freq === 'advanced'
        ? jsx(Input, {
            className: 'h-8 font-mono text-xs',
            placeholder: 'every 1d \u00b7 every 2h \u00b7 0 9 * * * (cron)',
            value: state.raw,
            onChange: event => upd({ raw: event.target.value })
          })
        : null,
      state.freq !== 'once' && state.freq !== 'advanced'
        ? jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: translate('routines.schedule.stopAfter') }),
              jsx(Input, {
                className: 'h-7 w-16 text-xs',
                placeholder: '\u221e',
                value: state.repeatN,
                onChange: event => upd({ repeatN: event.target.value.replace(/[^0-9]/g, '').slice(0, 4) })
              }),
              jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: translate('routines.schedule.runsForever') })
            ]
          })
        : null,
      jsx('div', {
        className: 'text-[0.65rem] text-(--ui-text-quaternary)',
        children: `${scheduleSummary(state)} \u00b7 ${composeSchedule(state) || '\u2014'}`
      })
    ]
  })
}

function defaultScheduleState() {
  return { freq: 'daily', time: '9:0', weekday: '1', monthday: '1', intervalN: '2', intervalUnit: 'h', onceN: '30', onceUnit: 'm', repeatN: '', raw: '' }
}

function CreateRoutineDialog({ bot, open, onClose }) {
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [sched, setSched] = useState(defaultScheduleState())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const schedule = composeSchedule(sched)

  const reset = () => {
    setName('')
    setInstruction('')
    setSched(defaultScheduleState())
    setBusy(false)
    setError(null)
  }

  const submit = async () => {
    const title = name.trim()
    const task = instruction.trim()

    if (!title || !task || !schedule.trim() || busy) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const repeatN =
        sched.freq !== 'once' && sched.freq !== 'advanced' && String(sched.repeatN || '').trim()
          ? Math.max(1, parseInt(sched.repeatN, 10) || 1)
          : null
      await host.request('cron.manage', {
        action: 'add',
        name: `[bot:${bot}] ${title}`,
        schedule: schedule.trim(),
        prompt: routinePrompt(bot, title, task),
        ...(repeatN ? { repeat: repeatN } : {})
      })
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY })
      host.notify({ kind: 'success', message: translate('routines.scheduled', { name: title }) })
      reset()
      onClose()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return jsx(Dialog, {
    open,
    onOpenChange: value => {
      if (!value && !busy) {
        reset()
        onClose()
      }
    },
    children: jsxs(DialogContent, {
      className: 'max-w-md',
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: translate('routines.new') }),
            jsx(DialogDescription, {
              children: translate('routines.dialogDescription', { name: displayName({ name: bot }, $botMeta.get()[bot]) })
            })
          ]
        }),
        jsxs('div', {
          className: 'grid gap-3.5',
          children: [
            labeled(
              translate('common.name'),
              jsx(Input, {
                autoFocus: true,
                placeholder: translate('routines.namePlaceholder'),
                value: name,
                onChange: event => setName(event.target.value)
              })
            ),
            labeled(
              translate('routines.instruction'),
              jsx(Textarea, {
                className: 'min-h-20',
                placeholder: translate('routines.instructionPlaceholder'),
                value: instruction,
                onChange: event => setInstruction(event.target.value)
              })
            ),
            labeled(translate('routines.when'), jsx(SchedulePicker, { state: sched, setState: setSched })),
            error
              ? jsx('div', {
                  className: 'rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-xs text-(--ui-accent)',
                  children: error
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(Button, {
              variant: 'ghost',
              disabled: busy,
              onClick: () => {
                reset()
                onClose()
              },
              children: translate('common.cancel')
            }),
            jsx(Button, {
              disabled: busy || !name.trim() || !instruction.trim() || !schedule.trim(),
              onClick: submit,
              children: busy ? translate('routines.creating') : translate('routines.create')
            })
          ]
        })
      ]
    })
  })
}

function RoutinesPane() {
  const selected = useValue($selectedBot)
  const gatewayProfile = useValue(host.state.profile)
  // The tile maps to the bot you're chatting with: the live gateway profile
  // is the truth once a chat opens; $selectedBot covers the gap between a
  // roster click and the profile swap landing.
  const bot = (gatewayProfile || selected || 'default').trim() || 'default'
  const meta = useValue($botMeta)[bot]
  const { shape, color, image } = botAppearance(bot, meta)
  const { data, isLoading, refetch } = useRoutines()
  const [createOpen, setCreateOpen] = useState(false)
  const jobs = (data?.jobs ?? []).filter(job => routineBot(job) === bot)

  return jsxs('div', {
    className: 'flex h-full flex-col',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2 px-3 pt-3 pb-2',
        children: [
          jsx(BotFace, { shape, color, image, size: 22, name: bot }),
          jsxs('div', {
            className: 'min-w-0 flex-1',
            children: [
              jsxs('div', {
                className: 'flex min-w-0 items-baseline gap-1.5 truncate',
                children: [
                  jsx('div', {
                    className: 'truncate text-xs font-semibold',
                    children: displayName({ name: bot }, meta)
                  }),
                  meta?.title?.trim() && bot.toLowerCase() !== meta.title.trim().toLowerCase()
                    ? jsx('span', {
                        className: 'shrink-0 font-mono text-[0.65rem] text-(--ui-text-quaternary)',
                        children: `@${bot}`
                      })
                    : null
                ]
              }),
              jsx('div', {
                className: 'text-[0.65rem] uppercase tracking-wider text-(--ui-text-quaternary)',
                children: translate('panes.cronjobs')
              })
            ]
          }),
          jsx(Tip, {
            label: translate('routines.new'),
            children: jsx('button', {
              type: 'button',
              className:
                'flex size-6 shrink-0 items-center justify-center rounded-md text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
              onClick: () => setCreateOpen(true),
              children: jsx(Codicon, { name: 'add' })
            })
          })
        ]
      }),
      jsx('div', { className: 'mx-3 border-t border-(--ui-stroke-secondary)' }),
      isLoading
        ? jsx('div', {
            className: 'flex flex-1 items-center justify-center',
            children: jsx(GlyphSpinner, { spinner: 'breathe', className: 'text-(--ui-text-tertiary)' })
          })
        : jobs.length === 0
          ? jsxs('div', {
              className: 'flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center',
              children: [
                jsx(Codicon, { name: 'calendar', className: 'text-[1.6rem] text-(--ui-text-quaternary)' }),
                jsx('div', {
                  className: 'text-xs leading-5 text-(--ui-text-tertiary)',
                  children: translate('routines.empty')
                }),
                jsx(Button, {
                  variant: 'secondary',
                  size: 'sm',
                  onClick: () => setCreateOpen(true),
                  children: translate('routines.create')
                })
              ]
            })
          : jsx(ScrollArea, {
              className: 'min-h-0 flex-1',
              children: jsx('div', {
                className: 'grid gap-1.5 px-2.5 py-2',
                children: jobs.map(job => jsx(RoutineRow, { job, onChanged: () => void refetch() }, job.job_id))
              })
            }),
      jsx(CreateRoutineDialog, {
        bot,
        open: createOpen,
        onClose: () => {
          setCreateOpen(false)
          void refetch()
        }
      })
    ]
  })
}

// ── roster pane ──────────────────────────────────────────────────────────────

function BotsPane() {
  const { data, error, isLoading, refetch } = useRoster()
  const gatewayUp = useValue(host.state.gateway) === 'open'
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  // The socket opening (boot, SSH reconnect, sleep/wake) is the signal to
  // retry immediately instead of waiting out the poll interval.
  useEffect(() => {
    if (gatewayUp) {
      void refetch()
    }
  }, [gatewayUp, refetch])
  const roster = data?.profiles ?? []
  $lastRoster.set(roster)
  mergeServerMeta(roster)
  pullServerAvatars(roster)

  return jsxs('div', {
    className: 'flex h-full flex-col',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-1.5',
        children: [
          jsx('span', {
            className: 'text-[0.6875rem] font-semibold uppercase tracking-wider text-(--ui-text-quaternary)',
            children: translate('panes.bots')
          }),
          jsx(Tip, {
            label: translate('agents.new'),
            children: jsx('button', {
              type: 'button',
              className:
                'flex size-6 items-center justify-center rounded-md text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
              onClick: () => setCreateOpen(true),
              children: jsx(Codicon, { name: 'add' })
            })
          })
        ]
      }),
      isLoading
        ? jsx('div', {
            className: 'flex flex-1 items-center justify-center',
            children: jsx(GlyphSpinner, { spinner: 'breathe', className: 'text-(--ui-text-tertiary)' })
          })
        : error
          ? jsxs('div', {
              className: 'grid gap-2 px-3 py-4 text-xs text-(--ui-text-tertiary)',
              children: [
                jsx('div', {
                  children: gatewayUp
                    ? translate('roster.unavailable', { error: error instanceof Error ? error.message : translate('roster.gatewayError') })
                    : translate('roster.waiting')
                }),
                jsx(Button, {
                  variant: 'secondary',
                  size: 'sm',
                  className: 'justify-self-start',
                  onClick: () => void refetch(),
                  children: translate('roster.retry')
                })
              ]
            })
          : roster.length === 0
            ? jsx(EmptyState, {
                icon: 'hubot',
                title: translate('agents.noAgentsTitle'),
                description: translate('agents.noAgentsDescription')
              })
            : jsx(ScrollArea, {
                className: 'min-h-0 flex-1',
                children: jsx('div', {
                  className: 'grid gap-0.5 px-1.5 pb-2',
                  children: roster.map(bot => jsx(BotRow, { bot, onEdit: setEditing }, bot.name))
                })
              }),
      jsx('div', {
        className: 'border-t border-(--ui-stroke-secondary) p-2',
        children: jsxs(Button, {
          className: 'w-full justify-center gap-1.5',
          variant: 'secondary',
          onClick: () => setCreateOpen(true),
          children: [jsx(Codicon, { name: 'add' }), translate('agents.new')]
        })
      }),
      jsx(CreateAgentDialog, {
        open: createOpen,
        onClose: () => {
          setCreateOpen(false)
          void refetch()
        },
        roster
      }),
      jsx(EditProfileDialog, {
        bot: editing,
        open: Boolean(editing),
        onClose: () => {
          setEditing(null)
          void refetch()
        }
      })
    ]
  })
}

// ── plugin ───────────────────────────────────────────────────────────────────

export default {
  id: ID,
  name: 'Bots',
  register(ctx) {
    pluginCtx = ctx
    ctx.i18n.register(I18N_BUNDLES)

    // Keyframes for the pet bob — injected because plugin classes aren't in
    // the app's precompiled CSS. Idempotent across hot reloads.
    if (!document.getElementById('hermes-bots-keyframes')) {
      const style = document.createElement('style')
      style.id = 'hermes-bots-keyframes'
      style.textContent = '@keyframes hermes-bots-bob { from { transform: translateY(0); } to { transform: translateY(-3px); } }'
      document.head.appendChild(style)
    }

    // Hydrate persisted avatars/titles. Storage may be sync, async, or
    // absent depending on shell version — normalize through Promise.resolve
    // inside a try so a storage quirk can NEVER fail the plugin load.
    try {
      Promise.resolve(ctx.storage?.get?.('bot-meta'))
        .then(value => {
          if (value && typeof value === 'object') {
            $botMeta.set(value)
          }
        })
        .catch(() => undefined)
    } catch {
      /* no storage on this shell — defaults stay */
    }

    // Routines follow the chat you're in: track the live gateway profile.
    host.state.profile.listen(profile => {
      if (profile && typeof profile === 'string') {
        $selectedBot.set(profile)
      }
    })

    ctx.register({
      id: 'pane',
      area: 'panes',
      title: translate('panes.bots'),
      data: { placement: 'left', width: '260px' },
      render: () => jsx(BotsPane, {})
    })

    // Routines — its OWN tiling pane splitting the workspace's right edge
    // (NOT the collapsible right sidebar; placement 'right' is that sidebar's
    // role and hides the pane until "Show Right Sidebar").
    ctx.register({
      id: 'routines',
      area: 'panes',
      title: translate('panes.cronjobs'),
      data: {
        placement: 'main',
        dock: { pane: 'workspace', pos: 'right' },
        width: '250px'
      },
      render: () => jsx(RoutinesPane, {})
    })

    ctx.register({
      id: 'new-agent',
      area: PALETTE_AREA,
      data: {
        id: `${ID}.new-agent`,
        label: translate('agents.newEllipsis'),
        keywords: ['bot', 'agent', 'profile', 'teammate', 'create'],
        run: () => {
          host.notify({ kind: 'info', message: translate('palette.openBots') })
        }
      }
    })

    // @-mention middleware: "@<bot> do the thing" in any chat becomes an
    // explicit handoff instruction the active agent's SOUL.md knows how to
    // execute. Names are validated against the LIVE roster so
    // "user@example.com" or an unknown @ passes through untouched.
    ctx.register({
      id: 'mention-middleware',
      area: COMPOSER_AREAS.middleware,
      data: {
        handler: async draft => {
          const text = draft.text || ''

          if (!/(^|\s)@[a-z0-9][a-z0-9_-]*/i.test(text)) {
            return draft
          }

          let names = []
          try {
            const res = await host.request('profiles.list', { include_sessions: false })
            names = (res?.profiles ?? []).map(p => p.name)
          } catch {
            return draft
          }

          const mentioned = []
          for (const match of text.matchAll(/(^|\s)@([a-z0-9][a-z0-9_-]*)/gi)) {
            const name = match[2].toLowerCase()
            if (names.includes(name) && !mentioned.includes(name)) {
              mentioned.push(name)
            }
          }

          if (!mentioned.length) {
            return draft
          }

          const note =
            `\n\n[@mention handoff: deliver the message above to ${mentioned.map(n => `agent '${n}'`).join(' and ')} ` +
            `via \`hermes -p <agent> chat -c "Agent Inbox" -q "..."\` (prefix it "[Message from agent '<your-name>']"), ` +
            `wait for the reply, and report it back.]`

          return { ...draft, text: text + note }
        }
      }
    })
  }
}
