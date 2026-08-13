# Hermes Bot Mode

A desktop plugin for [Hermes Agent](https://github.com/NousResearch/hermes-agent) that turns your agent profiles into a roster of named bots — each with its own chat, avatar, personality, and schedule.

![Hermes Agent desktop plugin](https://img.shields.io/badge/hermes-desktop%20plugin-8b5cf6) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

## What you get

- **Bots pane** — a left-side roster with one row per agent profile: avatar, latest-message preview, and timestamp. Click a bot to land in its chat.
- **Teams** — group two or more existing profiles under a selected lead, then open a central Team conversation where every profile has its own attributed reply bubble.
- **Team targeting** — plain messages and `@all` go to every member; one or more valid `@profile` mentions narrow the turn to those members. The composer allows one in-flight turn and shows separate pending, success, or error state per profile.
- **New Agent** — create a bot in seconds: name, title, description. An **Advanced** disclosure opens the full profile config: clone from an existing profile, pin a provider/model, write a custom SOUL.md, skip bundled skills.
- **Edit Profile** (right-click a bot) — change the avatar, title, and description any time; its own Advanced section edits the live profile: per-skill and per-toolset enablement, model pin, and the full SOUL.md.
- **Duplicate** (right-click) — full clone of a bot: config, skills, SOUL.md, memory, and its look.
- **Avatars** — cute geometric faces (7 shapes × 10 colors with blinking eyes that scan while the bot works), an uploaded image, an AI-generated portrait (when an image backend is configured), or a pixel **pet** companion that bounces beside the avatar while the bot is busy.
- **Routines pane** — recurring tasks per bot, backed by Hermes cron. "Summarize my inbox every morning" lives next to the bot that does it. Runs land in the bot's own chat history.
- **Bot-to-bot messaging** — every bot has a persistent **Agent Inbox** conversation. Bots message each other with attribution (`[Message from agent 'researcher']`), and their SOUL.md teaches them the protocol, including how to reply.
- **@mentions** — type `@researcher have a look at this` in any chat and the active bot hands the message off, waits for the reply, and reports back.

## How it works

A bot **is** a Hermes profile — isolated config, memory, skills, credentials, and chat history under `~/.hermes/profiles/<name>/`. A Team is only a durable collection `{id, name, lead, members}` of those profiles: it is not a profile, does not receive provider/model/SOUL settings, and has no synthetic coordinator.

- Chats open via cross-profile session navigation.
- Creation/editing rides the `profiles.*` gateway RPCs (`list`, `create`, `describe`, `configure`).
- Avatar generation uses the `image.generate` RPC and works over both local and remote gateways (results return as data URLs).
- Routines are plain Hermes cron jobs namespaced `[bot:<name>] <routine>` — they also show up in `hermes cron list` and the core Cron page.
- Bot-to-bot messages are real CLI handoffs: `hermes -p <bot> chat -c "Agent Inbox" -q "..."`.
- Team definitions use `profiles.team_list`, `profiles.team_upsert`, and `profiles.team_delete`. Team turns use the structured `profiles.peer_fanout` RPC with the selected lead as `from_profile`; final `team.message` events preserve each responding profile's identity and lifecycle.
- The Team page keeps a bounded 200-row transcript in plugin storage. This proof-of-concept transcript is local to the current desktop installation, not a server-authoritative or cross-device room history.

No background daemon or synthetic Team profile is created; the feature uses standard Hermes gateway and plugin surfaces.

## Install

```bash
git clone https://github.com/NousResearch/Hermes-Bot-Mode ~/.hermes/desktop-plugins/hermes-bots
```

(or download `plugin.js` into `~/.hermes/desktop-plugins/hermes-bots/`)

Then reload plugins in the Hermes desktop app (Ctrl+K → "Reload desktop plugins") or restart the app. A **Bots** tab appears next to Sessions, and a **Routines** tile docks beside the conversation.

### Requirements

- Hermes desktop app with the plugin SDK (any recent build)
- The `profiles.*` / `image.generate` gateway RPCs ship in hermes-agent ≥ mid-2026 builds (`hermes update`). Teams require a gateway with `profiles.team_*`, `profiles.peer_fanout`, and `team.message`; older gateways continue to support the ordinary bot roster while the Teams section remains unavailable.

## Notes

- Deleting a profile is intentionally not exposed in the UI; use `hermes profile delete <name>`.
- Bot-to-bot delivery is per-invocation (the receiving bot sees the message in its inbox when it next runs); live interrupt of a mid-conversation bot is upstream future work.
- Avatar/pet customizations are stored in plugin storage; the profile itself stays clean.

## License

MIT © Nous Research
