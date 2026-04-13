# Michael Bot

Aartsengel Michaël — Dutch spiritual boomer Discord bot for a private server.

## Setup

```env
APP_ID=
DISCORD_TOKEN=
PUBLIC_KEY=
GUILD_IDS=
OPENAI_API_KEY=
GIPHY_API_KEY=
DAILY_GUILD_ID=
DAILY_CHANNEL_ID=
GITHUB_WEBHOOK_SECRET=
```

```bash
npm install
npm run register   # register slash commands
npm start
```

## Deploy

```bash
npm run deploy
# git pull && npm install && node commands.js && pm2 restart michael-bot --update-env
```
