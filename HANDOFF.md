# Handoff — 28 Aug 2026

## Status
Nedjem (OpenClaw) and Michael share the VPS. Michael slash commands use `PUBLIC_KEY` (show as Michael). Typing / member-list / register use `DISCORD_TOKEN`. If that env var is Nedjem’s, Nedjem types and Discord returns 20012 / 50001. `dotenv` was not overriding inherited env. Local uncommitted: `utils/load-env.js` loads repo `.env` with `override: true`; ignore foreign `GOOGLE_API_KEY`.

## After Mac commit + push — VPS (no register)
```bash
cd /root/michael-bot && git pull && pm2 restart michael-bot --update-env
```

Optional identity check (no secrets):
```bash
cd /root/michael-bot
node --input-type=module -e '
import "./utils/load-env.js";
const headers = { Authorization: "Bot " + process.env.DISCORD_TOKEN, "User-Agent": "MichaelBot-diag" };
const r = await fetch("https://discord.com/api/v10/oauth2/applications/@me", { headers });
const j = await r.json();
console.log("token app", j.id, j.name, "env APP_ID", process.env.APP_ID, "match", j.id === process.env.APP_ID);
'
```
