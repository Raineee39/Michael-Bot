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

/** When the user names a standard lineage, negotiation success must grant it (not a poetic substitute). */
const LINEAGE_TRILINGUAL = {
  'half-elf': { nl: 'halfelf', en: 'half-elf', ar: 'نصف إلف' },
  'half-orc': { nl: 'half-ork', en: 'half-orc', ar: 'نصف أورك' },
  tiefling: { nl: 'tiefling', en: 'tiefling', ar: 'تيفلينج' },
  dragonborn: { nl: 'draakgeborene', en: 'dragonborn', ar: 'ولد التنين' },
  halfling: { nl: 'halfling', en: 'halfling', ar: 'هالفلينج' },
  aasimar: { nl: 'aasimar', en: 'aasimar', ar: 'آسيمار' },
  gnome: { nl: 'gnoom', en: 'gnome', ar: 'غوم' },
  dwarf: { nl: 'dwerg', en: 'dwarf', ar: 'قزم' },
  orc: { nl: 'ork', en: 'orc', ar: 'أورك' },
  elf: { nl: 'elf', en: 'elf', ar: 'إلف' },
  human: { nl: 'mens', en: 'human', ar: 'إنسان' },
  genasi: { nl: 'genasi', en: 'genasi', ar: 'جيناسي' },
  tabaxi: { nl: 'tabaxi', en: 'tabaxi', ar: 'تاباكسي' },
  firbolg: { nl: 'firbolg', en: 'firbolg', ar: 'فيربولغ' },
  goliath: { nl: 'goliath', en: 'goliath', ar: 'جولياث' },
  triton: { nl: 'triton', en: 'triton', ar: 'تريتون' },
  warforged: { nl: 'warforged', en: 'warforged', ar: 'مُصْنَع حَيّ' },
  lizardfolk: { nl: 'hagedismensen', en: 'lizardfolk', ar: 'سحاليّون' },
  kenku: { nl: 'kenku', en: 'kenku', ar: 'كنكو' },
};

/** @returns {keyof typeof LINEAGE_TRILINGUAL | null} */
function extractCanonicalLineageKey(verzoek) {
  if (!verzoek || typeof verzoek !== 'string') return null;
  const v = verzoek.toLowerCase();
  const tryPatterns = [
    [/half[\s-]?elf\b/, 'half-elf'],
    [/half[\s-]?orc\b/, 'half-orc'],
    [/\btiefling\b/, 'tiefling'],
    [/\bdragonborn\b|\bdraakgeboren(e)?\b/, 'dragonborn'],
    [/\bhalfling\b/, 'halfling'],
    [/\baasimar\b/, 'aasimar'],
    [/\bgnome\b|\bgnoom\b/, 'gnome'],
    [/\bdwarf\b|\bdwerg(en)?\b/, 'dwarf'],
    [/\borc\b|\bork\b/, 'orc'],
    [/\belf\b|\belven\b|\belvish\b/, 'elf'],
    [/\bhuman\b|\bmortal\b|\bsterveling\b|\bmens(en)?\b/, 'human'],
    [/\bgenasi\b|\belementaalkind\b/, 'genasi'],
    [/\btabaxi\b/, 'tabaxi'],
    [/\bfirbolg\b/, 'firbolg'],
    [/\bgoliath\b/, 'goliath'],
    [/\btriton\b/, 'triton'],
    [/\bwarforged\b/, 'warforged'],
    [/\blizardfolk\b|\blizard[\s-]?folk\b|\bhagedismensen\b/, 'lizardfolk'],
    [/\bkenku\b/, 'kenku'],
  ];
  for (const [re, key] of tryPatterns) {
    if (re.test(v) && LINEAGE_TRILINGUAL[key]) return key;
  }
  return null;
}

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

