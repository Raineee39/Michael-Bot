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

Register from your Mac if the VPS token cannot update the application (Discord 403 / code 20012). Do not put `npm run register` in the VPS deploy chain.

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

**Always works** (switch does not matter): slash commands, buttons, daily bulletin, unfinished-business follow-ups after 10 minutes of silence.

Stored in `data/life-switch.json` on the VPS. Channel override beats server setting.

## Daily bulletin (10:00 Amsterdam)

If `DAILY_GUILD_ID` and `DAILY_CHANNEL_ID` are set, Gemini writes a server-specific bulletin from member memory: general forecast plus gossip-prophecies (`<@mentions>`), and names that day's **chosen one** and **antichrist** (24 hours). `/horoscope` is the same style of call. The antichrist is refused on most commands, in public, with prejudice.

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
