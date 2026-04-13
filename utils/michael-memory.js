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
  };
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
