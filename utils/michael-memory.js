import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = join(__dirname, '../data/michael-memory.json');
const MAX_HISTORY = 4;

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
  return { username, prompts: [], moods: [], judgementScore: 0 };
}

export function loadUserMemory(userId) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser('');
  // Migrate records written before judgementScore existed
  if (user.judgementScore === undefined) user.judgementScore = 0;
  return user;
}

// scoreDelta adjusts judgementScore in the same write (avoids a second file read/write).
export function saveUserMemory(userId, username, prompt, mood, scoreDelta = 0) {
  const all = loadAll();
  const user = all[userId] ?? defaultUser(username);
  user.username = username;
  user.prompts = [...user.prompts, prompt].slice(-MAX_HISTORY);
  user.moods = [...user.moods, mood].slice(-MAX_HISTORY);
  if (user.judgementScore === undefined) user.judgementScore = 0;
  user.judgementScore += scoreDelta;
  all[userId] = user;
  saveAll(all);
}

// Derive a human-readable label from the running score.
export function getJudgementLabel(score) {
  if (score <= -5) return 'vermoeiend';
  if (score <= -2) return 'twijfelachtig';
  if (score <= 2)  return 'onbeslist';
  if (score <= 6)  return 'draaglijk';
  return 'ongewoon helder';
}
