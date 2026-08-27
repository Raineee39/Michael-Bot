# Handoff — 28 Aug 2026

## Status
Uncommitted on Mac: day-law, punchier horoscope, DM globals (registered), env isolation, empty-embed fix, ambient reacts (nazar/hamsa), GIFs daily-only.

How to see today's law: `/horoscope` **in the server** opens or reprints the card. `/cosmicstatus` shows mood + forbidden word. 10:00 Amsterdam posts the same card to `DAILY_CHANNEL_ID`. DMs are personal, not the server law.

No new slash commands — do **not** register.

## After push — VPS
```bash
cd /root/michael-bot && git pull && pm2 restart michael-bot --update-env
```
