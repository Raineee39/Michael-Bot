import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = join(__dirname, '../data/day-ledger.json');

export const MAX_PUBLIC_STAMPS = 4;
export const MIN_STAMP_GAP_MS = 25 * 60 * 1000;

function readAll() {
  if (!existsSync(LEDGER_PATH)) return { guilds: {} };
  try {
    const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    if (!raw.guilds || typeof raw.guilds !== 'object') return { guilds: {} };
    return raw;
  } catch {
    return { guilds: {} };
  }
}

function writeAll(data) {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function amsterdamDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function emptyLedger() {
  return {
    events: [],
    once: {},
    publicStamps: 0,
    lastStampAt: 0,
    lastStampKind: null,
  };
}

function emptyDay(dateKey) {
  return {
    dateKey,
    card: null,
    offices: { chosenUserId: null, antichristUserId: null },
    ledger: emptyLedger(),
    postedAt: null,
    postedChannelId: null,
    yesterday: null,
    featuredHistory: [],
  };
}

function featuredIdsFromDay(day) {
  if (!day) return [];
  return [
    day.offices?.chosenUserId,
    day.offices?.antichristUserId,
    ...(day.card?.prophecies ?? []).map((p) => p.userId),
    day.card?.leastFavouriteUserId,
  ].filter(Boolean);
}

function appendFeaturedHistory(prev) {
  const entry = {
    dateKey: prev.dateKey,
    userIds: [...new Set(featuredIdsFromDay(prev))],
  };
  return [...(prev.featuredHistory ?? []), entry].slice(-7);
}

/** User IDs named on recent daily cards (offices + prophecies), newest last. */
export function recentFeaturedUserIds(guildId, days = 3) {
  const day = getGuildDay(guildId);
  if (!day) return [];
  const rows = [...(day.featuredHistory ?? [])];
  if (day.dateKey === amsterdamDateKey() && day.yesterday) {
    rows.push({
      dateKey: day.yesterday.dateKey,
      userIds: [
        day.yesterday.offices?.chosenUserId,
        day.yesterday.offices?.antichristUserId,
        ...(day.yesterday.card?.prophecies ?? []).map((p) => p.userId),
      ].filter(Boolean),
    });
  } else if (day.dateKey !== amsterdamDateKey()) {
    rows.push({ dateKey: day.dateKey, userIds: featuredIdsFromDay(day) });
  }
  return [...new Set(rows.slice(-days).flatMap((r) => r.userIds ?? []))];
}

export function getGuildDay(guildId) {
  if (!guildId) return null;
  const all = readAll();
  return all.guilds[guildId] ?? null;
}

export function getTodayCard(guildId) {
  const day = getGuildDay(guildId);
  if (!day || day.dateKey !== amsterdamDateKey() || !day.card) return null;
  return day.card;
}

function mutate(guildId, fn) {
  const all = readAll();
  if (!all.guilds[guildId]) all.guilds[guildId] = emptyDay(amsterdamDateKey());
  const next = fn(all.guilds[guildId]);
  if (next) all.guilds[guildId] = next;
  writeAll(all);
  return all.guilds[guildId];
}

/** Roll the date if needed. Returns { day, closedYesterday }. */
export function rollGuildDay(guildId) {
  if (!guildId) return { day: null, closedYesterday: null };
  const today = amsterdamDateKey();
  const all = readAll();
  const prev = all.guilds[guildId];
  if (!prev) {
    const day = emptyDay(today);
    all.guilds[guildId] = day;
    writeAll(all);
    return { day, closedYesterday: null };
  }
  if (prev.dateKey === today) return { day: prev, closedYesterday: null };

  if (prev.card?.prophecies) {
    for (const p of prev.card.prophecies) {
      if (p.status === 'open') p.status = 'failed';
    }
  }

  const closedYesterday = {
    dateKey: prev.dateKey,
    card: prev.card,
    offices: prev.offices,
    events: prev.ledger?.events ?? [],
    closing: null,
  };
  const day = emptyDay(today);
  day.yesterday = closedYesterday;
  day.featuredHistory = appendFeaturedHistory(prev);
  all.guilds[guildId] = day;
  writeAll(all);
  return { day, closedYesterday };
}

const SOFTER_CARD_MOODS = {
  en: [
    'RELIEVED (SUSPICIOUSLY)',
    'ADMINISTRATIVELY SOFTENED',
    'THE FURY THINS',
    'PROVISIONALLY CALMER',
    'MERCY ON FILE',
  ],
  nl: [
    'OPGELUCHT (VERDACHT)',
    'AMBTELIJK VERZACHT',
    'DE WOEDE DUNT',
    'VOORLOPIG RUSTER',
    'GENADE IN HET DOSSIER',
  ],
};

/** After a successful /forgiveme: happier card mood, so-far stamp, clear antichrist office if cleansed. */
export function applyForgivenessToTodayCard(guildId, { userId, antichristCleansed = false, langCode = 'en' } = {}) {
  if (!guildId || !userId) return null;
  const today = amsterdamDateKey();
  return mutate(guildId, (day) => {
    if (day.dateKey !== today || !day.card) return day;
    const pool = SOFTER_CARD_MOODS[langCode] ?? SOFTER_CARD_MOODS.en;
    const nextMood = pool[Math.floor(Math.random() * pool.length)];
    day.card = {
      ...day.card,
      mood: nextMood,
      amendment: antichristCleansed
        ? (langCode === 'nl'
          ? `De antichrist-smet op <@${userId}> is opgeheven.  Gevraagd voor het sluiten van de dag.`
          : `The antichrist stain on <@${userId}> is lifted.  Asked before the day closed.`)
        : (day.card.amendment ?? ''),
    };
    if (antichristCleansed) {
      day.offices = { ...(day.offices ?? {}), antichristUserId: null };
    }
    if (!day.ledger) day.ledger = emptyLedger();
    day.ledger.events.push({
      t: Date.now(),
      kind: antichristCleansed ? 'cleansed' : 'forgiven',
      userId,
    });
    day.ledger.events = day.ledger.events.slice(-40);
    return day;
  });
}

export function saveTodayCard(guildId, card, offices = {}) {
  return mutate(guildId, (day) => {
    const today = amsterdamDateKey();
    if (day.dateKey !== today) {
      day = emptyDay(today);
    }
    day.card = card;
    day.offices = {
      chosenUserId: offices.chosenUserId ?? day.offices?.chosenUserId ?? null,
      antichristUserId: offices.antichristUserId ?? day.offices?.antichristUserId ?? null,
    };
    return day;
  });
}

export function markDayPosted(guildId, channelId) {
  return mutate(guildId, (day) => {
    day.postedAt = Date.now();
    day.postedChannelId = channelId;
    const ids = new Set(day.postedChannelIds ?? []);
    if (channelId) ids.add(String(channelId));
    day.postedChannelIds = [...ids];
    return day;
  });
}

export function wasChannelPostedToday(guildId, channelId) {
  const day = getGuildDay(guildId);
  if (!day || day.dateKey !== amsterdamDateKey() || !channelId) return false;
  const ids = day.postedChannelIds ?? (day.postedChannelId ? [day.postedChannelId] : []);
  return ids.map(String).includes(String(channelId));
}

export function saveYesterdayClosing(guildId, closing) {
  return mutate(guildId, (day) => {
    if (!day.yesterday) return day;
    day.yesterday.closing = closing;
    return day;
  });
}

export function recordDayEvent(guildId, event) {
  return mutate(guildId, (day) => {
    if (!day.ledger) day.ledger = emptyLedger();
    day.ledger.events.push({
      t: Date.now(),
      ...event,
    });
    day.ledger.events = day.ledger.events.slice(-40);
    return day;
  });
}

export function hasOnce(guildId, key) {
  const day = getGuildDay(guildId);
  if (!day || day.dateKey !== amsterdamDateKey()) return false;
  return Boolean(day.ledger?.once?.[key]);
}

export function markOnce(guildId, key) {
  mutate(guildId, (day) => {
    if (!day.ledger) day.ledger = emptyLedger();
    if (!day.ledger.once) day.ledger.once = {};
    day.ledger.once[key] = Date.now();
    return day;
  });
}

export function canPublicStamp(guildId) {
  const day = getGuildDay(guildId);
  if (!day || day.dateKey !== amsterdamDateKey()) return false;
  const ledger = day.ledger ?? emptyLedger();
  if (ledger.publicStamps >= MAX_PUBLIC_STAMPS) return false;
  if (ledger.publicStamps > 0 && Date.now() - (ledger.lastStampAt ?? 0) < MIN_STAMP_GAP_MS) return false;
  return true;
}

export function markPublicStamp(guildId, kind) {
  mutate(guildId, (day) => {
    if (!day.ledger) day.ledger = emptyLedger();
    day.ledger.publicStamps = (day.ledger.publicStamps ?? 0) + 1;
    day.ledger.lastStampAt = Date.now();
    day.ledger.lastStampKind = kind;
    return day;
  });
}

export function fulfillProphecy(guildId, prophecyId) {
  let hit = null;
  mutate(guildId, (day) => {
    const p = day.card?.prophecies?.find((x) => x.id === prophecyId);
    if (p && p.status === 'open') {
      p.status = 'fulfilled';
      hit = p;
    }
    return day;
  });
  return hit;
}

export function failOpenProphecies(guildId) {
  const failed = [];
  const day = getGuildDay(guildId);
  if (!day?.card?.prophecies) return failed;
  for (const p of day.card.prophecies) {
    if (p.status === 'open') {
      p.status = 'failed';
      failed.push(p);
    }
  }
  mutate(guildId, (d) => {
    d.card = day.card;
    return d;
  });
  return failed;
}

export function soFarLines(guildId, lang) {
  const day = getGuildDay(guildId);
  if (!day || day.dateKey !== amsterdamDateKey()) return [];
  const events = day.ledger?.events ?? [];
  if (!events.length) return [];
  const L = lang.dayLaw;
  return events.slice(-6).map((e) => {
    if (e.kind === 'forbidden' && e.userId) return L.soFarForbidden(e.userId, e.word);
    if (e.kind === 'prophecy' && e.userId) return L.soFarProphecy(e.userId, e.claim);
    if (e.kind === 'least' && e.userId) return L.soFarLeast(e.userId);
    if (e.kind === 'chosen' && e.userId) return L.soFarChosen(e.userId);
    if (e.kind === 'antichrist' && e.userId) return L.soFarAntichrist(e.userId);
    if (e.kind === 'rule' && e.userId) return L.soFarRule(e.userId);
    if (e.kind === 'cleansed' && e.userId) {
      return L.soFarCleansed?.(e.userId) ?? `Antichrist <@${e.userId}> cleansed`;
    }
    if (e.kind === 'forgiven' && e.userId) {
      return L.soFarForgiven?.(e.userId) ?? `<@${e.userId}> was forgiven`;
    }
    return null;
  }).filter(Boolean);
}
