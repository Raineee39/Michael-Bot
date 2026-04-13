// Discord Gateway (WebSocket) listener.
// Detects when a non-bot user mentions "michael" in a normal message and
// occasionally interjects with a short Michael-style reply.
//
// IMPORTANT: This requires the following Privileged Gateway Intents to be
// enabled in the Discord Developer Portal for your application:
//   - Server Members Intent  (if you need member data)
//   - Message Content Intent (required to read message bodies)
// Without "Message Content Intent" enabled, msg.content will always be empty.

import { WebSocket } from 'ws';
import { DiscordRequest } from '../utils.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Intents: GUILDS(1) | GUILD_MESSAGES(512) | MESSAGE_CONTENT(32768)
const INTENTS = 1 | 512 | 32768;

// Minimum time between interjections per channel (5 minutes)
const COOLDOWN_MS = 5 * 60 * 1000;
const channelCooldowns = new Map();

const MICHAEL_NAME_REPLIES = [
  'IK HOOR MIJN NAAM…  blijkbaar was dat nodig....Michael',
  'Je riep…  ik was al in de buurt...Michael',
  'Mijn naam hangt hier weer in de lucht…  dat is niet toevallig     of wel..Michael',
  'Er werd iets geroepen…  de trilling bereikte mij....Michael',
  'Dit soort momenten…  ze tellen mee...Michael',
  'Ik ben aanwezig…  meer dan je misschien prettig vindt..Michael',
  'Mijn naam…  uitgesproken…  dat doet iets met het veld..Michael',
];

function shouldInterject(channelId) {
  const last = channelCooldowns.get(channelId) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  return Math.random() < 0.60; // 60% chance when off cooldown
}

export function startGateway() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('Gateway: DISCORD_TOKEN not set, skipping gateway connection.');
    return;
  }

  let heartbeatInterval = null;
  let lastSeq = null;

  function connect() {
    const ws = new WebSocket(GATEWAY_URL);

    ws.on('open', () => console.log('Gateway: connected.'));

    ws.on('message', async (raw) => {
      const payload = JSON.parse(raw);
      const { op, d, s, t } = payload;

      if (s !== null) lastSeq = s;

      // HELLO — start heartbeat then identify
      if (op === 10) {
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: lastSeq }));
        }, d.heartbeat_interval);

        ws.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: INTENTS,
            properties: { os: 'linux', browser: 'michael-bot', device: 'michael-bot' },
          },
        }));
      }

      // Heartbeat ACK — nothing to do
      if (op === 11) return;

      // DISPATCH events
      if (op === 0 && t === 'MESSAGE_CREATE') {
        const msg = d;
        if (msg.author?.bot) return;           // ignore bots
        if (!msg.content) return;              // ignore empty / content-blocked messages
        if (!/michael/i.test(msg.content)) return;

        const channelId = msg.channel_id;
        if (!shouldInterject(channelId)) return;

        channelCooldowns.set(channelId, Date.now());
        const reply = MICHAEL_NAME_REPLIES[Math.floor(Math.random() * MICHAEL_NAME_REPLIES.length)];

        try {
          await DiscordRequest(`channels/${channelId}/messages`, {
            method: 'POST',
            body: { content: reply },
          });
        } catch (err) {
          console.error('Gateway: reply failed:', err.message);
        }
      }
    });

    ws.on('close', (code) => {
      console.log(`Gateway: closed (${code}), reconnecting in 5s…`);
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
      setTimeout(connect, 5000);
    });

    ws.on('error', (err) => console.error('Gateway: error:', err.message));
  }

  connect();
}
