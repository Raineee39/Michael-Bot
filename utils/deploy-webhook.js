// ─── GitHub webhook...  automatic deployment ────────────────────────────────────
//
// GitHub setup:
//   Payload URL : https://michael-bot.duckdns.org/github-webhook
//   Content type: application/json
//   Secret      : same value as GITHUB_WEBHOOK_SECRET in .env
//   Events      : Just the push event
//
// The endpoint validates the HMAC-SHA256 signature GitHub sends in the
// X-Hub-Signature-256 header, then runs the deploy script only when a
// push arrives on the main branch.  The deploy runs in the background so
// the HTTP response returns immediately and GitHub doesn't time out.

import crypto from 'crypto';
import express from 'express';
import { exec } from 'child_process';

export function registerDeployWebhook(app) {
  app.post(
    '/github-webhook',
    express.raw({ type: 'application/json' }), // raw body required for signature verification
    (req, res) => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        console.error('[webhook] GITHUB_WEBHOOK_SECRET is not set...  rejecting request');
        return res.status(500).send('Webhook secret not configured');
      }

      // Verify GitHub's HMAC-SHA256 signature
      const sigHeader = req.headers['x-hub-signature-256'];
      if (!sigHeader) return res.status(401).send('Missing signature');

      const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.body).digest('hex')}`;
      const trusted = Buffer.from(expected, 'utf8');
      const received = Buffer.from(sigHeader, 'utf8');

      if (trusted.length !== received.length || !crypto.timingSafeEqual(trusted, received)) {
        console.warn('[webhook] Signature mismatch...  ignoring request');
        return res.status(401).send('Invalid signature');
      }

      // Only act on pushes to main
      const event = req.headers['x-github-event'];
      if (event !== 'push') return res.status(200).send('Ignored: not a push event');

      const payload = JSON.parse(req.body.toString('utf8'));
      if (payload.ref !== 'refs/heads/main') return res.status(200).send('Ignored: not main branch');

      // Acknowledge immediately so GitHub doesn't time out
      res.status(200).send('Deploying...');

      // If the push changed commands.js, re-register slash commands with Discord.
      // Non-fatal: fails with 403/20012 while the VPS token does not match APP_ID.
      const DEPLOY_CMD = [
        'cd /root/michael-bot',
        'BEFORE=$(git rev-parse HEAD:commands.js)',
        'git fetch origin main',
        'git reset --hard origin/main',
        'npm install',
        'AFTER=$(git rev-parse HEAD:commands.js)',
        'if [ "$BEFORE" != "$AFTER" ]; then npm run register || echo "[webhook] register failed (VPS token cannot update the application — run npm run register from the Mac)"; fi',
        'pm2 restart michael-bot --update-env',
      ].join(' && ');

      console.log('[webhook] Push to main received...  starting deploy');
      exec(DEPLOY_CMD, (err, stdout, stderr) => {
        if (err) {
          console.error('[webhook] Deploy failed:', err.message);
          if (stderr) console.error('[webhook] stderr:', stderr);
          return;
        }
        if (stdout) console.log('[webhook] Deploy output:\n', stdout);
        console.log('[webhook] Deploy completed successfully');
      });
    },
  );
}
