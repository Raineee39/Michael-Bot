import 'dotenv/config';

/** Discord message flag: suppress push/badge for this message (@silent). */
export const MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS = 1 << 12; // 4096

/**
 * True between 22:00 and 09:59 (Europe/Amsterdam). Use to block proactive /
 * unprompted Michael sends at night (user-initiated slash commands stay allowed).
 */
export function isDutchQuietHoursForUnpromptedSends() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hourRaw = parts.find((p) => p.type === 'hour')?.value;
  const hour = hourRaw !== undefined ? parseInt(hourRaw, 10) : 12;
  return hour >= 22 || hour < 10;
}

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
    },
    ...options
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  const endpoint = `applications/${appId}/commands`;
  try {
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
    console.log('Global commands registered:', commands.map(c => c.name).join(', '));
  } catch (err) {
    console.error('Failed to register global commands:', err);
  }
}

export async function InstallGuildCommands(appId, guildId, commands) {
  const endpoint = `applications/${appId}/guilds/${guildId}/commands`;
  try {
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
    console.log(`Guild commands registered in ${guildId}:`, commands.map(c => c.name).join(', '));
  } catch (err) {
    console.error('Failed to register guild commands:', err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Discord message `content` max length (UTF-16 code units). */
export const DISCORD_MESSAGE_CONTENT_MAX = 2000;

/**
 * Append a revision block to a message without exceeding Discord's limit.
 * Trims the edit line first so the original stays intact when possible.
 */
export function appendEditWithinDiscordLimit(
  originalContent,
  editLine,
  maxLen = DISCORD_MESSAGE_CONTENT_MAX
) {
  const sep = '\n\n';
  const oRaw = String(originalContent ?? '');
  let o = oRaw;
  let e = String(editLine ?? '').trim();

  const total = () => o.length + sep.length + e.length;
  if (total() <= maxLen) return o + sep + e;

  let editMax = maxLen - o.length - sep.length;
  if (editMax >= 8) {
    e = e.length > editMax ? `${e.slice(0, editMax - 1).trimEnd()}…` : e;
    if (total() <= maxLen) return o + sep + e;
  } else if (editMax > 0) {
    e = `${e.slice(0, Math.max(1, editMax - 1)).trimEnd()}…`;
    if (total() <= maxLen) return o + sep + e;
  } else {
    e = '';
  }

  const origMax = maxLen - sep.length - e.length;
  if (origMax < 1) return `${oRaw.slice(0, Math.max(0, maxLen - 1))}…`;

  o = o.length > origMax ? `${o.slice(0, origMax - 1).trimEnd()}…` : o;
  if (total() <= maxLen) return o + sep + e;
  return `${(o + sep + e).slice(0, maxLen - 1)}…`;
}
