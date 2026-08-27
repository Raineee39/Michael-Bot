# Handoff — 28 Aug 2026

## Status
Horoscope card is punchier (uncommitted). Guild-only register was wiping globals, so DMs had no slash commands. `commands.js` now registers guild commands plus a global DM-only set (`contexts` 1+2) so chats get `/horoscope` etc. without duplicating names in servers.

## User must do — Mac register (I cannot)
```bash
npm run register
```

Then open a DM with Michael and type `/horoscope`. Restart Discord if the list is stale.

Do **not** register on the VPS.

## After push — VPS (behavior only; DMs need the Mac register)
```bash
cd /root/michael-bot && git pull && pm2 restart michael-bot --update-env
```
