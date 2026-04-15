import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COSMIC_PATH = join(__dirname, '../data/cosmic-state.json');

function readAll() {
  if (!existsSync(COSMIC_PATH)) return { guilds: {} };
  try {
    const raw = JSON.parse(readFileSync(COSMIC_PATH, 'utf8'));
    if (!raw.guilds || typeof raw.guilds !== 'object') return { guilds: {} };
    return raw;
  } catch {
    return { guilds: {} };
  }
}

function writeAll(data) {
  mkdirSync(dirname(COSMIC_PATH), { recursive: true });
  writeFileSync(COSMIC_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Per-guild cosmic roles (survives process restart).
 * Antichrist expires after antichristExpiresAt (ms since epoch).
 */
export function getGuildCosmic(guildId) {
  if (!guildId) {
    return { antichristUserId: null, antichristExpiresAt: null, uitverkoreneUserId: null };
  }
  const all = readAll();
  const g = all.guilds[guildId] ?? {};
  let antichristUserId = g.antichristUserId ?? null;
  let antichristExpiresAt = g.antichristExpiresAt ?? null;
  const uitverkoreneUserId = g.uitverkoreneUserId ?? null;

  if (antichristUserId && antichristExpiresAt != null && Date.now() > antichristExpiresAt) {
    antichristUserId = null;
    antichristExpiresAt = null;
    all.guilds[guildId] = { ...g, antichristUserId: null, antichristExpiresAt: null };
    writeAll(all);
  }

  return { antichristUserId, antichristExpiresAt, uitverkoreneUserId };
}

export function getCurrentAntichristUserId(guildId) {
  return getGuildCosmic(guildId).antichristUserId;
}

export function getUitverkoreneUserId(guildId) {
  return getGuildCosmic(guildId).uitverkoreneUserId;
}

export function setAntichristForGuild(guildId, userId, expiresAtMs) {
  if (!guildId) return;
  const all = readAll();
  if (!all.guilds) all.guilds = {};
  all.guilds[guildId] = {
    ...(all.guilds[guildId] ?? {}),
    antichristUserId: userId,
    antichristExpiresAt: expiresAtMs,
  };
  writeAll(all);
}

export function setUitverkoreneForGuild(guildId, userId) {
  if (!guildId) return;
  const all = readAll();
  if (!all.guilds) all.guilds = {};
  all.guilds[guildId] = {
    ...(all.guilds[guildId] ?? {}),
    uitverkoreneUserId: userId,
  };
  writeAll(all);
}
