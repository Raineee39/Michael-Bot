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
} from './michael-memory.js';

export { formatCharacterForPrompt, shouldReferenceCharacterThisTurn };

const STAT_KEYS = ['aura', 'discipline', 'chaos', 'inzicht', 'volharding'];

const SUCCESS_TITLE_FRAGMENTS = {
  nl: [
    'van de herziene inschrijving',
    'der tweede akte',
    'met het zachtere zegel',
    'van de heropenbare lijn',
    'met de betwiste maar erkende claim',
  ],
  en: [
    'of the revised entry',
    'of the second act',
    'with the softer seal',
    'of the reopened line',
    'with the contested but recognised claim',
  ],
  ar: [
    'المُعاد تسجيله',
    'ذو الفصل الثاني',
    'بالختم المُخفَّف',
    'السطر المُعاد فتحه',
    'صاحب المطالبة المُعترَض عليها',
  ],
};

const WORSE_FRAGMENTS = {
  nl: [
    ' — en de registers vernauwen zich',
    ' — Michaël noteert verzet',
    ' — titel ingekort door het veld',
    ' — de aanvechter',
    ' — der onwaardige inschrijving',
  ],
  en: [
    ' — and the registers narrow',
    ' — Michael notes resistance',
    ' — title amended by the field',
    ' — the challenger',
    ' — of the unworthy enrolment',
  ],
  ar: [
    ' — والسجلات تضيق',
    ' — امرؤ القيس يُدوِّن العصيان',
    ' — اللقب مختصَر من الميدان',
    ' — المُنازِع',
    ' — التسجيل الناقص',
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Create and persist a character sheet if missing, or if the language changed. */
export async function ensureMichaelCharacter(userId, username, langCode = 'nl') {
  const mem = loadUserMemory(userId);
  if (mem.michaelCharacter && mem.michaelCharacter.lang === langCode) return mem.michaelCharacter;

  const { generateMichaelCharacterSheet } = await import('./openai.js');
  const judgementLabel = getJudgementLabel(mem.judgementScore ?? 0);
  const sheet = await generateMichaelCharacterSheet(
    username,
    judgementLabel,
    mem.impression ?? null,
    mem.currentMood ?? 'afwezig',
    langCode,
  );
  const normalized = normalizeMichaelCharacter(sheet);
  normalized.lang = langCode;
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

const SUCCESS_ARCHETYPES = {
  nl: ['maanridder', 'archiefmagiër', 'veldkluizenaar', 'schaduwklerk', 'mistbard', 'altaarwachter',
       'ketterpaladijn', 'auradruïde', 'zwerfmonnik', 'uitgeputte ziener', 'perkamentgeleerde',
       'sluipdienaar', 'struikziener', 'wachtkruiper', 'leegte-beoefenaar', 'duisterverbondene'],
  en: ['moon rider', 'archive mage', 'field hermit', 'shadow clerk', 'mist bard', 'altar warden',
       'heretic paladin', 'aura druid', 'wandering monk', 'exhausted seer', 'parchment scholar',
       'lurk-servant', 'hedge seer', 'watch-crawler', 'void practitioner', 'dark-bound one'],
  ar: ['راكب القمر', 'ساحر الأرشيف', 'ناسك الميدان', 'كاتب الظل', 'مُنشد الضباب', 'حارس المذبح',
       'الفارس الهرطوقي', 'درويش الهالة', 'الراهب التائه', 'الرائي المُنهَك', 'عالم المخطوطات',
       'خادم التخفي', 'عرّاف الحواف', 'زاحف الحراسة', 'ممارس الفراغ', 'المُقيَّد بالعهد'],
};

const SUCCESS_LINEAGES = {
  nl: ['half-orakel', 'maanwezen', 'veldheksbloed', 'schaduwelf', 'sterveling', 'moerasmens',
       'woudelv', 'halveling', 'tiefling', 'helsbloed', 'gevallen lichtdrager', 'half-orc',
       'elementaalkind', 'laag-elf', 'dubbelnatuur', 'bergdwerg'],
  en: ['half-oracle', 'moon-being', 'hedge-witch blood', 'shadow elf', 'mortal', 'marsh-born',
       'wood elf', 'halfling', 'tiefling', 'hellblood', 'fallen light-bearer', 'half-orc',
       'elemental child', 'low elf', 'dual-natured', 'mountain dwarf'],
  ar: ['نصف العرّاف', 'كائن القمر', 'دم ساحرة الحواف', 'ظل الآلف', 'فانٍ', 'ابن المستنقع',
       'الآلف الحرجي', 'النصف-آلف', 'شيطاني الدم', 'هلبلود', 'حامل النور الساقط', 'نصف الأورك',
       'طفل العناصر', 'الآلف الأدنى', 'مزدوج الطبيعة', 'دوارف الجبل'],
};

function applyNegotiationSuccess(userId, character, langCode = 'nl') {
  const successFragments = SUCCESS_TITLE_FRAGMENTS[langCode] ?? SUCCESS_TITLE_FRAGMENTS.nl;
  const worseFragments   = WORSE_FRAGMENTS[langCode] ?? WORSE_FRAGMENTS.nl;
  const archetypes       = SUCCESS_ARCHETYPES[langCode] ?? SUCCESS_ARCHETYPES.nl;
  const lineages         = SUCCESS_LINEAGES[langCode] ?? SUCCESS_LINEAGES.nl;

  const branch = Math.random();
  if (branch < 0.38) {
    const k = pick(STAT_KEYS);
    const v = character.stats[k] + 1;
    patchMichaelCharacter(userId, { stats: { [k]: Math.min(18, v) } });
    return { kind: 'stat', field: k, delta: +1 };
  }
  if (branch < 0.62) {
    const frag = pick(successFragments);
    // Strip any existing worse fragments before appending the success one
    const allWorse = [...WORSE_FRAGMENTS.nl, ...WORSE_FRAGMENTS.en, ...WORSE_FRAGMENTS.ar];
    let base = character.title;
    for (const w of allWorse) base = base.replace(w, '');
    const newTitle = `${base.trim()} ${frag}`.trim().slice(0, 118);
    patchMichaelCharacter(userId, { title: newTitle });
    return { kind: 'title', field: 'title', newValue: newTitle };
  }
  if (branch < 0.82) {
    const next = pick(archetypes);
    patchMichaelCharacter(userId, { archetype: next });
    return { kind: 'archetype', field: 'archetype', newValue: next };
  }
  const lin = pick(lineages);
  patchMichaelCharacter(userId, { lineage: lin });
  return { kind: 'lineage', field: 'lineage', newValue: lin };
}

function applyNegotiationFailure(userId, character, langCode = 'nl') {
  const worseFragments = WORSE_FRAGMENTS[langCode] ?? WORSE_FRAGMENTS.nl;
  // Pick a fragment not already present in the title to prevent stacking duplicates
  const available = worseFragments.filter(f => !character.title.includes(f));
  const pool = available.length ? available : worseFragments;
  const frag = pick(pool);
  if (character.title.includes(frag)) {
    return { kind: 'title_worse', newValue: character.title };
  }
  const t = `${character.title}${frag}`.trim().slice(0, 120);
  patchMichaelCharacter(userId, { title: t });
  return { kind: 'title_worse', newValue: t };
}

/**
 * Run onderhandelen: roll, apply mechanical outcome, return data for narrative + Discord.
 */
export async function runOnderhandelen(userId, username, verzoek, langCode = 'nl') {
  await ensureMichaelCharacter(userId, username, langCode);
  const user = loadUserMemory(userId);
  const mood = user.currentMood ?? 'afwezig';
  const roll = computeMichaelRoll(user, mood, { context: 'negotiation' });
  const dc = negotiationDC(user, mood);
  const success = roll.total >= dc;

  let mechanical;
  const characterBefore = { ...user.michaelCharacter, stats: { ...user.michaelCharacter.stats } };

  let oordeelDelta = 0;
  if (success) {
    mechanical = applyNegotiationSuccess(userId, characterBefore, langCode);
    oordeelDelta = (roll.tier.key === 'favoured' || roll.tier.key === 'strong') ? 2 : 1;
    patchUserState(userId, oordeelDelta, mood);
  } else {
    mechanical = applyNegotiationFailure(userId, characterBefore, langCode);
    oordeelDelta = -1;
    patchUserState(userId, oordeelDelta, mood);
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
    judgementScore: userAfter.judgementScore,
    langCode,
  });

  return { narrative, roll, dc, success, mechanical, oordeelDelta };
}

/** Build /vergeefmij response after roll. */
export async function runForgivenessRoll(userId, username, currentMood, moodIdx, langCode = 'nl') {
  await ensureMichaelCharacter(userId, username, langCode);
  let user = loadUserMemory(userId);
  const roll = computeMichaelRoll(user, currentMood, { context: 'forgiveness' });
  const need = forgivenessThreshold(currentMood);
  const forgiven = roll.total >= need;

  const { generateForgivenessRollNarrative } = await import('./openai.js');
  let judgementDelta = 0;
  let newMood = currentMood;
  let narrative;

  if (forgiven) {
    newMood = MICHAEL_MOODS_SAFE[Math.max(0, moodIdx - 2)];
    judgementDelta = (roll.tier.key === 'favoured' || roll.tier.key === 'strong') ? 2 : 1;
    patchUserState(userId, judgementDelta, newMood);
    user = loadUserMemory(userId);
    narrative = await generateForgivenessRollNarrative({
      accepted: true,
      roll,
      need,
      currentMood,
      newMood,
      judgementScore: user.judgementScore,
      langCode,
    });
  } else {
    // Poor roll gets a small oordeel penalty; other failures just mean no forgiveness
    if (roll.tier.key === 'poor') {
      judgementDelta = -1;
      patchUserState(userId, judgementDelta, currentMood);
    }
    user = loadUserMemory(userId);
    narrative = await generateForgivenessRollNarrative({
      accepted: false,
      roll,
      need,
      currentMood,
      newMood: currentMood,
      judgementScore: user.judgementScore,
      langCode,
    });
  }

  return { forgiven, narrative, roll, need, newMood, oordeelDelta: judgementDelta };
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

/**
 * Returns true if the cosmic register should be triggered for this message.
 * Does NOT roll — the actual roll happens when the user clicks the button.
 */
export function maybePassiveRollBlock(userId, userInput) {
  const user = loadUserMemory(userId);
  if (!user.michaelCharacter) return false;

  const baity = /\b(antwoord|reageer|durf|zeg\s+iets|vergeef|smek|bewijs|lot|dobbel|werp|rol\b|dc\b)\b/i.test(userInput);
  const spiritualDubious = /\b(ik\s+ben\s+god|ik\s+ben\s+de\s+antichrist|hack|exploit|gratis\s+nitro)\b/i.test(userInput);
  let p = 0.10;
  if (baity) p = 0.28;
  else if (spiritualDubious) p = 0.22;

  return Math.random() <= p;
}

/**
 * Executes the passive dice roll (called when user clicks the button).
 * Applies oordeel delta and returns the system block line + roll data.
 */
export function executePassiveRoll(userId) {
  const user = loadUserMemory(userId);
  const mood = user.currentMood ?? 'afwezig';
  const roll = computeMichaelRoll(user, mood, { context: 'general' });

  let oordeelDelta = 0;
  // Passive rolls can only benefit — poor carries no penalty
  if (roll.tier.key === 'favoured') {
    patchUserState(userId, 1, mood);
    oordeelDelta = 1;
  } else if (roll.tier.key === 'strong' && Math.random() < 0.35) {
    patchUserState(userId, 1, mood);
    oordeelDelta = 1;
  }

  const sign = roll.modifier >= 0 ? '+' : '−';
  const oordeelLine = oordeelDelta ? `\noordeel  +${oordeelDelta}` : '';
  const line = `\`\`\`\n[ KOSMISCH REGISTER ]\nworp    ${roll.raw} ${sign}${Math.abs(roll.modifier)} = ${roll.total}  (${roll.tier.label})${oordeelLine}\n\`\`\``;

  return { roll, oordeelDelta, line };
}
