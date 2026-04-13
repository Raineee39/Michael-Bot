import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = join(__dirname, '../data/michael-memory.json');

const MAX_RECENT = 8;       // messages kept verbatim
const SUMMARISE_AT = 8;     // trigger summarisation once this many have accumulated

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
  return { username, prompts: [], moods: [], judgementScore: 0, impression: null, currentMood: null };
}

export function loadUserMemory(userId) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser('');
  if (user.judgementScore === undefined) user.judgementScore = 0;
  if (user.impression === undefined) user.impression = null;
  if (user.currentMood === undefined) user.currentMood = null;
  return user;
}

// nextMood: the mood Michael will carry into the NEXT conversation with this user
export function saveUserMemory(userId, username, prompt, mood, scoreDelta = 0, nextMood = null) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser(username);
  user.username = username;
  user.prompts = [...user.prompts, prompt].slice(-MAX_RECENT);
  user.moods = [...user.moods, mood].slice(-MAX_RECENT);
  if (user.judgementScore === undefined) user.judgementScore = 0;
  if (user.impression === undefined) user.impression = null;
  user.judgementScore += scoreDelta;
  if (nextMood !== null) user.currentMood = nextMood;
  all[userId] = user;
  saveAll(all);
}

// Returns true when enough messages have built up to warrant a summarisation pass
export function needsSummarisation(userId) {
  return loadUserMemory(userId).prompts.length >= SUMMARISE_AT;
}

// Stores the generated impression and trims verbatim prompts down to the 2 most recent,
// so the file stays small while the long-term feeling persists forever.
export function updateImpression(userId, impression) {
  const all = loadAll();
  if (!all[userId]) return;
  all[userId].impression = impression;
  all[userId].prompts = all[userId].prompts.slice(-2);
  saveAll(all);
}

export function getJudgementLabel(score) {
  if (score <= -5) return 'vermoeiend';
  if (score <= -2) return 'twijfelachtig';
  if (score <= 2)  return 'onbeslist';
  if (score <= 6)  return 'draaglijk';
  return 'ongewoon helder';
}
