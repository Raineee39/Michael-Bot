import { loadAllMemory, loadUserMemory, getJudgementLabel, resolveField, patchUserState } from './michael-memory.js';
import { generateBooksClosed, generateDayLaw, generateHoroscope } from './openai.js';
import {
  getTodayCard,
  rollGuildDay,
  saveTodayCard,
  saveYesterdayClosing,
  soFarLines,
} from './day-ledger.js';

const MICHAEL_MOODS = [
  'kosmisch', 'afwezig', 'loom', 'verward', 'passief-agressief', 'streng', 'woedend',
];

function memoryRichness(mem) {
  if (!mem) return 0;
  let score = 0;
  if (mem.impression) score += 4;
  score += Math.min(mem.prompts?.filter(p => !p.startsWith('[')).length ?? 0, 6);
  score += Math.abs(mem.judgementScore ?? 0);
  if (mem.michaelCharacter) score += 2;
  if (mem.unfinishedBusiness?.length) score += 1;
  if (mem.confessions?.length) score += 1;
  return score;
}

/** Pick souls with dossier material to weave into the horoscope (no random filler). */
export function pickHoroscopeSubjects(memberIds, { count = 3, ensureUserIds = [] } = {}) {
  const all = loadAllMemory();
  const ensured = [...new Set((ensureUserIds ?? []).filter(Boolean))];
  const pool = new Set([...(memberIds ?? []), ...ensured]);
  const ranked = [...pool]
    .map((id) => ({ id, score: memoryRichness(all[id]) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = new Set(ensured);
  const target = Math.max(count, ensured.length);

  for (const { id } of ranked) {
    if (picked.size >= target) break;
    picked.add(id);
  }

  return [...picked].slice(0, target);
}

export function buildSubjectDossier(userId, memory, getCosmicRole) {
  const mem = memory ?? loadUserMemory(userId);
  const username = mem.username || userId;
  const judgement = getJudgementLabel(mem.judgementScore ?? 0);
  const mood = mem.currentMood ?? 'afwezig';
  const cosmic = getCosmicRole?.(userId) ?? null;
  const prompts = (mem.prompts ?? []).filter(p => !p.startsWith('[')).slice(-4);
  const character = mem.michaelCharacter;
  const lines = [
    `username: ${username}`,
    `discord id: ${userId}`,
    `judgement: ${judgement} (${mem.judgementScore ?? 0})`,
    `mood toward them: ${mood}`,
    `impression: ${mem.impression ?? '(none)'}`,
    `recent messages: ${prompts.length ? prompts.join(' | ') : '(none)'}`,
    `cosmic role: ${cosmic ?? 'none'}`,
  ];
  if (character) {
    lines.push(`character: ${resolveField(character.archetype, 'en')} / ${resolveField(character.lineage, 'en')} / ${resolveField(character.title, 'en')}`);
  }
  const business = (mem.unfinishedBusiness ?? []).slice(-2);
  if (business.length) {
    lines.push(`open grudges: ${business.map((b) => b.reason || b.prompt).join(' ; ')}`);
  }
  const confessions = (mem.confessions ?? []).slice(-2);
  if (confessions.length) {
    lines.push(`confessions on file: ${confessions.map((c) => String(c.text).slice(0, 80)).join(' | ')}`);
  }
  return lines.join('\n');
}

/** Aggregate mood counts across known guild members for the AI prompt. */
export function summarizeGuildMood(memberIds) {
  const all = loadAllMemory();
  const counts = Object.fromEntries(MICHAEL_MOODS.map(m => [m, 0]));
  let known = 0;
  for (const id of memberIds) {
    const mood = all[id]?.currentMood;
    if (!mood) continue;
    known += 1;
    if (counts[mood] !== undefined) counts[mood] += 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    knownUsers: known,
    dominantMood: dominant?.[1] ? dominant[0] : 'afwezig',
    counts,
  };
}

export function amsterdamDateLabel(langCode = 'nl') {
  return new Intl.DateTimeFormat(langCode === 'en' ? 'en-GB' : 'nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function clampContent(text, max = 1990) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 24)}\n...(register full)..Michael`;
}

export function formatDailyBulletin(lang, { dateLabel, horoscopeBody }) {
  return formatDayCard(lang, { dateLabel, title: lang.horoscope.dailyTitle, card: null, horoscopeBody });
}

export function formatCommandHoroscope(lang, { dateLabel, horoscopeBody }) {
  return formatDayCard(lang, { dateLabel, title: lang.horoscope.commandTitle, card: null, horoscopeBody });
}

export function formatDayCard(lang, { dateLabel, title, card, horoscopeBody, soFar = [], closing = '' }) {
  const h = lang.horoscope;
  const L = lang.dayLaw;
  const parts = [
    h.header,
    title,
    h.dateLine(dateLabel),
    '',
  ];
  if (closing) {
    parts.push(L.booksHeader, closing, '', h.divider, '');
  }
  if (card) {
    parts.push(`**${h.moodLabel}:** ${card.mood}`);
    parts.push('');
    if (card.omen) parts.push(card.omen);
    for (const p of card.prophecies ?? []) {
      parts.push(`<@${p.userId}> ${p.claim}`);
    }
    parts.push('');
    if (card.leastFavouriteUserId) {
      const why = card.leastFavouriteReason ? ` (${card.leastFavouriteReason})` : '';
      parts.push(`**${L.leastLabel}:** <@${card.leastFavouriteUserId}>${why}`);
    }
    if (card.forbiddenWord) parts.push(`**${L.forbiddenLabel}:** ${card.forbiddenWord}`);
    if (card.rule) parts.push(`**${L.ruleLabel}:** ${card.rule}`);
    for (const s of card.stats ?? []) {
      parts.push(`**${s.label}:** ${s.value}`);
    }
    parts.push('', `*${L.inForce}*`);
  } else if (horoscopeBody) {
    parts.push(horoscopeBody);
  }
  if (soFar.length) {
    parts.push('', h.divider, `**${L.soFarTitle}**`, ...soFar.map((line) => `• ${line}`));
  }
  parts.push('', '....Michael');
  return clampContent(parts.join('\n'));
}

export function formatPersonalHoroscope(lang, { dateLabel, horoscopeBody }) {
  const h = lang.horoscope;
  return clampContent([
    h.header,
    h.personalTitle,
    h.dateLine(dateLabel),
    '',
    horoscopeBody,
  ].join('\n'));
}

/**
 * Build AI horoscope text for a guild (or subset of members).
 */
export async function buildHoroscopeText({
  memberIds,
  langCode,
  lang,
  mode = 'command',
  ensureUserIds = [],
  offices = {},
  getCosmicRole,
}) {
  const mustInclude = [
    ...ensureUserIds,
    offices.chosenUserId,
    offices.antichristUserId,
  ].filter(Boolean);
  const subjectIds = pickHoroscopeSubjects(memberIds, {
    count: mode === 'daily' ? 4 : 3,
    ensureUserIds: mustInclude,
  });
  const subjects = subjectIds.map((userId) => ({
    userId,
    username: loadUserMemory(userId).username || userId,
    dossier: buildSubjectDossier(userId, loadUserMemory(userId), getCosmicRole),
  }));
  const aggregateMood = summarizeGuildMood(memberIds);
  return generateHoroscope({
    langCode,
    lang,
    dateLabel: amsterdamDateLabel(langCode),
    mode,
    aggregateMood,
    subjects,
    offices,
  });
}

function yesterdayDigest(closed) {
  if (!closed) return '';
  const lines = [];
  if (closed.card?.mood) lines.push(`mood was: ${closed.card.mood}`);
  if (closed.card?.forbiddenWord) lines.push(`forbidden word: ${closed.card.forbiddenWord}`);
  for (const p of closed.card?.prophecies ?? []) {
    lines.push(`prophecy <@${p.userId}> "${p.claim}" → ${p.status ?? 'open'}`);
  }
  for (const e of (closed.events ?? []).slice(-8)) {
    lines.push(`${e.kind}${e.userId ? ` <@${e.userId}>` : ''}${e.word ? ` ${e.word}` : ''}${e.claim ? ` ${e.claim}` : ''}`);
  }
  return lines.join('\n');
}

function applyClosingJudgement(closed) {
  if (!closed?.card) return;
  for (const p of closed.card.prophecies ?? []) {
    if (p.status === 'failed') patchUserState(p.userId, -1);
  }
}

/**
 * One law-card per guild per Amsterdam day. Creates it if missing.
 * Rolls yesterday closed (failed prophecies + judgement + Gemini epilogue).
 */
export async function buildDayLawForGuild({
  guildId,
  memberIds,
  langCode,
  lang,
  offices = {},
  getCosmicRole,
  title,
}) {
  const { closedYesterday } = rollGuildDay(guildId);
  let closing = closedYesterday?.closing || '';
  if (closedYesterday?.card && !closing) {
    applyClosingJudgement(closedYesterday);
    try {
      closing = await generateBooksClosed({
        langCode,
        dateLabel: closedYesterday.dateKey,
        digest: yesterdayDigest(closedYesterday),
      });
    } catch (err) {
      console.error('[michael] books-closed failed:', err?.message ?? err);
      closing = lang.dayLaw.booksFallback;
    }
    saveYesterdayClosing(guildId, closing);
  }

  const existing = getTodayCard(guildId);
  if (existing) {
    return {
      card: existing,
      content: formatDayCard(lang, {
        dateLabel: amsterdamDateLabel(langCode),
        title,
        card: existing,
        soFar: soFarLines(guildId, lang),
        closing,
      }),
      offices,
      created: false,
    };
  }

  const mustInclude = [offices.chosenUserId, offices.antichristUserId].filter(Boolean);
  const subjectIds = pickHoroscopeSubjects(memberIds, {
    count: 4,
    ensureUserIds: mustInclude,
  });
  const subjects = subjectIds.map((userId) => ({
    userId,
    username: loadUserMemory(userId).username || userId,
    dossier: buildSubjectDossier(userId, loadUserMemory(userId), getCosmicRole),
  }));
  const allowed = new Set(subjects.map((s) => s.userId));
  const safeOffices = {
    chosenUserId: allowed.has(offices.chosenUserId) ? offices.chosenUserId : null,
    antichristUserId: allowed.has(offices.antichristUserId) ? offices.antichristUserId : null,
  };

  const card = await generateDayLaw({
    langCode,
    lang,
    dateLabel: amsterdamDateLabel(langCode),
    aggregateMood: summarizeGuildMood(memberIds),
    subjects,
    offices: safeOffices,
    yesterdayDigest: closedYesterday ? yesterdayDigest(closedYesterday) : '',
  });

  saveTodayCard(guildId, card, safeOffices);
  return {
    card,
    content: formatDayCard(lang, {
      dateLabel: amsterdamDateLabel(langCode),
      title,
      card,
      closing,
    }),
    offices: safeOffices,
    created: true,
  };
}

export async function buildPersonalHoroscopeText(userId, langCode, lang) {
  const mem = loadUserMemory(userId);
  const subjects = [{
    userId,
    username: mem.username || userId,
    dossier: buildSubjectDossier(userId, mem, () => null),
  }];
  return generateHoroscope({
    langCode,
    lang,
    dateLabel: amsterdamDateLabel(langCode),
    mode: 'personal',
    aggregateMood: { knownUsers: 1, dominantMood: mem.currentMood ?? 'afwezig', counts: {} },
    subjects,
  });
}
