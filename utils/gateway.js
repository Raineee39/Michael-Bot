// Discord Gateway (WebSocket) listener.
//
// Behaviour:
// 1. Unprompted chat (when /switchoflife is on for this server or channel):
//    a. 0.5% chance of an immediate snarky reply to a random message.
//    b. 5% chance to queue that message as the one delayed reply;
//       it sends after 10 minutes of silence in that channel.
// 2. When a non-bot message mentions "michael" (case-insensitive):
//    a. Feature 3...  "Do not respond" trap: if the message contains baiting
//       language, there is a 70% chance Michael silently ignores it and queues
//       an unfinished business item instead of replying.
//    b. If life-switch is on: Michael always replies with a short canned line;
//       optional post-message revision ("Edit:") on that reply.
//       When the life-switch is off (default), no reply is sent here.
// 3. lastChannelId is tracked per user.
//
// IMPORTANT: Requires the following Privileged Gateway Intents enabled in the
// Discord Developer Portal:
//   - Message Content Intent (required to read message bodies)

import { WebSocket } from 'ws';
import { appendEditWithinDiscordLimit, DiscordRequest } from '../utils.js';
import { addUnfinishedBusiness, loadUserMemory, updateLastChannel } from './michael-memory.js';
import { generatePostRevision } from './openai.js';
import { resolveLanguage } from './guild-settings.js';
import { getLang } from './lang/index.js';
import { handleUnpromptedChat } from './unprompted-chat.js';
import { isMichaelLifeActive } from './life-switch.js';

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Intents: GUILDS(1) | GUILD_MESSAGES(512) | MESSAGE_CONTENT(32768)
const INTENTS = 1 | 512 | 32768;

const BAIT_RE = /\b(antwoord\s*(dan|nu|toch|me)?|reageer\s*(dan|nu|toch)?|durf\s+je\s+niet|durf\s+niet|zeg\s+iets|waarom\s+reageer|coward|lafaard|bange\s+engel|kom\s+op\s+dan|wees\s+geen\s+lafaard|reageer\s+op\s+mij|zeg\s+dan\s+iets|ben\s+je\s+er\s+wel)\b/i;

// ─── Post-message revision helper (Feature 5) ─────────────────────────────────
//
// After Michael sends a gateway interjection, there is a small chance he
// quietly edits it a few seconds later to append a second thought.
// The original text is preserved...  only a short "Edit: …" line is appended.

async function maybeScheduleRevision(channelId, messageId, originalContent, mood, langCode = 'nl') {
  if (Math.random() > 0.10) return; // 10% chance
  const delay = 6000 + Math.floor(Math.random() * 14000); // 6 to 20 s
  console.log(`[michael] revision scheduled | gateway | msg=${messageId} | ~${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const editLine = await generatePostRevision(originalContent, mood, langCode);
      const revised = appendEditWithinDiscordLimit(originalContent, editLine);
      await DiscordRequest(`channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: { content: revised },
      });
      console.log(`[michael] revision applied | gateway | ${messageId} | "${editLine.slice(0, 60)}"`);
    } catch (err) {
      console.error('[michael] revision failed | gateway:', err.message);
    }
  }, delay);
}

// ─── Gateway connection ────────────────────────────────────────────────────────

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
      try {
      let payload;
      try { payload = JSON.parse(raw); } catch { return; }
      const { op, d, s, t } = payload;

      if (s !== null) lastSeq = s;

      // HELLO...  start heartbeat then identify
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

      // Heartbeat ACK...  nothing to do
      if (op === 11) return;

      // ── DISPATCH...  MESSAGE_CREATE ──────────────────────────────────────────
      if (op === 0 && t === 'MESSAGE_CREATE') {
        const msg = d;
        if (msg.author?.bot) return;    // ignore bots
        if (!msg.content) return;       // ignore empty / content-blocked

        const channelId = msg.channel_id;
        const authorId  = msg.author.id;
        const content   = msg.content;

        const guildId = msg.guild_id ?? null;
        const mentionsMichael = /michael/i.test(content) || /امرؤ القيس|امرئ القيس|القيس/.test(content);

        // Track the user's most-recently-active channel.
        updateLastChannel(authorId, channelId, guildId);

        handleUnpromptedChat({
          messageId: msg.id,
          channelId,
          authorId,
          username: msg.author?.global_name || msg.author?.username,
          content,
          guildId,
          mentionsMichael,
        });

        // Only continue for messages that mention Michael or (in Arabic mode) Imru' al-Qais
        if (!mentionsMichael) return;

        // Feature 3...  Bait / forcing trap
        if (BAIT_RE.test(content)) {
          if (Math.random() < 0.70) {
            // Michael silently ignores...  queues unfinished business to resurface later
            addUnfinishedBusiness(authorId, {
              prompt:   content,
              reason:   'De gebruiker probeerde Michael te commanderen of te provoceren',
              severity: 2,
              messageId: msg.id,
              channelId,
            });
            console.log(`[michael] gateway | bait-silent + business | user=${authorId}`);
            return; // no immediate reply
          }
          // 30% chance: still replies, but also queues business
          addUnfinishedBusiness(authorId, {
            prompt:   content,
            reason:   'Provocationele vraag...  Michael antwoordde maar vergeet het niet',
            severity: 1,
            messageId: msg.id,
            channelId,
          });
        }

        if (!isMichaelLifeActive(guildId, channelId)) return;

        const gwLangCode = resolveLanguage(guildId, authorId);
        const gwLang = getLang(gwLangCode);

        // In Arabic mode: if someone said "michael" (not the poet's name), use the
        // identity-rejection replies ("Who do you speak of? I am Imru' al-Qais.")
        // If they said the poet's name correctly, use normal nameReplies.
        const saidMichael = /michael/i.test(content);
        const pool = (gwLangCode === 'ar' && saidMichael && gwLang.ui.wrongNameReplies)
          ? gwLang.ui.wrongNameReplies
          : (gwLang.ui.nameReplies ?? gwLang.ui.shadowReplyLines);
        const reply = pool[Math.floor(Math.random() * pool.length)];

        try {
          const res = await DiscordRequest(`channels/${channelId}/messages`, {
            method: 'POST',
            body: { content: reply },
          });
          const sentMsg = await res.json();

          // Feature 5...  Maybe edit the reply a few seconds later
          if (sentMsg?.id) {
            const userMood = loadUserMemory(authorId).currentMood ?? 'afwezig';
            maybeScheduleRevision(channelId, sentMsg.id, reply, userMood, gwLangCode);
          }
          console.log(`[michael] gateway | name-mention reply | ch=${channelId} | user=${authorId}`);
        } catch (err) {
          console.error('[michael] gateway reply failed:', err.message);
        }
      }
      } catch (err) {
        console.error('[michael] gateway message handler error:', err.message);
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
