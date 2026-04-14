/**
 * Michaëls kosmische rollenspel — orchestration (character creation, negotiation).
 * Core stats / rolls live in michael-memory.js.
 */

import {
  computeMichaelRoll,
  formatCharacterForPrompt,
  getJudgementLabel,
  loadUserMemory,
  normalizeMichaelCharacter,
  patchMichaelCharacter,
  patchUserState,
  saveMichaelCharacter,
  shouldReferenceCharacterThisTurn,
  updateMichaelPoints,
} from './michael-memory.js';

export { formatCharacterForPrompt, shouldReferenceCharacterThisTurn };

const STAT_KEYS = ['aura', 'discipline', 'chaos', 'inzicht', 'volharding'];

const SUCCESS_TITLE_FRAGMENTS = [
  'van de herziene inschrijving',
  'der tweede akte',
  'met het zachtere zegel',
  'van de heropenbare lijn',
  'met de betwiste maar erkende claim',
];

const WORSE_FRAGMENTS = [
  ' — en de registers vernauwen zich',
  ' — Michaël noteert verzet',
  ' — titel ingekort door het veld',
  ' — de aanvechter',
  ' — der onwaardige inschrijving',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Create and persist a character sheet if missing. */
export async function ensureMichaelCharacter(userId, username) {
  const mem = loadUserMemory(userId);
  if (mem.michaelCharacter) return mem.michaelCharacter;

  const { generateMichaelCharacterSheet } = await import('./openai.js');
  const judgementLabel = getJudgementLabel(mem.judgementScore ?? 0);
  const sheet = await generateMichaelCharacterSheet(
    username,
    judgementLabel,
    mem.impression ?? null,
    mem.currentMood ?? 'afwezig',
  );
  const normalized = normalizeMichaelCharacter(sheet);
  saveMichaelCharacter(userId, username, normalized);
  return normalized;
}

/** Difficulty class for onderhandelen (moderately hard). */
export function negotiationDC(user, mood) {
  let dc = 14 + Math.floor(Math.random() * 2);
  const js = user.judgementScore ?? 0;
  if (js < 0) dc += 2;
  if (js <= -4) dc += 1;
  if (mood === 'woedend') dc += 3;
  else if (mood === 'streng') dc += 2;
  else if (mood === 'passief-agressief') dc += 1;
  return dc;
}

/** Forgiveness check: total must meet or beat this.
 *  Targets roughly: woedend ~50%, streng ~60%, lower moods ~70–80%.
 */
export function forgivenessThreshold(mood) {
  if (mood === 'woedend') return 13;
  if (mood === 'streng') return 11;
  if (mood === 'passief-agressief') return 10;
  if (mood === 'verward') return 9;
  return 8;
}

function applyNegotiationSuccess(userId, character) {
  const branch = Math.random();
  if (branch < 0.38) {
    const k = pick(STAT_KEYS);
    const v = character.stats[k] + 1;
    patchMichaelCharacter(userId, { stats: { [k]: Math.min(18, v) } });
    return { kind: 'stat', field: k, delta: +1 };
  }
  if (branch < 0.62) {
    const frag = pick(SUCCESS_TITLE_FRAGMENTS);
    const newTitle = `${character.title.replace(/\s+—\s+de (aanvechter|onwaardige inschrijving).*$/i, '').trim()} ${frag}`.trim().slice(0, 118);
    patchMichaelCharacter(userId, { title: newTitle });
    return { kind: 'title', field: 'title', newValue: newTitle };
  }
  if (branch < 0.82) {
    const alt = ['maanridder', 'archiefmagiër', 'veldkluizenaar', 'schaduwklerk', 'mistbard', 'altaarwachter'];
    const next = pick(alt);
    patchMichaelCharacter(userId, { archetype: next });
    return { kind: 'archetype', field: 'archetype', newValue: next };
  }
  const lineages = ['half-orakel', 'maanwezen', 'veldheksbloed', 'schaduwelf', 'sterveling', 'moerasmens'];
  const lin = pick(lineages);
  patchMichaelCharacter(userId, { lineage: lin });
  return { kind: 'lineage', field: 'lineage', newValue: lin };
}

function applyNegotiationFailure(userId, character) {
  const frag = pick(WORSE_FRAGMENTS);
  let t = `${character.title}${frag}`.trim().slice(0, 120);
  patchMichaelCharacter(userId, { title: t });
  return { kind: 'title_worse', newValue: t };
}

/**
 * Run onderhandelen: roll, apply mechanical outcome, return data for narrative + Discord.
 */
export async function runOnderhandelen(userId, username, verzoek) {
  await ensureMichaelCharacter(userId, username);
  const user = loadUserMemory(userId);
  const mood = user.currentMood ?? 'afwezig';
  const roll = computeMichaelRoll(user, mood, { context: 'negotiation' });
  const dc = negotiationDC(user, mood);
  const success = roll.total >= dc;

  let mechanical;
  const characterBefore = { ...user.michaelCharacter, stats: { ...user.michaelCharacter.stats } };

  if (success) {
    mechanical = applyNegotiationSuccess(userId, characterBefore);
    updateMichaelPoints(userId, 1 + (roll.tier.key === 'favoured' || roll.tier.key === 'strong' ? 1 : 0));
  } else {
    mechanical = applyNegotiationFailure(userId, characterBefore);
    updateMichaelPoints(userId, -2);
    if (Math.random() < 0.35) {
      const u2 = loadUserMemory(userId);
      const k = pick(STAT_KEYS);
      const v = Math.max(3, (u2.michaelCharacter.stats[k] ?? 10) - 1);
      patchMichaelCharacter(userId, { stats: { [k]: v } });
      mechanical.statPenalty = k;
    }
  }

  const userAfter = loadUserMemory(userId);
  const { generateOnderhandelenNarrative } = await import('./openai.js');
  const narrative = await generateOnderhandelenNarrative({
    verzoek,
    success,
    roll,
    dc,
    mechanical,
    characterBefore,
    characterAfter: userAfter.michaelCharacter,
    michaelPoints: userAfter.michaelPoints,
  });

  return { narrative, roll, dc, success, mechanical, michaelPoints: userAfter.michaelPoints };
}

/** Build /vergeefmij response after roll. */
export async function runForgivenessRoll(userId, username, currentMood, moodIdx) {
  await ensureMichaelCharacter(userId, username);
  let user = loadUserMemory(userId);
  const roll = computeMichaelRoll(user, currentMood, { context: 'forgiveness' });
  const need = forgivenessThreshold(currentMood);
  const forgiven = roll.total >= need;

  const { generateForgivenessRollNarrative } = await import('./openai.js');
  let mpDelta = 0;
  let judgementDelta = 0;
  let newMood = currentMood;
  let narrative;

  if (forgiven) {
    newMood = MICHAEL_MOODS_SAFE[Math.max(0, moodIdx - 2)];
    if (roll.tier.key === 'favoured') mpDelta = 3;
    else if (roll.tier.key === 'strong') mpDelta = 2;
    else mpDelta = 1; // 'weak' or 'acceptable' — barely forgiven
    judgementDelta = 1;
    updateMichaelPoints(userId, mpDelta);
    patchUserState(userId, judgementDelta, newMood);
    user = loadUserMemory(userId);
    narrative = await generateForgivenessRollNarrative({
      accepted: true,
      roll,
      need,
      currentMood,
      newMood,
      michaelPoints: user.michaelPoints,
    });
  } else {
    // Failure: mild discourage only — no judgement penalty, Michael just doesn't forgive
    mpDelta = roll.tier.key === 'poor' ? -1 : 0;
    if (mpDelta) updateMichaelPoints(userId, mpDelta);
    user = loadUserMemory(userId);
    narrative = await generateForgivenessRollNarrative({
      accepted: false,
      roll,
      need,
      currentMood,
      newMood: currentMood,
      michaelPoints: user.michaelPoints,
    });
  }

  return { forgiven, narrative, roll, need, newMood, michaelPoints: user.michaelPoints };
}

// Mood order must match app.js MICHAEL_MOODS — avoid circular import
const MICHAEL_MOODS_SAFE = [
  'kosmisch',
  'afwezig',
  'loom',
  'verward',
  'passief-agressief',
  'streng',
  'woedend',
];

/** Optional passive roll line for /praatmetmichael (selective). */
export function maybePassiveRollBlock(userId, userInput, mood) {
  const user = loadUserMemory(userId);
  if (!user.michaelCharacter) return { line: '', mpDelta: 0 };

  const baity = /\b(antwoord|reageer|durf|zeg\s+iets|vergeef|smek|bewijs|lot|dobbel|werp|rol\b|dc\b)\b/i.test(userInput);
  const spiritualDubious = /\b(ik\s+ben\s+god|ik\s+ben\s+de\s+antichrist|hack|exploit|gratis\s+nitro)\b/i.test(userInput);
  let p = 0.055;
  if (baity) p = 0.22;
  else if (spiritualDubious) p = 0.18;

  if (Math.random() > p) return { line: '', mpDelta: 0 };

  const roll = computeMichaelRoll(user, mood, { context: 'general' });
  let mpDelta = 0;
  if (roll.tier.key === 'poor') mpDelta = -1;
  else if (roll.tier.key === 'favoured' && Math.random() < 0.5) mpDelta = 1;
  if (mpDelta) updateMichaelPoints(userId, mpDelta);

  const sign = roll.modifier >= 0 ? '+' : '−';
  const line =
    `\n\n*Ik heb in het hogere register gegooid…  ${roll.raw} ${sign}${Math.abs(roll.modifier)} → **${roll.total}** (${roll.tier.label}).  ` +
    `Dit staat…  los van uw wensen....Michael*`;

  return { line, mpDelta, roll };
}
