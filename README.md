# Michael Bot

Aartsengel Michaël: Dutch spiritual boomer Discord bot for a private server.

## Setup

```env
APP_ID=
DISCORD_TOKEN=
PUBLIC_KEY=
GUILD_IDS=
GEMINI_API_KEY=
GIPHY_API_KEY=
DAILY_GUILD_ID=
DAILY_CHANNEL_ID=
GITHUB_WEBHOOK_SECRET=
```

Optional Gemini model overrides (defaults are cheap Flash tiers):

```env
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Gacrux
```

```bash
npm install
npm run register   # register slash commands with Discord
npm start
```

## Commands (highlights)

| Command | What it does |
|---|---|
| `/chat` | Talk to Michael |
| `/imagine` | Image from your prompt — Michael rewrites it holy, hellish, or petty based on mood |
| `/listentomichael` | Ask for advice — Michael answers with a voice message (WAV) |
| `/switchoflife` | Turn Michael's proactive chat on/off for this channel or whole server |

## Michael "active" (`/switchoflife`)

By default Michael is **off** in every server until someone flips the switch.

**When on** for a channel/server:

- Name-mention replies in chat
- Rare snark + quiet delayed replies

**Always works** (switch does not matter): slash commands, buttons, `/imagine`, `/listentomichael`.

Use `/switchoflife` → buttons:

- **This channel** — needs Manage Channels or Manage Server
- **Whole server** — needs Manage Server

Channel setting overrides server when set explicitly. Stored in `data/life-switch.json` on the VPS.

## Deploy (push to `main`)

A push to `main` triggers the GitHub webhook on the VPS, which runs:

```bash
cd /root/michael-bot && git fetch origin main && git reset --hard origin/main && npm install && npm run register && pm2 restart michael-bot --update-env
```

That is the same as `npm run deploy` — new slash commands register automatically on every deploy.

Webhook URL (must include port if Caddy uses 8443):

`https://michael-bot.duckdns.org:8443/github-webhook`

## Night window (22:00–10:00 Amsterdam)

Only applies to **fully automated** posts:

- Daily 10:00 uitverkorene cron
- Unprompted snark + quiet delayed reply (only when `/switchoflife` is on)

## Gemini TTS (`/listentomichael`)

Uses [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation) (`gemini-2.5-flash-preview-tts` by default).

Michael always uses **one voice** — default `Gacrux` (mature elderly male). Mood shows in what he says and how delivery is prompted, not by swapping voices.

```env
GEMINI_TTS_VOICE=Gacrux
```

Other male voices that can read as older: `Algenib`, `Charon`, `Schedar`, `Alnilam`. Preview in [Google AI Studio](https://aistudio.google.com/).
