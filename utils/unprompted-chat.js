/**
 * Unprompted channel behaviour.
 *
 * Life-switch (/switchoflife) gates:
 *   - 0.5% instant snark replies to random messages
 *   - Name-mention replies (handled in gateway.js)
 *
 * Independent of life-switch:
 *   - Unfinished business: after 10 minutes of silence Michael circles back
 *     to a grudge he filed earlier, replying to the original message to
 *     keep the conversation going. Only one resurface is armed at a time; a newer
 *     filing replaces the queued one and resets the 10-minute timer (never stacks).
 */

import {
  DiscordRequest,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
} from '../utils.js';
import { isMichaelLifeActive } from './life-switch.js';
import { generateDelayedConsequence } from './openai.js';
import { getGuildLanguage } from './guild-settings.js';
import { getLang } from './lang/index.js';
import {
  loadUserMemory,
  getOutstandingBusiness,
  markBusinessMentioned,
  markBusinessResolved,
  getJudgementLabel,
} from './michael-memory.js';
import { getCurrentAntichristUserId, getUitverkoreneUserId, isAntichristCleansed } from './cosmic-state.js';

const SNARK_CHANCE = 0.005;
const SILENCE_MS = 10 * 60 * 1000;

/** @type {null | { messageId: string, channelId: string, authorId: string, username: string, guildId: string, businessId: string }} */
let pendingBusiness = null;
let silenceTimer = null;
let sending = false;
const lastMessageAtByChannel = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cosmicRoleFor(userId, guildId) {
  if (!guildId) return null;
  if (getCurrentAntichristUserId(guildId) === userId && !isAntichristCleansed(guildId)) return 'antichrist';
  if (getUitverkoreneUserId(guildId) === userId) return 'uitverkorene';
  return null;
}

function scheduleBusinessTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    trySendPendingBusiness();
  }, SILENCE_MS);
}

function clearBusinessTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

/**
 * Arm the 10-minute silence timer for unfinished business in a channel.
 * Not gated by /switchoflife. Only one send can be pending; a newer filing
 * replaces the previous target and resets the silence clock.
 */
export function scheduleBusinessResurface({
  messageId,
  channelId,
  authorId,
  username,
  guildId,
  businessId,
}) {
  if (!channelId || !businessId || !guildId) return false;
  const replacing = Boolean(pendingBusiness);
  pendingBusiness = {
    messageId: messageId ?? null,
    channelId,
    authorId,
    username: username || authorId,
    guildId,
    businessId,
  };
  scheduleBusinessTimer();
  console.log(
    `[michael] business-resurface | ${replacing ? 'replaced' : 'armed'} | user=${authorId} | ch=${channelId} | in 10 min if silent`,
  );
  return true;
}

async function trySendPendingBusiness() {
  if (sending) return;
  if (!pendingBusiness) return;

  if (isDutchQuietHoursForUnpromptedSends()) {
    console.log('[michael] business-resurface | night window...  retry in 10 min');
    scheduleBusinessTimer();
    return;
  }

  const { channelId } = pendingBusiness;
  const lastAt = lastMessageAtByChannel.get(channelId) ?? 0;
  if (Date.now() - lastAt < SILENCE_MS) {
    scheduleBusinessTimer();
    return;
  }

  sending = true;
  try {
    await trySendBusiness(pendingBusiness);
  } catch (err) {
    let errObj = {};
    try { errObj = JSON.parse(err.message); } catch { /* not JSON */ }
    if (errObj.code === 50001) {
      console.log(`[michael] business-resurface | dropped | 50001 ch=${channelId}`);
      pendingBusiness = null;
      clearBusinessTimer();
    } else {
      console.error('[michael] business-resurface | send failed:', err.message);
      scheduleBusinessTimer();
    }
  } finally {
    sending = false;
  }
}

async function trySendBusiness(item) {
  const outstanding = getOutstandingBusiness(item.authorId);
  const business = outstanding.find((b) => b.id === item.businessId);
  if (!business) {
    console.log(`[michael] business-resurface | expired or resolved | id=${item.businessId}`);
    pendingBusiness = null;
    return false;
  }

  const langCode = getGuildLanguage(item.guildId);
  const lang = getLang(langCode);
  const memory = loadUserMemory(item.authorId);
  const mood = memory.currentMood ?? 'afwezig';
  const judgementLabel = getJudgementLabel(memory.judgementScore ?? 0);

  let content;
  try {
    content = await generateDelayedConsequence(
      item.username,
      business,
      mood,
      judgementLabel,
      langCode,
      cosmicRoleFor(item.authorId, item.guildId),
    );
  } catch (err) {
    console.warn('[michael] business-resurface | AI failed, using canned line:', err.message);
    content = pick(lang.ui.shadowReplyLines);
  }
  if (!content) content = pick(lang.ui.shadowReplyLines);

  const refId = business.messageId ?? item.messageId;
  await DiscordRequest(`channels/${item.channelId}/messages`, {
    method: 'POST',
    body: {
      content,
      ...(refId ? { message_reference: { message_id: refId, fail_if_not_exists: false } } : {}),
      flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
    },
  });

  markBusinessMentioned(item.authorId, business.id);
  if (business.severity <= 2) markBusinessResolved(item.authorId, business.id);

  console.log(`[michael] business-resurface | sent | user=${item.authorId} | ch=${item.channelId} | sev=${business.severity}`);
  pendingBusiness = null;
  return true;
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
 * Resets the business silence timer; snark is life-switch only.
 * Name-mentions are handled in gateway.js.
 */
export function handleUnpromptedChat({
  messageId,
  channelId,
  guildId,
  mentionsMichael,
}) {
  if (!guildId || !channelId || !messageId) return;

  lastMessageAtByChannel.set(channelId, Date.now());
  if (pendingBusiness?.channelId === channelId) {
    scheduleBusinessTimer();
  }

  if (!isMichaelLifeActive(guildId, channelId)) return;
  if (mentionsMichael) return;
  if (isDutchQuietHoursForUnpromptedSends()) return;

  if (Math.random() < SNARK_CHANCE) {
    sendSnark({ messageId, channelId, guildId });
  }
}