/** Create and persist a character sheet if missing. Character persists across all servers and languages. */
export async function ensureMichaelCharacter(userId, username, langCode = 'nl') {
  const mem = loadUserMemory(userId);
  if (mem.michaelCharacter) {
    const titleField = mem.michaelCharacter.title;
    // Heal old-format string titles that accumulated mixed-language fragments.
    // New-format {nl,en,ar} objects have per-language titles and don't need healing.
    if (typeof titleField === 'string') {
      const allFragments = [...WORSE_FRAGMENTS.nl, ...WORSE_FRAGMENTS.en, ...WORSE_FRAGMENTS.ar];
      const seen = new Set();
      let anyDupe = false;
      for (const f of allFragments) {
        const count = (titleField.split(f).length - 1);
        if (count > 1) { anyDupe = true; break; }
        if (count === 1) {
          if (seen.has(f)) { anyDupe = true; break; }
          seen.add(f);
        }
      }
      if (anyDupe) {
        let base = titleField;
        for (const f of allFragments) base = base.split(f).join('');
        const cleaned = base.trim().slice(0, 100);
        // Store as object to upgrade old string format at the same time
        patchMichaelCharacter(userId, { title: { nl: cleaned } });
        return { ...mem.michaelCharacter, title: { nl: cleaned } };
      }
    }
    return mem.michaelCharacter;
  }

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

/**
 * Detect what category of change the user is requesting.
 * Returns 'lineage' | 'archetype' | 'stat' | 'title' | null.
 */
function detectRequestKind(verzoek) {
  const v = verzoek.toLowerCase();
  if (/\b(elf|elv|orc|tiefling|halfling|dwerg|dwarf|half-orc|moerasmens|maanwezen|sterveling|helsbloed|elementaalkind|gevallen|oracle|mortal|marsh|moon.?being|hedge.?witch|elemental|hellblood|light.?bearer|species|ras|afstamming|lineage|bloed|blood|geboren|born)\b/.test(v)) return 'lineage';
  if (/\b(ridder|knight|magi|magiër|tovenaar|bard|druïde|druid|paladin|monnik|monk|kluizenaar|hermit|ziener|seer|clerk|archivaris|wachter|warden|dienaar|servant|beoefenaar|practitioner|schaduw|shadow|mist|altaar|altar|archetype|klasse|class|rol\b|role)\b/.test(v)) return 'archetype';
  if (/\b(aura|discipline|chaos|inzicht|insight|volharding|persever|stat|statistiek)\b/.test(v)) return 'stat';
  if (/\b(titel|title|epitheton|naam|name|inschrijving|entry|epithet)\b/.test(v)) return 'title';
  return null;
}

/** Get the {nl, en, ar} title object from a character (handles old string format). */
function getTitleObj(character) {
  const t = character.title;
  if (!t) return { nl: '', en: '', ar: '' };
  if (typeof t === 'string') return { nl: t, en: t, ar: t };
  return { nl: t.nl ?? '', en: t.en ?? t.nl ?? '', ar: t.ar ?? t.nl ?? '' };
}

/** Strip all known worse fragments from a title string. */
function stripWorseFragments(base) {
  let s = base;
  for (const lang of ['nl', 'en', 'ar']) {
    for (const f of WORSE_FRAGMENTS[lang]) s = s.split(f).join('');
  }
  return s.trim();
}

/** Michael generates a new value for a character field in all 3 languages via LLM. */
async function applyNegotiationSuccess(userId, character, langCode = 'nl', verzoek = '', forcedKind = null) {
  const { generateCharacterFieldChange } = await import('./openai.js');

  // Wizard flow: user already picked archetype | lineage | title — no random branch
  if (forcedKind === 'lineage') {
    const lineageKey = extractCanonicalLineageKey(verzoek);
    if (lineageKey) {
      const newLineage = { ...LINEAGE_TRILINGUAL[lineageKey] };
      patchMichaelCharacter(userId, { lineage: newLineage });
      return { kind: 'lineage', field: 'lineage', newValue: newLineage };
    }
    const newLineage = await generateCharacterFieldChange('lineage', { verzoek, characterBefore: character, langCode });
    patchMichaelCharacter(userId, { lineage: newLineage });
    return { kind: 'lineage', field: 'lineage', newValue: newLineage };
  }
  if (forcedKind === 'archetype') {
    const newArchetype = await generateCharacterFieldChange('archetype', { verzoek, characterBefore: character, langCode });
    patchMichaelCharacter(userId, { archetype: newArchetype });
    return { kind: 'archetype', field: 'archetype', newValue: newArchetype };
  }
  if (forcedKind === 'title') {
    const raw = getTitleObj(character);
    const cleaned = {
      title: {
        nl: stripWorseFragments(raw.nl),
        en: stripWorseFragments(raw.en),
        ar: stripWorseFragments(raw.ar),
      },
      stats: character.stats,
    };
    const newTitle = await generateCharacterFieldChange('title', { verzoek, characterBefore: cleaned, langCode });
    patchMichaelCharacter(userId, { title: newTitle });
    return { kind: 'title', field: 'title', newValue: newTitle };
  }

  // Free-form verzoek: bias toward detected category
  const requestedKind = detectRequestKind(verzoek);
  let branch = Math.random();
  if      (requestedKind === 'lineage')   branch = 0.82 + Math.random() * 0.18;
  else if (requestedKind === 'archetype') branch = 0.62 + Math.random() * 0.20;
  else if (requestedKind === 'title')     branch = 0.38 + Math.random() * 0.24;
  else if (requestedKind === 'stat')      branch = Math.random() * 0.38;

  if (branch < 0.38) {
    // Stat branch — prefer a stat the user mentioned, no LLM needed
    const mentionedStat = STAT_KEYS.find(k => verzoek.toLowerCase().includes(k));
    const k = mentionedStat ?? pick(STAT_KEYS);
    const v = character.stats[k] + 1;
    patchMichaelCharacter(userId, { stats: { [k]: Math.min(18, v) } });
    return { kind: 'stat', field: k, delta: +1 };
  }

  if (branch < 0.62) {
    // Title branch — LLM generates a new title in all 3 languages
    // Strip existing worse fragments from each lang's title before passing to LLM
    const raw = getTitleObj(character);
    const cleaned = {
      title: {
        nl: stripWorseFragments(raw.nl),
        en: stripWorseFragments(raw.en),
        ar: stripWorseFragments(raw.ar),
      },
      stats: character.stats,
    };
    const newTitle = await generateCharacterFieldChange('title', { verzoek, characterBefore: cleaned, langCode });
    patchMichaelCharacter(userId, { title: newTitle });
    return { kind: 'title', field: 'title', newValue: newTitle };
  }

  if (branch < 0.82) {
    // Archetype branch — LLM generates new archetype in all 3 languages
    const newArchetype = await generateCharacterFieldChange('archetype', { verzoek, characterBefore: character, langCode });
    patchMichaelCharacter(userId, { archetype: newArchetype });
    return { kind: 'archetype', field: 'archetype', newValue: newArchetype };
  }

  // Lineage branch — named standard races must match the request (LLM was substituting e.g. "shadow-touched mortal" for tiefling)
  const lineageKey = extractCanonicalLineageKey(verzoek);
  if (lineageKey) {
    const newLineage = { ...LINEAGE_TRILINGUAL[lineageKey] };
    patchMichaelCharacter(userId, { lineage: newLineage });
    return { kind: 'lineage', field: 'lineage', newValue: newLineage };
  }

  const newLineage = await generateCharacterFieldChange('lineage', { verzoek, characterBefore: character, langCode });
  patchMichaelCharacter(userId, { lineage: newLineage });
  return { kind: 'lineage', field: 'lineage', newValue: newLineage };
}

function applyNegotiationFailure(userId, character, langCode = 'nl') {
  const titleObj = getTitleObj(character);
  const newTitle = {};
  for (const lang of ['nl', 'en', 'ar']) {
    const worseFragments = WORSE_FRAGMENTS[lang];
    const base = titleObj[lang];
    // Pick a worse fragment not already in this language's title
    const available = worseFragments.filter(f => !base.includes(f));
    const frag = pick(available.length ? available : worseFragments);
    newTitle[lang] = `${base}${frag}`.trim().slice(0, 120);
  }
  patchMichaelCharacter(userId, { title: newTitle });
  return { kind: 'title_worse', newValue: newTitle };
}

/**
 * Run onderhandelen: roll, apply mechanical outcome, return data for narrative + Discord.
 */
export async function runOnderhandelen(userId, username, verzoek, langCode = 'nl', negotiationKind = null) {
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
    mechanical = await applyNegotiationSuccess(userId, characterBefore, langCode, verzoek, negotiationKind);
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
    negotiationKind,
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

  return { roll, oordeelDelta };
}
