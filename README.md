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

The running bot reads env on the **VPS only**. Register from your Mac if the VPS token cannot update the application (Discord 403 / code 20012) — that Mac `.env` is only for `npm run register` (APP_ID + matching token). The webhook deploy also runs register automatically when a push changed `commands.js`, but that only succeeds once the VPS `.env` token matches `APP_ID`; until then the deploy logs the failure and continues, and the Mac remains the fallback.

Register asks Discord which servers the bot is in and installs there, so you do not need to list every guild in `GUILD_IDS`. After register, commands that are not server-only (`/horoscope`, `/chat`, …) also appear in DMs. Server-only ones (`/chosenone`, `/antichrist`, `/switchoflife`, `/michaelmood`) stay in servers.

In the [Discord Developer Portal](https://discord.com/developers/applications/1492114301840916560/bot) → **Bot** → Privileged Gateway Intents, leave **Message Content** on and turn **Server Members Intent** on. Without that last toggle, Discord returns 403 `Missing Access` on the member list and `/horoscope` cannot see the server.

## Commands (highlights)

| Command | NL name | What it does |
|---|---|---|
| `/chat` | — | Talk to Michael. Full register: memory, impression, grudges, his own recent sayings, your character sheet. Scored — moves his mood toward you (⬆️/⬇️ react shows the verdict). |
| `/listentomichael` | — | Ask for advice; he answers in a voice message. Also scored. |
| `/horoscope` | `/horoscoop` | Today's field reading — reprints today's law card, names the chosen one and antichrist, plus anything stamped so far. |
| `/michaelmood` | `/michaelhumeur` | His mood toward you + who currently holds the field. Server-only. (Was `/cosmicstatus`.) |
| `/vibecheck` | — | Full standing dashboard: judgement score bar, verdict, impression, tips. Where the tally lives. |
| `/witness` | `/getuigenis` | Michael reads your dossier aloud as a sermon — or someone else's. Invasive on purpose. |
| `/confess` | `/biecht` | File a confession in the register — about yourself or about someone else. Only you see his reply; the register never forgets. |
| `/auracheck` | — | Michael inspects another user's aura, informed by their file. |
| `/soulinvoice` | `/zielsfactuur` | Itemized bill from the celestial billing department, mined from the target's dossier. One item is always free (grace, promotional). |
| `/chosenone` | `/uitverkorene` | Michael appoints the server's chosen one for the day. Server-only. |
| `/antichrist` | — | Michael designates the antichrist — refused most commands for 24 hours. Server-only. |
| `/mycharacter` | `/mijnrol` | View the D&D-style character sheet Michael keeps on you (archetype, lineage, title, stats, Michael Points). |
| `/negotiate` | `/onderhandelen` | Grovel before the register to change your sheet: state your wish, roll. Failure gets you something worse. |
| `/forgiveme` | `/vergeefmij` | Apologise and roll for mercy. His general mood affects your odds — catch him on a merciful day. |
| `/drawcard` | `/trekkaart` | Pull a canned wisdom card. |
| `/dateangel` | `/dateer` | Go on a scripted date with the Archangel. His mood toward you shapes the opening. |
| `/imagine` | — | Image from your prompt — holy, hellish, or petty depending on his mood and your standing. |
| `/setlanguage` | `/michaeltaal` | Set the bot's language for the server (or your personal language in DMs). |
| `/switchoflife` | — | Turn Michael's proactive life (name-replies, snark, afterthoughts) on/off per channel or server. Server-only. |
| `/feedback` | — | Send a bug/idea/note to Michael's maker, forwarded privately. |

Hidden mechanics worth knowing: asking him twice for another language (e.g. "speak English") unlocks it permanently for you; every text interaction moves the tally; he remembers what he himself said (and forgets expired matters like old invoices by design).

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

Same as `npm run deploy`, plus: if the push changed `commands.js`, the webhook runs `npm run register` before the restart (non-fatal — a register failure is logged and the deploy continues). This only works once the VPS `.env` token matches `APP_ID`; until then, after adding or renaming slash commands run `npm run register` from the Mac, then restart Discord if the list looks stale.

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
