import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '../data/guild-settings.json');

function loadAll() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveAll(data) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const VALID_LANG_CODES = new Set(['nl', 'en', 'ar']);

/** Returns the language code ('nl' | 'en' | 'ar') for a guild. Defaults to 'nl'. */
export function getGuildLanguage(guildId) {
  if (!guildId) return 'nl';
  const all = loadAll();
  const lang = all[guildId]?.language;
  return VALID_LANG_CODES.has(lang) ? lang : 'nl';
}

/** Persists a language code for a guild. */
export function setGuildLanguage(guildId, langCode) {
  if (!VALID_LANG_CODES.has(langCode)) return;
  const all = loadAll();
  all[guildId] = { ...(all[guildId] ?? {}), language: langCode };
  saveAll(all);
  console.log(`[michael] guild language set | guild=${guildId} | lang=${langCode}`);
}
