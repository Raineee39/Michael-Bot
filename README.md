# Michael Bot

Archangel Michael: petty celestial clerk Discord bot. Replies in Dutch or English depending on `/setlanguage`.

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
FEEDBACK_DM_USER_ID=
```

Optional Gemini overrides:

```env
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Algenib
```

```bash
npm install
npm run register   # register slash commands with Discord (run from a machine whose .env token matches APP_ID)
npm start
```

The running bot reads env on the **VPS only**. Register from your Mac if the VPS token cannot update the application (Discord 403 / code 20012) — that Mac `.env` is only for `npm run register` (APP_ID + matching token). Do not put register in the VPS deploy chain.

Register asks Discord which servers the bot is in and installs there, so you do not need to list every guild in `GUILD_IDS`. After register, commands that are not server-only (`/horoscope`, `/chat`, …) also appear in DMs. Server-only ones (`/chosenone`, `/antichrist`, `/switchoflife`, `/cosmicstatus`) stay in servers.

In the [Discord Developer Portal](https://discord.com/developers/applications/1492114301840916560/bot) → **Bot** → Privileged Gateway Intents, leave **Message Content** on and turn **Server Members Intent** on. Without that last toggle, Discord returns 403 `Missing Access` on the member list and `/horoscope` cannot see the server.

## Commands (highlights)

| Command | What it does |
|---|---|
| `/chat` | Talk to Michael |
| `/auracheck` | Michael inspects another user's aura from the register |
| `/horoscope` | Today's field reading; names the current chosen one and antichrist |
| `/chosenone` / `/antichrist` | Appoint (or reroll) the day's offices |
| `/witness` / `/confess` | Sermon from the dossier / private filing |
| `/imagine` | Image from your prompt — holy, hellish, or petty by mood |
| `/listentomichael` | Advice as a voice message |
| `/switchoflife` | Turn name-replies and snark on/off for a channel or the whole server |

## Michael "active" (`/switchoflife`)

Default is **off**. Nothing in `.env` turns him on. Someone with Manage Server (or Manage Channels, for the channel button) must flip `/switchoflife`.

**When on:**

- Name-mention / @bot replies
- Rare snark on random messages

**Always works** (switch does not matter): slash commands, buttons, daily bulletin, today's-card stamps, unfinished-business follow-ups after 10 minutes of silence.

Stored in `data/life-switch.json` on the VPS. Channel override beats server setting.

## Daily bulletin (10:00 Amsterdam; Moons Grill 11:00 Amsterdam / 10:00 UK)

If `DAILY_GUILD_ID` and `DAILY_CHANNEL_ID` are set, Gemini writes **today's card** at **10:00 Europe/Amsterdam**. Moons Grill (`183545688859213834`) is one hour later: **11:00 Amsterdam**, so it lands at **10:00 UK** during BST. That card is **law until tomorrow's card**. `/horoscope` reprints the same card (and a short "so far" if anything was stamped). The antichrist is refused on most commands, in public, with prejudice.

Michael watches chat and stamps rarely (max 4 public stamps a day, 25 minutes apart). First hit on a law is a short reply; repeats get a reaction. Next morning he closes yesterday's books, judgement moves, and the residue flavours the new card. This does not need `/switchoflife`. The bot needs **Add Reactions** in the server.

## Deploy (push to `main`)

The GitHub webhook on the VPS runs:

```bash
cd /root/michael-bot && git fetch origin main && git reset --hard origin/main && npm install && pm2 restart michael-bot --update-env
```

Same as `npm run deploy`. After adding or renaming slash commands, run `npm run register` from the Mac, then restart Discord if the list looks stale.

Webhook URL (include the port if Caddy uses 8443):

`https://michael-bot.duckdns.org:8443/github-webhook`

## Night window (22:00–10:00 Amsterdam)

Only automated posts:

- Daily bulletin cron (scheduled at 10:00, so it should fire)
- Unprompted snark (only when `/switchoflife` is on)
- Unfinished-business resurfacing waits until morning

## Gemini TTS (`/listentomichael`)

Uses [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation). Default voice is **Algenib**. Caps / `woedend` uses a louder delivery prompt.

```env
GEMINI_TTS_VOICE=Algenib
```

Other older-male options: `Gacrux`, `Charon`, `Schedar`, `Alnilam`. Preview in [Google AI Studio](https://aistudio.google.com/).
