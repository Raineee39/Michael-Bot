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

export function loadUserMemory(userId) {
  const all = loadAll();
  return all[userId] ?? { prompts: [], moods: [] };
}

export function saveUserMemory(userId, username, prompt, mood) {
  const all = loadAll();
  const user = all[userId] ?? { username, prompts: [], moods: [] };
  user.username = username;
  user.prompts = [...user.prompts, prompt].slice(-MAX_HISTORY);
  user.moods = [...user.moods, mood].slice(-MAX_HISTORY);
  all[userId] = user;
  saveAll(all);
}
