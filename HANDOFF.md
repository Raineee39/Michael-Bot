# Handoff — 28 Aug 2026

## Status
Uncommitted local work. Daily `/horoscope` is now a full Gemini sermon from server memory (forecast + user gossip). Chosen one / antichrist slash appointments are Gemini too. Deploy still must not register on VPS.

## VPS (user must do this — I cannot type in SSH)
After commit + push, on the VPS if the GitHub webhook does **not** fire:

```bash
cd /root/michael-bot && git pull && pm2 restart michael-bot --update-env
```

Do **not** run `npm run register` on the VPS.

From the **Mac** after this lands on GitHub (drops `/challenge`):

```bash
npm run register
```

If life was only on via the old env var, flip `/switchoflife` on the server after restart.
