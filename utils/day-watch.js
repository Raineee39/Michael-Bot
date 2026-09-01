/**
 * Today's card is law. Watches guild chat and stamps rarely.
 * Independent of /switchoflife. Quiet hours: reactions only.
 */

import {
  addDiscordReaction,
  DiscordRequest,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
} from '../utils.js';
import { generateLawStamp } from './openai.js';
import { getGuildLanguage } from './guild-settings.js';
import { getLang } from './lang/index.js';
import { patchUserState } from './michael-memory.js';
import {
  canPublicStamp,
  fulfillProphecy,
  getTodayCard,
  hasOnce,
  markOnce,
  markPublicStamp,
  recordDayEvent,
} from './day-ledger.js';

const REACTIONS = {
  forbidden: '📜',
  prophecy: '⚡',
  least: '😒',
  chosen: '👁️',
  antichrist: '🔥',
  rule: '⚖️',
};

function wordHit(text, word) {
  const w = String(word ?? '').trim();
  if (w.length < 3) return false;
  try {
    return new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text);
  } catch {
    return text.toLowerCase().includes(w.toLowerCase());
  }
}

function anyWatch(text, words = []) {
  return words.some((w) => wordHit(text, w));
}

function pickHit(card, authorId, content) {
  if (card.forbiddenWord && wordHit(content, card.forbiddenWord)) {
    return { kind: 'forbidden', onceKey: `forbidden:${authorId}`, extra: card.forbiddenWord, word: card.forbiddenWord };
  }
  for (const p of card.prophecies ?? []) {
    if (p.userId !== authorId || p.status !== 'open') continue;
    if (anyWatch(content, p.watch)) {
      return { kind: 'prophecy', onceKey: `prophecy:${p.id}`, extra: p.claim, prophecyId: p.id, claim: p.claim };
    }
  }
  if (card.rule && anyWatch(content, card.ruleWatch)) {
    return { kind: 'rule', onceKey: `rule:${authorId}`, extra: card.rule };
  }
  if (authorId === card.leastFavouriteUserId) {
    return { kind: 'least', onceKey: `speak:least:${authorId}`, extra: card.leastFavouriteReason };
  }
  return null;
}

async function react(channelId, messageId, kind) {
  const emoji = REACTIONS[kind];
  if (!emoji) return;
  await addDiscordReaction(channelId, messageId, emoji);
}

async function stampLine(kind, langCode, lang, userId, extra) {
  try {
    return await generateLawStamp({ kind, langCode, userId, extra });
  } catch (err) {
    console.warn('[michael] day-law stamp AI failed:', err?.message ?? err);
    const pool = lang.dayLaw?.stamps?.[kind];
    const line = Array.isArray(pool) ? pool[Math.floor(Math.random() * pool.length)] : null;
    return (line || lang.dayLaw.stampFallback).replace('{user}', `<@${userId}>`).replace('{extra}', extra || '');
  }
}

/**
 * Inspect one guild message against today's law. At most one action.
 */
export async function handleDayLawMessage({
  guildId,
  channelId,
  messageId,
  authorId,
  content,
  offices = {},
}) {
  if (!guildId || !channelId || !messageId || !authorId) return;
  const card = getTodayCard(guildId);
  if (!card) return;

  const text = String(content ?? '');
  if (!text.trim()) return;

  let hit = pickHit(card, authorId, text);
  if (!hit && authorId === offices.chosenUserId) {
    hit = { kind: 'chosen', onceKey: `speak:chosen:${authorId}`, extra: '' };
  } else if (!hit && authorId === offices.antichristUserId && !offices.antichristCleansed) {
    hit = { kind: 'antichrist', onceKey: `speak:ant:${authorId}`, extra: '' };
  }
  if (!hit) return;
  if (hasOnce(guildId, hit.onceKey)) {
    if (hit.kind === 'forbidden') await react(channelId, messageId, 'forbidden');
    return;
  }

  markOnce(guildId, hit.onceKey);
  if (hit.prophecyId) fulfillProphecy(guildId, hit.prophecyId);

  recordDayEvent(guildId, {
    kind: hit.kind,
    userId: authorId,
    word: hit.word,
    claim: hit.claim,
  });

  if (hit.kind === 'prophecy') patchUserState(authorId, 2);
  if (hit.kind === 'forbidden') patchUserState(authorId, -1);

  const quiet = isDutchQuietHoursForUnpromptedSends();
  const maySpeak = !quiet && canPublicStamp(guildId);

  if (!maySpeak) {
    await react(channelId, messageId, hit.kind);
    return;
  }

  const langCode = getGuildLanguage(guildId);
  const lang = getLang(langCode);
  const contentLine = await stampLine(hit.kind, langCode, lang, authorId, hit.extra);
  markPublicStamp(guildId, hit.kind);

  try {
    await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content: contentLine,
        message_reference: { message_id: messageId, fail_if_not_exists: false },
        flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
      },
    });
    console.log(`[michael] day-law stamp | ${hit.kind} | guild=${guildId} | user=${authorId}`);
  } catch (err) {
    console.error('[michael] day-law stamp failed:', err?.message ?? err);
    await react(channelId, messageId, hit.kind);
  }
}
