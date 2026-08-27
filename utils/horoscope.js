import { loadAllMemory, loadUserMemory, getJudgementLabel, resolveField } from './michael-memory.js';
import { generateHoroscope } from './openai.js';

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
  const pool = new Set(memberIds);
  const ranked = [...pool]
    .map((id) => ({ id, score: memoryRichness(all[id]) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = new Set();
  for (const id of ensureUserIds) {
    if (pool.has(id)) picked.add(id);
  }

  for (const { id } of ranked) {
    if (picked.size >= count) break;
    picked.add(id);
  }

  return [...picked].slice(0, count);
}

export function buildSubjectDossier(userId, memory, getCosmicRole) {
  const mem = memory ?? loadUserMemory(userId);
  const username = mem.username || userId;
  const judgement = getJudgementLabel(mem.judgementScore ?? 0);
  const mood = mem.currentMood ?? 'afwezig';
  const cosmic = getCosmicRole?.(userId) ?? null;
  const prompts = (mem.prompts ?? []).filter(p => !p.startsWith('[')).slice(-2);
  const character = mem.michaelCharacter;
  const lines = [
    `username: ${username}`,
    `judgement: ${judgement} (${mem.judgementScore ?? 0})`,
    `mood toward them: ${mood}`,
    `impression: ${mem.impression ?? '(none)'}`,
    `recent messages: ${prompts.length ? prompts.join(' | ') : '(none)'}`,
    `cosmic role: ${cosmic ?? 'none'}`,
  ];
  if (character) {
    lines.push(`character: ${resolveField(character.archetype, 'en')} / ${resolveField(character.lineage, 'en')} / ${resolveField(character.title, 'en')}`);
  }
  const grudges = mem.unfinishedBusiness?.length ?? 0;
  if (grudges) lines.push(`open grudges: ${grudges}`);
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

export function formatDailyBulletin(lang, { dateLabel, horoscopeBody, chosenUserId, boodschap }) {
  const h = lang.horoscope;
  return clampContent([
    h.header,
    h.dailyTitle,
    h.dateLine(dateLabel),
    '',
    horoscopeBody,
    '',
    h.divider,
    lang.uitverkorene.header,
    h.chosenTitle,
    '',
    `<@${chosenUserId}>`,
    '',
    `*${boodschap}*`,
  ].join('\n'));
}

export function formatCommandHoroscope(lang, { dateLabel, horoscopeBody, chosenUserId }) {
  const h = lang.horoscope;
  const parts = [
    h.header,
    h.commandTitle,
    h.dateLine(dateLabel),
    '',
    horoscopeBody,
  ];
  if (chosenUserId) {
    parts.push('', h.divider, h.currentChosen(chosenUserId));
  }
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
  getCosmicRole,
}) {
  const subjectIds = pickHoroscopeSubjects(memberIds, {
    count: mode === 'daily' ? 3 : 2,
    ensureUserIds,
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
  });
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
