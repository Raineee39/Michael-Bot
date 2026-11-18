import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SWITCH_PATH = join(__dirname, '../data/life-switch.json');

// Read on every chat message (twice), so keep it in memory. Only this process
// writes the file, so the cache is replaced on every save.
let cache = null;

function loadAll() {
  if (cache) return structuredClone(cache);
  cache = { guilds: {}, channels: {} };
  if (existsSync(SWITCH_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(SWITCH_PATH, 'utf8'));
      cache = {
        guilds: raw.guilds && typeof raw.guilds === 'object' ? raw.guilds : {},
        channels: raw.channels && typeof raw.channels === 'object' ? raw.channels : {},
      };
    } catch { /* unreadable file: treat as all off */ }
  }
  return structuredClone(cache);
}

function saveAll(data) {
  mkdirSync(dirname(SWITCH_PATH), { recursive: true });
  writeFileSync(SWITCH_PATH, JSON.stringify(data, null, 2), 'utf8');
  cache = structuredClone(data);
}

function channelHasOverride(channels, channelId) {
  return channelId != null && Object.prototype.hasOwnProperty.call(channels, channelId);
}

/**
 * Is Michael's proactive life on here? Default: off. Gates everything he does
 * in chat without being asked: name/ping replies, snark, afterthoughts,
 * absence inquiries, divine pardons, and reacting to insults or bait.
 */
export function isMichaelLifeActive(guildId, channelId) {
  if (!guildId) return false;
  const { guilds, channels } = loadAll();
  if (channelHasOverride(channels, channelId)) return Boolean(channels[channelId]);
  if (Object.prototype.hasOwnProperty.call(guilds, guildId)) return Boolean(guilds[guildId]);
  return false;
}

export function getLifeSwitchStatus(guildId, channelId) {
  const { guilds, channels } = loadAll();
  const guildExplicit = Object.prototype.hasOwnProperty.call(guilds, guildId);
  const guildOn = guildExplicit ? Boolean(guilds[guildId]) : false;
  const channelExplicit = channelHasOverride(channels, channelId);
  const channelOn = channelExplicit ? Boolean(channels[channelId]) : guildOn;
  return {
    guildOn,
    channelOn,
    channelExplicit,
    effective: channelOn,
  };
}

export function toggleGuildLife(guildId) {
  const all = loadAll();
  const next = !Boolean(all.guilds[guildId]);
  all.guilds[guildId] = next;
  saveAll(all);
  console.log(`[michael] life-switch | guild=${guildId} | ${next ? 'ON' : 'OFF'}`);
  return next;
}

export function toggleChannelLife(guildId, channelId) {
  const all = loadAll();
  const current = isMichaelLifeActive(guildId, channelId);
  const next = !current;
  // A channel set back to what the server says goes back to following the
  // server. Otherwise the override sticks forever: flick a channel off and on
  // again, and a later "server OFF" silently skips that channel.
  if (next === Boolean(all.guilds[guildId])) delete all.channels[channelId];
  else all.channels[channelId] = next;
  saveAll(all);
  console.log(`[michael] life-switch | guild=${guildId} ch=${channelId} | ${next ? 'ON' : 'OFF'}`);
  return next;
}
