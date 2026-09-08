// Standalone deploy webhook — runs as its own pm2 process so a crash-looping
// bot can never brick its own deploys again (the webhook used to live inside
// app.js: bot down = deploys down).
//
// One-time setup on the VPS:
//   pm2 start deploy-webhook-server.js --name michael-deploy
//   pm2 save
// Then point Caddy's /github-webhook route at localhost:3002 instead of the
// bot's port. Until Caddy is switched, the bot's own endpoint keeps working —
// both register the same route, whichever Caddy hits wins.
//
// Note: a deploy restarts michael-bot only. After changing THIS file or
// utils/deploy-webhook.js, run `pm2 restart michael-deploy` by hand once.

import './utils/load-env.js';
import express from 'express';
import { registerDeployWebhook } from './utils/deploy-webhook.js';

const app = express();
registerDeployWebhook(app);

const PORT = process.env.DEPLOY_WEBHOOK_PORT || 3002;
app.listen(PORT, () => {
  console.log(`[deploy-webhook] standalone listening on port ${PORT}`);
});
