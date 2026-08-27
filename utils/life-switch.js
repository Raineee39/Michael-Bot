import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SWITCH_PATH = join(__dirname, '../data/life-switch.json');

function loadAll() {
  if (!existsSync(SWITCH_PATH)) return { guilds: {}, channels: {} };
  try {
    const raw = JSON.parse(readFileSync(SWITCH_PATH, 'utf8'));
    return {
      guilds: raw.guilds && typeof raw.guilds === 'object' ? raw.guilds : {},
      channels: raw.channels && typeof raw.channels === 'object' ? raw.channels : {},
    };
  } catch {
    return { guilds: {}, channels: {} };
  }
}

function saveAll(data) {
  mkdirSync(dirname(SWITCH_PATH), { recursive: true });
  writeFileSync(SWITCH_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function channelHasOverride(channels, channelId) {
  return channelId != null && Object.prototype.hasOwnProperty.call(channels, channelId);
}

/** Is Michael's proactive life (name replies, snark) on here? Default: off. */
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
  all.channels[channelId] = next;
  saveAll(all);
  console.log(`[michael] life-switch | guild=${guildId} ch=${channelId} | ${next ? 'ON' : 'OFF'}`);
  return next;
}
