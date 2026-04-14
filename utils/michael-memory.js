import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = join(__dirname, '../data/michael-memory.json');

const MAX_RECENT          = 8;
const SUMMARISE_AT        = 8;
const MAX_UNFINISHED      = 10;                          // cap per user
const BUSINESS_EXPIRY_MS  = 7 * 24 * 60 * 60 * 1000;  // 7 days
const MENTION_COOLDOWN_MS = 2 * 60 * 60 * 1000;        // 2h before same item resurfaced
const MAX_THEMES          = 3;                           // recent themes for contradiction engine

// ─── Core I/O ─────────────────────────────────────────────────────────────────

function loadAll() {
  if (!existsSync(MEMORY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  mkdirSync(dirname(MEMORY_PATH), { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function defaultUser(username) {
  return {
    username,
    prompts:           [],
    moods:             [],
    judgementScore:    0,
    impression:        null,
    currentMood:       null,
    lastChannelId:     null,   // most recent channel this user was active in
    unfinishedBusiness: [],    // Feature 1 — items Michael hasn't let go of
    recentThemes:      [],     // Feature 2 — topic snapshots for contradiction engine
    languagePermission: null, // unlocked after repeated requests for a non-Dutch language
    languageRequestCounts: {}, // { en: 2, fr: 1 } — per-language tallies toward unlock
    michaelCharacter:  null,   // kosmische rollenspel — persistent sheet
    michaelPoints:     0,      // campaign standing (separate from judgementScore)
  };
}

function migrateMichaelRollenspel(user) {
  if (user.michaelCharacter === undefined) user.michaelCharacter = null;
  if (user.michaelPoints === undefined || typeof user.michaelPoints !== 'number') user.michaelPoints = 0;
}

// ─── Public load / save ───────────────────────────────────────────────────────

export function loadUserMemory(userId) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser('');
  // Migrate records that predate the new fields
  if (user.judgementScore === undefined)   user.judgementScore = 0;
  if (user.impression === undefined)       user.impression = null;
  if (user.currentMood === undefined)      user.currentMood = null;
  if (user.lastChannelId === undefined)    user.lastChannelId = null;
  if (user.unfinishedBusiness === undefined) user.unfinishedBusiness = [];
  if (user.recentThemes === undefined)     user.recentThemes = [];
  if (user.languagePermission === undefined) user.languagePermission = null;
  if (user.languageRequestCounts === undefined || typeof user.languageRequestCounts !== 'object') {
    user.languageRequestCounts = {};
  }
  migrateMichaelRollenspel(user);
  return user;
}

/**
 * Persist the result of a conversation turn.
 * @param {string|null} channelId  Pass the channel where the user spoke so
 *                                 delayed consequences know where to resurface.
 */
export function saveUserMemory(userId, username, prompt, mood, scoreDelta = 0, nextMood = null, channelId = null) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser(username);
  user.username   = username;
  user.prompts    = [...user.prompts, prompt].slice(-MAX_RECENT);
  user.moods      = [...user.moods, mood].slice(-MAX_RECENT);
  if (user.judgementScore === undefined) user.judgementScore = 0;
  if (user.impression     === undefined) user.impression = null;
  if (user.unfinishedBusiness === undefined) user.unfinishedBusiness = [];
  if (user.recentThemes   === undefined) user.recentThemes = [];
  if (user.languagePermission === undefined) user.languagePermission = null;
  if (user.languageRequestCounts === undefined || typeof user.languageRequestCounts !== 'object') {
    user.languageRequestCounts = {};
  }
  migrateMichaelRollenspel(user);
  user.judgementScore += scoreDelta;
  if (nextMood  !== null) user.currentMood  = nextMood;
  if (channelId !== null) user.lastChannelId = channelId;
  all[userId] = user;
  saveAll(all);
}

/** Expose the raw store so the cron can scan all users. */
export function loadAllMemory() {
  return loadAll();
}

/**
 * Only update the last-known channel for a user.
 * Used by the gateway listener so it doesn't pollute the prompt history.
 */
export function updateLastChannel(userId, channelId) {
  const all = loadAll();
  if (!all[userId]) return; // don't create stub records for unknown users
  all[userId].lastChannelId = channelId;
  saveAll(all);
}

/**
 * Update mood and/or judgement score without adding an entry to the prompt log.
 * Used by background systems (cron, delayed consequences) that shouldn't
 * appear in the user's conversation history.
 */
export function patchUserState(userId, scoreDelta = 0, nextMoodVal = null) {
  const all = loadAll();
  const user = all[userId];
  if (!user) return;
  if (user.judgementScore === undefined) user.judgementScore = 0;
  user.judgementScore += scoreDelta;
  if (nextMoodVal !== null) user.currentMood = nextMoodVal;
  all[userId] = user;
  saveAll(all);
}

// ─── Language permission (earned by repeatedly asking for another language) ───

const LANG_UNLOCK_THRESHOLD = 2;

// First matching pattern wins. User must ask this many times (across sessions) to unlock.
const LANG_SPECS = [
  { code: 'en', displayName: 'English', promptName: 'English', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(engels|english|in\s+english|spreek\s+engels|praat\s+engels|talk\s+english|speak\s+english)\b/i },
  { code: 'de', displayName: 'German', promptName: 'German', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(duits|german|deutsch|spreek\s+duits|auf\s+deutsch)\b/i },
  { code: 'fr', displayName: 'French', promptName: 'French', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(frans|french|français|francais|spreek\s+frans)\b/i },
  { code: 'es', displayName: 'Spanish', promptName: 'Spanish', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(spaans|spanish|español|espanol|spreek\s+spaans)\b/i },
  { code: 'it', displayName: 'Italian', promptName: 'Italian', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(italiaans|italian|italiano|spreek\s+italiaans)\b/i },
  { code: 'pt', displayName: 'Portuguese', promptName: 'Portuguese', signOffHint: 'End with 2 to 6 dots followed by Michael in Latin script.', re: /\b(portugees|portuguese|português|portugues)\b/i },
  { code: 'ar', displayName: 'Arabic', promptName: 'Arabic', signOffHint: 'End with 2 to 6 dots followed by ميخائيل (Michael in Arabic script).', re: /\b(arabisch|arabic|بالعربية|in\s+het\s+arabisch)\b/i },
  { code: 'ja', displayName: 'Japanese', promptName: 'Japanese', signOffHint: 'End with 2 to 6 dots followed by ミカエル or Michael in katakana.', re: /\b(japans|japanese|日本語|nihongo)\b/i },
  { code: 'ru', displayName: 'Russian', promptName: 'Russian', signOffHint: 'End with 2 to 6 dots followed by Михаил or Michael in Cyrillic.', re: /\b(russisch|russian|по-русски|rus(sisch)?)\b/i },
];

function detectRequestedLanguage(userInput) {
  for (const spec of LANG_SPECS) {
    if (spec.re.test(userInput)) return spec;
  }
  return null;
}

/** Language code if the message explicitly asks Michael to use a given language (Dutch or English phrasing). */
export function getRequestedLanguageCode(userInput) {
  return detectRequestedLanguage(userInput)?.code ?? null;
}

/**
 * True when the user's message is actually written in their unlocked language
 * (not just Dutch). Used so Michael only switches to full target-language mode
 * when they "speak it to him"; otherwise he stays on default Dutch + occasional mix.
 */
export function userSpeaksUnlockedLanguage(perm, userInput) {
  if (!perm || !userInput?.trim()) return false;
  const s = userInput.trim();

  switch (perm.code) {
    case 'en': {
      const en = /\b(the|you|your|yours|what|when|where|why|how|please|thanks|thank you|hello|hi |hey |about|don't|I'm|I am|it's|isn't|can't|could|would|should|really|feel|feeling|want|know|think|sorry|love|hate|good|bad|nice)\b/i;
      const nl = /\b(het|een|niet|maar|van|voor|met|dat|die|deze|dit|waarom|hoe|graag|jij|jou |zijn|ben |heb |hebben|kunnen|moeten|willen|mijn|jouw|ook |nog |toch|gewoon|iets|niets)\b/i;
      if (nl.test(s) && !en.test(s)) return false;
      if (en.test(s)) return true;
      if (s.length > 12 && /^[a-z0-9\s.,!?'"\-]+$/i.test(s) && !nl.test(s)) return true;
      return false;
    }
    case 'de':
      return /\b(der|die|das|und|ich|du|er|sie|nicht|was|wie|warum|bitte|hallo|danke|können|schon|auch)\b/i.test(s);
    case 'fr':
      return /\b(le|la|les|un|une|vous|nous|pour|avec|sans|merci|bonjour|salut|comment|pourquoi|être|avez|avez-vous)\b/i.test(s) || /[àâçéèêëîïôùûüœ]/i.test(s);
    case 'es':
      return /\b(qué|cómo|por\s+favor|hola|gracias|está|este|esta|usted|tengo|quiero|pero|muy|más|los|las)\b/i.test(s) || /[ñáéíóúü]/i.test(s);
    case 'it':
      return /\b(che|come|però|perché|grazie|ciao|buongiorno|questo|quello|sono|non |molto)\b/i.test(s) || /\bper\s+favore\b/i.test(s);
    case 'pt':
      return /\b(você|voces|obrigado|obrigada|como|por\s+favor|olá|não|muito|mais|vocês|está)\b/i.test(s);
    case 'ar':
      return /[\u0600-\u06FF]/.test(s);
    case 'ja':
      return /[\u3040-\u30ff\u4e00-\u9fff]/.test(s);
    case 'ru':
      return /[\u0400-\u04FF]/.test(s);
    default:
      return false;
  }
}

/**
 * If this message asks Michael to use another language, bump that language's counter.
 * After LANG_UNLOCK_THRESHOLD requests for the same language, sets languagePermission
 * so Michael may answer in that language when the user writes in it (or asks again).
 *
 * Call from /praatmetmichael before generating a reply. Creates/updates the user row.
 *
 * @returns {object|null} The effective permission after this message: { code, displayName, promptName, signOffHint } or null
 */
export function recordLanguageRequest(userId, username, userInput) {
  const detected = detectRequestedLanguage(userInput);
  const all = loadAll();
  const existing = all[userId];

  if (!detected) {
    return existing?.languagePermission ?? null;
  }

  const user = existing ?? defaultUser(username);
  if (user.languagePermission === undefined) user.languagePermission = null;
  if (user.languageRequestCounts === undefined || typeof user.languageRequestCounts !== 'object') {
    user.languageRequestCounts = {};
  }

  if (user.languagePermission?.code === detected.code) {
    return user.languagePermission;
  }

  user.languageRequestCounts[detected.code] = (user.languageRequestCounts[detected.code] ?? 0) + 1;
  const langCount = user.languageRequestCounts[detected.code];

  if (langCount >= LANG_UNLOCK_THRESHOLD) {
    user.languagePermission = {
      code:        detected.code,
      displayName: detected.displayName,
      promptName:  detected.promptName,
      signOffHint: detected.signOffHint,
    };
    console.log(`[michael] language unlocked | ${detected.code} | ${userId} (${username})`);
  } else {
    console.log(`[michael] language progress | ${detected.code} ${langCount}/${LANG_UNLOCK_THRESHOLD} | ${userId}`);
  }

  all[userId] = user;
  saveAll(all);
  return user.languagePermission;
}

// ─── Summarisation helpers ────────────────────────────────────────────────────

export function needsSummarisation(userId) {
  return loadUserMemory(userId).prompts.length >= SUMMARISE_AT;
}

export function updateImpression(userId, impression) {
  const all = loadAll();
  if (!all[userId]) return;
  all[userId].impression = impression;
  all[userId].prompts    = all[userId].prompts.slice(-2);
  saveAll(all);
}

export function getJudgementLabel(score) {
  if (score <= -5) return 'vermoeiend';
  if (score <= -2) return 'twijfelachtig';
  if (score <= 2)  return 'onbeslist';
  if (score <= 6)  return 'draaglijk';
  return 'ongewoon helder';
}

// ─── Feature 1 — Unfinished business ─────────────────────────────────────────
//
// A lightweight queue of unresolved interactions Michael hasn't let go of.
// Items are created when something bothers him (insult, bait, bad vibe, code
// request, repeated theme) and resurfaced by the delayed consequence cron.
//
// Item shape:
//   { id, prompt, reason, severity(1-3), createdAt, lastMentionedAt,
//     messageId, channelId }
//
// severity 1 = mild lingering discomfort
// severity 2 = notable — Michael will bring it up with more edge
// severity 3 = full resentment — appears first and triggers mood shift

/**
 * Queue an unfinished business item for a user.
 * Only works for users already in memory (won't create stub records).
 */
export function addUnfinishedBusiness(userId, {
  prompt,
  reason,
  severity = 1,
  messageId = null,
  channelId = null,
}) {
  const all = loadAll();
  if (!all[userId]) return; // skip unknown users
  const user = all[userId];
  if (!user.unfinishedBusiness) user.unfinishedBusiness = [];
  if (user.unfinishedBusiness.length >= MAX_UNFINISHED) return; // don't pile on

  user.unfinishedBusiness.push({
    id:              randomUUID(),
    prompt:          String(prompt).slice(0, 120),
    reason,
    severity,
    createdAt:       Date.now(),
    lastMentionedAt: null,
    messageId,
    channelId,
  });

  all[userId] = user;
  saveAll(all);
  console.log(`[michael] unfinished-business | user=${userId} | sev=${severity} | ${String(reason).slice(0, 60)}`);
}

/**
 * Returns items that are within expiry and past the per-item cooldown,
 * sorted by severity descending (most pressing first).
 */
export function getOutstandingBusiness(userId) {
  const user = loadUserMemory(userId);
  if (!user.unfinishedBusiness?.length) return [];
  const now = Date.now();
  return user.unfinishedBusiness
    .filter(b => now - b.createdAt < BUSINESS_EXPIRY_MS)
    .filter(b => !b.lastMentionedAt || now - b.lastMentionedAt > MENTION_COOLDOWN_MS)
    .sort((a, b) => b.severity - a.severity);
}

/** Record that an item was resurfaced — starts the per-item cooldown. */
export function markBusinessMentioned(userId, id) {
  const all = loadAll();
  const user = all[userId];
  if (!user?.unfinishedBusiness) return;
  const item = user.unfinishedBusiness.find(b => b.id === id);
  if (item) item.lastMentionedAt = Date.now();
  all[userId] = user;
  saveAll(all);
}

/** Fully resolve and remove an item. */
export function markBusinessResolved(userId, id) {
  const all = loadAll();
  const user = all[userId];
  if (!user?.unfinishedBusiness) return;
  user.unfinishedBusiness = user.unfinishedBusiness.filter(b => b.id !== id);
  all[userId] = user;
  saveAll(all);
}

/** Remove items that have expired (>7 days old). Call periodically. */
export function maybeAgeBusiness(userId) {
  const all = loadAll();
  const user = all[userId];
  if (!user?.unfinishedBusiness) return;
  const now = Date.now();
  const before = user.unfinishedBusiness.length;
  user.unfinishedBusiness = user.unfinishedBusiness.filter(b => now - b.createdAt < BUSINESS_EXPIRY_MS);
  if (user.unfinishedBusiness.length !== before) {
    all[userId] = user;
    saveAll(all);
  }
}

// ─── Feature 2 — Theme tracking (contradiction engine) ───────────────────────
//
// Stores the last MAX_THEMES prompts as keyword snapshots.
// When a new prompt shares ≥2 keywords with a recent theme, Michael may
// contradict or softly reframe what he said before.

const STOP_WORDS = new Set([
  'de','het','een','van','en','in','is','te','ik','je','dat','voor','op',
  'met','zijn','er','maar','wat','dit','kan','hij','ze','ook','jij','mij',
  'jou','hoe','als','niet','zo','om','aan','bij','zich','was','had','die',
  'naar','dan','uit','over','meer','wel','nog','geen','een','nou','eens',
]);

function extractKeywords(prompt) {
  return prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 8);
}

/** Store the current prompt's keywords as a new theme snapshot. */
export function addTheme(userId, prompt) {
  const all = loadAll();
  const user = all[userId];
  if (!user) return;
  if (!user.recentThemes) user.recentThemes = [];
  user.recentThemes = [
    { keywords: extractKeywords(prompt), ts: Date.now() },
    ...user.recentThemes,
  ].slice(0, MAX_THEMES);
  all[userId] = user;
  saveAll(all);
}

/**
 * Returns true if the prompt shares ≥2 keywords with any recent theme,
 * suggesting the user is returning to the same topic.
 */
export function detectThemeOverlap(userId, prompt) {
  const user = loadUserMemory(userId);
  if (!user.recentThemes?.length) return false;
  const newKws = new Set(extractKeywords(prompt));
  if (newKws.size < 2) return false;
  for (const theme of user.recentThemes) {
    const shared = theme.keywords.filter(k => newKws.has(k)).length;
    if (shared >= 2) return true;
  }
  return false;
}

// ─── Michaëls kosmische rollenspel — stats, rolls, Michael Points ─────────────

const STAT_KEYS = ['aura', 'discipline', 'chaos', 'inzicht', 'volharding'];

/** Tier from total (d20 + modifiers). */
export function michaelRollTier(total) {
  if (total <= 5)  return { key: 'poor', label: 'zwaar teleurstellend' };
  if (total <= 11) return { key: 'weak', label: 'matig' };
  if (total <= 16) return { key: 'acceptable', label: 'aanvaardbaar' };
  if (total <= 22) return { key: 'strong', label: 'gunstig' };
  return { key: 'favoured', label: 'ongewoon begunstigd' };
}

function clampStat(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 10;
  return Math.max(3, Math.min(18, Math.round(x)));
}

/** Normalize a character object from AI or templates before saving. */
export function normalizeMichaelCharacter(raw) {
  const now = Date.now();
  const statsIn = raw?.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const stats = {};
  for (const k of STAT_KEYS) {
    stats[k] = clampStat(statsIn[k] ?? 10);
  }
  return {
    archetype: String(raw?.archetype ?? 'onbenoemde zwerver').slice(0, 80),
    lineage: String(raw?.lineage ?? 'sterveling').slice(0, 80),
    title: String(raw?.title ?? 'zonder erkenbare titel').slice(0, 120),
    stats,
    assignedAt: typeof raw?.assignedAt === 'number' ? raw.assignedAt : now,
    lastUpdatedAt: now,
  };
}

/**
 * d20 + modifiers from stats, judgement, mood, Michael Points, context.
 * @param {object} user — full user memory row
 * @param {string} mood — current mood key
 * @param {object} [opts]
 * @param {string} [opts.context] — 'forgiveness' | 'negotiation' | 'general'
 * @param {number} [opts.extraModifier] — manual adjustment
 */
export function computeMichaelRoll(user, mood, opts = {}) {
  const raw = Math.floor(Math.random() * 20) + 1;
  const char = user.michaelCharacter;
  const st = char?.stats ?? { aura: 10, discipline: 10, chaos: 10, inzicht: 10, volharding: 10 };

  let modifier = 0;
  modifier += Math.floor((st.inzicht + st.volharding) / 6);
  modifier += Math.floor(st.aura / 7);
  modifier -= Math.floor(st.chaos / 8);
  modifier += Math.floor((user.michaelPoints ?? 0) / 8);

  const js = user.judgementScore ?? 0;
  if (js <= -5) modifier -= 2;
  else if (js <= -2) modifier -= 1;
  else if (js >= 7) modifier += 2;
  else if (js >= 4) modifier += 1;

  const moodMod = {
    woedend: -3,
    streng: -2,
    'passief-agressief': -1,
    verward: 0,
    loom: 0,
    afwezig: 0,
    kosmisch: 1,
  };
  modifier += moodMod[mood] ?? 0;

  if (opts.context === 'forgiveness') {
    modifier += Math.floor(st.discipline / 10);
  }
  if (opts.context === 'negotiation') {
    modifier += Math.floor(st.inzicht / 9);
    modifier -= 1;
  }

  modifier += opts.extraModifier ?? 0;
  modifier += Math.floor(Math.random() * 5) - 2;

  const total = raw + modifier;
  const tier = michaelRollTier(total);
  return { raw, modifier, total, tier };
}

export function updateMichaelPoints(userId, delta) {
  const all = loadAll();
  const user = all[userId];
  if (!user) return 0;
  migrateMichaelRollenspel(user);
  user.michaelPoints = Math.max(-50, Math.min(99, (user.michaelPoints ?? 0) + delta));
  all[userId] = user;
  saveAll(all);
  return user.michaelPoints;
}

/** Persist full character sheet (already normalized). */
export function saveMichaelCharacter(userId, username, character) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser(username);
  migrateMichaelRollenspel(user);
  user.username = username;
  user.michaelCharacter = character;
  user.michaelCharacter.lastUpdatedAt = Date.now();
  all[userId] = user;
  saveAll(all);
}

/** Shallow-merge fields into michaelCharacter. */
export function patchMichaelCharacter(userId, partial) {
  const all = loadAll();
  const user = all[userId];
  if (!user?.michaelCharacter) return null;
  migrateMichaelRollenspel(user);
  const prev = user.michaelCharacter;
  const next = { ...prev, ...partial };
  next.stats = { ...prev.stats, ...(partial.stats ?? {}) };
  for (const k of STAT_KEYS) {
    next.stats[k] = clampStat(next.stats[k]);
  }
  next.lastUpdatedAt = Date.now();
  user.michaelCharacter = next;
  all[userId] = user;
  saveAll(all);
  return next;
}

/** One-line summary for LLM prompts (no JSON). */
export function formatCharacterForPrompt(character, michaelPoints) {
  if (!character) return '';
  const { archetype, lineage, title, stats } = character;
  return `Kosmische inschrijving (bindend volgens Michaël): archetype "${archetype}", ras/afstamming "${lineage}", titel/epitheton "${title}", stats aura ${stats.aura} · discipline ${stats.discipline} · chaos ${stats.chaos} · inzicht ${stats.inzicht} · volharding ${stats.volharding}, Michaël-punten ${michaelPoints ?? 0}.`;
}

/** ~12% suggestion: Michael may nod at the role in a reply. */
export function shouldReferenceCharacterThisTurn() {
  return Math.random() < 0.12;
}
