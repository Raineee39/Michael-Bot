import { loadAllMemory, loadUserMemory, getJudgementLabel, resolveField, patchUserState, guildInteractionAt, interactorIdsForGuild } from './michael-memory.js';
import { generateBooksClosed, generateDayLaw, generateHoroscope } from './openai.js';
import {
  getTodayCard,
  recentFeaturedUserIds,
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

function recencyBonus(mem, guildId) {
  const seen = guildInteractionAt(mem, guildId);
  if (!seen) return 0;
  const days = (Date.now() - seen) / (24 * 60 * 60 * 1000);
  if (days <= 2) return 8;
  if (days <= 7) return 5;
  if (days <= 21) return 3;
  if (days <= 45) return 1;
  return 0;
}

function weightedSample(items, count) {
  const pool = items.map((x) => ({ ...x }));
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, x) => s + Math.max(0.1, x.weight), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= Math.max(0.1, pool[idx].weight);
      if (r <= 0) break;
    }
    idx = Math.min(idx, pool.length - 1);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** Pick souls to weave into the horoscope. Prefers recent Michael users; rotates. */
export function pickHoroscopeSubjects(memberIds, {
  count = 3,
  ensureUserIds = [],
  excludeUserIds = [],
  guildId = null,
} = {}) {
  const all = loadAllMemory();
  const ensured = [...new Set((ensureUserIds ?? []).filter(Boolean))];
  const banned = new Set((excludeUserIds ?? []).filter((id) => !ensured.includes(id)));
  const pool = new Set([...(memberIds ?? []), ...ensured]);
  const interactors = new Set(guildId ? interactorIdsForGuild(guildId) : []);

  const scored = [...pool]
    .filter((id) => !banned.has(id))
    .map((id) => {
      const mem = all[id];
      const richness = memoryRichness(mem);
      const interacted = interactors.has(id) || guildInteractionAt(mem, guildId);
      const weight = (interacted ? 6 : 0) + richness + recencyBonus(mem, guildId) + Math.random() * 3;
      return { id, richness, interacted, weight };
    });

  const preferred = scored.filter((x) => x.interacted || x.richness > 0);
  const candidates = preferred.length >= 2 ? preferred : scored;

  const picked = new Set(ensured);
  const target = Math.max(count, ensured.length);
  for (const { id } of weightedSample(candidates.filter((x) => !picked.has(x.id)), target - picked.size)) {
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

/** Discord does not ping or render <@id> inside ``` / `code` / 4-space blocks. */
function plainMentions(text) {
  return String(text ?? '')
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')
    .replace(/```/g, '')
    .replace(/`(<@\d+>)`/g, '$1')
    .replace(/^ {4}/gm, '')
    .trim();
}

function buildCardBody(lang, card, horoscopeBody) {
  const h = lang.horoscope;
  const L = lang.dayLaw;
  const lines = [];
  if (card) {
    lines.push(`**${h.moodLabel}:** ${card.mood}`, '');
    if (card.omen) lines.push(card.omen);
    if (card.amendment) lines.push(card.amendment);
    for (const p of card.prophecies ?? []) {
      lines.push(`<@${p.userId}> ${p.claim}`);
    }
    lines.push('');
    if (card.leastFavouriteUserId) {
      const why = card.leastFavouriteReason ? ` (${card.leastFavouriteReason})` : '';
      lines.push(`**${L.leastLabel}:** <@${card.leastFavouriteUserId}>${why}`);
    }
    if (card.forbiddenWord) lines.push(`**${L.forbiddenLabel}:** ${card.forbiddenWord}`);
    if (card.rule) lines.push(`**${L.ruleLabel}:** ${card.rule}`);
    for (const s of card.stats ?? []) {
      lines.push(`**${s.label}:** ${s.value}`);
    }
    lines.push('', `*${L.inForce}*`);
  } else if (horoscopeBody) {
    lines.push(horoscopeBody);
  }
  return lines.join('\n').trim();
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
  const head = [h.header, title, h.dateLine(dateLabel), ''].join('\n');
  const body = buildCardBody(lang, card, horoscopeBody);
  const soFarBlock = soFar.length
    ? [h.divider, `**${L.soFarTitle}**`, ...soFar.map((line) => `• ${line}`)].join('\n')
    : '';
  const closeClean = plainMentions(closing).slice(0, 320);
  const closeBlock = closeClean ? [h.divider, L.booksHeader, closeClean].join('\n') : '';
  const foot = '....Michael';

  const assemble = (includeSoFar, includeClose) => [
    head,
    body,
    includeSoFar ? soFarBlock : '',
    includeClose ? closeBlock : '',
    foot,
  ].filter(Boolean).join('\n').trim();

  let out = assemble(true, true);
  if (out.length > 1990) out = assemble(false, true);
  if (out.length > 1990) out = assemble(false, false);
  return clampContent(out);
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
  excludeUserIds = [],
  offices = {},
  getCosmicRole,
  guildId = null,
}) {
  const mustInclude = [
    ...ensureUserIds,
    offices.chosenUserId,
    offices.antichristUserId,
  ].filter(Boolean);
  const subjectIds = pickHoroscopeSubjects(memberIds, {
    count: mode === 'daily' ? 4 : 3,
    ensureUserIds: mustInclude,
    excludeUserIds,
    guildId,
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
    excludeUserIds: recentFeaturedUserIds(guildId, 3),
    guildId,
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

  let card;
  try {
    card = await generateDayLaw({
      langCode,
      lang,
      dateLabel: amsterdamDateLabel(langCode),
      aggregateMood: summarizeGuildMood(memberIds),
      subjects,
      offices: safeOffices,
      yesterdayDigest: closedYesterday ? yesterdayDigest(closedYesterday) : '',
    });
  } catch (err) {
    console.error('[michael] day law failed, using fallback card:', err?.message ?? err);
    card = {
      mood: langCode === 'nl' ? 'HET REGISTER STOTTERT' : 'THE REGISTER STUTTERS',
      omen: lang.dayLaw.booksFallback,
      prophecies: [],
      forbiddenWord: langCode === 'nl' ? 'STOF' : 'DUST',
      leastFavouriteUserId: null,
      leastFavouriteReason: '',
      rule: '',
      ruleWatch: [],
      stats: [],
    };
  }

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
