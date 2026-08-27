/**
 * Unprompted channel chat (gated by /switchoflife per server or channel).
 *
 * When the switch is on:
 *   - 0.5% chance Michael immediately replies with a canned snarky remark
 *   - 5% chance a message is queued as the one delayed reply
 *     (only one slot; later rolls are ignored until it is sent)
 *   - The queued reply fires after 10 minutes of silence in that channel
 *
 * Name-mention replies stay in gateway.js (always, when life-switch is on).
 */

import {
  DiscordRequest,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
} from '../utils.js';
import { isMichaelLifeActive } from './life-switch.js';
import { generateQuietAfterthought } from './openai.js';
import { getGuildLanguage } from './guild-settings.js';
import { getLang } from './lang/index.js';
import { loadUserMemory } from './michael-memory.js';

const SNARK_CHANCE = 0.005;
const QUEUE_CHANCE = 0.05;
const QUIET_MS = 10 * 60 * 1000;

/** @type {null | { messageId: string, channelId: string, authorId: string, username: string, content: string, guildId: string }} */
let queued = null;
let quietTimer = null;
let sending = false;
const lastMessageAtByChannel = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function scheduleQuietSend() {
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quietTimer = null;
    trySendQueued();
  }, QUIET_MS);
}

function dropQueued(reason) {
  if (queued) {
    console.log(`[michael] quiet-queue | dropped | ${reason} | msg=${queued.messageId}`);
  }
  queued = null;
  if (quietTimer) {
    clearTimeout(quietTimer);
    quietTimer = null;
  }
}

async function trySendQueued() {
  if (!queued || sending) return;
  if (isDutchQuietHoursForUnpromptedSends()) {
    console.log('[michael] quiet-queue | night window...  retry in 10 min');
    scheduleQuietSend();
    return;
  }
  const lastAt = lastMessageAtByChannel.get(queued.channelId) ?? 0;
  if (Date.now() - lastAt < QUIET_MS) {
    scheduleQuietSend();
    return;
  }

  sending = true;
  const item = queued;
  try {
    const langCode = getGuildLanguage(item.guildId);
    const lang = getLang(langCode);
    const mood = loadUserMemory(item.authorId).currentMood ?? 'afwezig';
    let content;
    try {
      content = await generateQuietAfterthought(item.username, item.content, mood, langCode);
    } catch (err) {
      console.warn('[michael] quiet-queue | AI failed, using canned line:', err.message);
      content = pick(lang.ui.shadowReplyLines);
    }
    if (!content) content = pick(lang.ui.shadowReplyLines);

    await DiscordRequest(`channels/${item.channelId}/messages`, {
      method: 'POST',
      body: {
        content,
        message_reference: { message_id: item.messageId, fail_if_not_exists: false },
        flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
      },
    });
    console.log(`[michael] quiet-queue | sent | msg=${item.messageId} | ch=${item.channelId}`);
    queued = null;
  } catch (err) {
    let errObj = {};
    try { errObj = JSON.parse(err.message); } catch { /* not JSON */ }
    if (errObj.code === 50001) {
      dropQueued(`50001 ch=${item.channelId}`);
    } else {
      console.error('[michael] quiet-queue | send failed:', err.message);
      scheduleQuietSend();
    }
  } finally {
    sending = false;
  }
}

async function sendSnark({ messageId, channelId, guildId }) {
  const langCode = getGuildLanguage(guildId);
  const lang = getLang(langCode);
  const lines = lang.ui.snarkReplies ?? lang.ui.shadowReplyLines;
  const content = pick(lines);
  try {
    await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content,
        message_reference: { message_id: messageId, fail_if_not_exists: false },
      },
    });
    console.log(`[michael] snark | msg=${messageId} | ch=${channelId}`);
  } catch (err) {
    console.error('[michael] snark failed:', err.message);
  }
}

/**
 * Called for every non-bot guild message from the gateway.
 * Name-mentions are handled in gateway.js instead.
 */
export function handleUnpromptedChat({
  messageId,
  channelId,
  authorId,
  username,
  content,
  guildId,
  mentionsMichael,
}) {
  if (!guildId || !channelId || !messageId) return;

  lastMessageAtByChannel.set(channelId, Date.now());
  if (queued && queued.channelId === channelId) {
    scheduleQuietSend();
  }

  if (!isMichaelLifeActive(guildId, channelId)) return;
  if (mentionsMichael) return;
  if (isDutchQuietHoursForUnpromptedSends()) return;

  if (Math.random() < SNARK_CHANCE) {
    sendSnark({ messageId, channelId, guildId });
    return;
  }

  if (queued) return;
  if (Math.random() >= QUEUE_CHANCE) return;

  queued = {
    messageId,
    channelId,
    authorId,
    username: username || authorId,
    content: String(content ?? '').slice(0, 400),
    guildId,
  };
  scheduleQuietSend();
  console.log(`[michael] quiet-queue | armed | msg=${messageId} | ch=${channelId} | in 10 min if silent`);
}
