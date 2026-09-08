import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SELF_PATH = join(__dirname, '../data/michael-self.json');

// ─── Michael's memory of himself ──────────────────────────────────────────────
//
// Three layers, cheapest first:
//   recentSayings...  verbatim queue of his own last outgoing lines (short-term)
//   selfSummary...    rolling first-person digest, condensed by the cheapest
//                     model once the queue fills (long-term)
//   ephemera...       time-boxed notes ("today's law", "billed X") that matter
//                     now but must NOT survive into the grander scheme...  they
//                     expire and are pruned on every read, and are never fed
//                     into the long-term summary
//
// Separate from michael-memory.json, which is entirely about users. This file
// also holds his GENERAL mood...  one mood for Michael himself, independent of
// the per-user currentMood ("mood toward them") that lives on user records.

const MAX_SAYINGS         = 12;
const CONDENSE_AT         = 10;   // queue length that triggers summarisation
const KEEP_AFTER_CONDENSE = 3;    // verbatim lines kept after a condense
const MAX_SELF_SUMMARY    = 600;
const MAX_EPHEMERA        = 12;
const DEFAULT_EPHEMERA_TTL_MS = 36 * 60 * 60 * 1000; // 36h
const GENERAL_MOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000; // re-roll after a day

// Kinder distribution than the per-user moods: 'genadig' (merciful) exists
// ONLY as a general mood, so Michael gets soft days without going soft on
// any particular sinner.
const GENERAL_MOOD_WEIGHTS = [
  ['genadig', 2],
  ['kosmisch', 2],
  ['loom', 2],
  ['afwezig', 2],
  ['verward', 1.5],
  ['passief-agressief', 1],
  ['streng', 1],
  ['woedend', 0.5],
];

const GENERAL_MOOD_DESCRIPTIONS = {
  genadig: 'Merciful. An unfamiliar lightness. Small kindnesses slip out before he can file them.',
  kosmisch: 'Cosmic. Everything connects to everything. Mildly generous by accident.',
  loom: 'Languid. Slow, warm, too tired to be truly cruel.',
  afwezig: 'Absent. Detached, vague, elsewhere.',
  verward: 'Confused. The paperwork swims. Judgements come out sideways.',
  'passief-agressief': 'Passive-aggressive. Everything is fine. Everything is noted.',
  streng: 'Stern. The register is open and the pen is sharp.',
  woedend: 'Wrathful. Even the weather is filed as an offence.',
};

// General mood eases (or sours) EVERY dice roll, on top of the per-user mood.
const GENERAL_MOOD_ROLL_MOD = {
  genadig: 3,
  kosmisch: 2,
  loom: 1,
  afwezig: 0,
  verward: 0,
  'passief-agressief': -1,
  streng: -2,
  woedend: -3,
};

// ─── I/O ──────────────────────────────────────────────────────────────────────

function defaultState() {
  return {
    generalMood: 'afwezig',
    generalMoodSetAt: 0,
    selfSummary: null,
    recentSayings: [], // { text, kind, userId, username, guildId, ts }
    ephemera: [],      // { text, expiresAt }
  };
}

// Read-through cache, same pattern as michael-memory.js: reads hit memory,
// writes stay synchronous. Restart the bot after hand-editing the JSON.
let stateCache = null;

function loadState() {
  let state = stateCache;
  if (!state) {
    state = defaultState();
    if (existsSync(SELF_PATH)) {
      try {
        state = { ...defaultState(), ...JSON.parse(readFileSync(SELF_PATH, 'utf8')) };
      } catch { /* corrupted file...  start over */ }
    }
    stateCache = state;
  }
  const now = Date.now();
  const before = state.ephemera.length;
  state.ephemera = state.ephemera.filter((e) => e.expiresAt > now);
  if (state.ephemera.length !== before) saveState(state);
  return state;
}

function saveState(state) {
  stateCache = state;
  mkdirSync(dirname(SELF_PATH), { recursive: true });
  writeFileSync(SELF_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── General mood ─────────────────────────────────────────────────────────────

function weightedMood() {
  const total = GENERAL_MOOD_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [mood, w] of GENERAL_MOOD_WEIGHTS) {
    r -= w;
    if (r <= 0) return mood;
  }
  return 'afwezig';
}

/** Michael's own mood. Self-heals: re-rolls once stale (>24h). */
export function getGeneralMood() {
  const state = loadState();
  if (Date.now() - (state.generalMoodSetAt ?? 0) > GENERAL_MOOD_MAX_AGE_MS) {
    state.generalMood = weightedMood();
    state.generalMoodSetAt = Date.now();
    saveState(state);
    console.log(`[michael] general mood rolled | ${state.generalMood}`);
  }
  return state.generalMood;
}

export function generalMoodRollModifier(mood = null) {
  return GENERAL_MOOD_ROLL_MOD[mood ?? getGeneralMood()] ?? 0;
}

export function describeGeneralMood(mood = null) {
  const m = mood ?? getGeneralMood();
  return `${m} — ${GENERAL_MOOD_DESCRIPTIONS[m] ?? GENERAL_MOOD_DESCRIPTIONS.afwezig}`;
}

// ─── Sayings queue + ephemera ─────────────────────────────────────────────────

/** Record something Michael himself just said publicly. */
export function recordMichaelSaying(text, { kind = 'chat', userId = null, username = null, guildId = null } = {}) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!clean) return;
  const state = loadState();
  state.recentSayings = [
    ...state.recentSayings,
    { text: clean, kind, userId, username, guildId, ts: Date.now() },
  ].slice(-MAX_SAYINGS);
  saveState(state);
}

/** File a time-boxed note that must expire ("today's law", "billed X"). */
export function addSelfEphemera(text, ttlMs = DEFAULT_EPHEMERA_TTL_MS) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) return;
  const state = loadState();
  state.ephemera = [...state.ephemera, { text: clean, expiresAt: Date.now() + ttlMs }].slice(-MAX_EPHEMERA);
  saveState(state);
}

export function selfNeedsCondense() {
  return loadState().recentSayings.length >= CONDENSE_AT;
}

/** Everything the summariser needs, in one read. */
export function getSayingsForCondense() {
  const state = loadState();
  return {
    sayings: state.recentSayings.slice(0, -KEEP_AFTER_CONDENSE),
    summary: state.selfSummary,
  };
}

/** Store the condensed summary; keep only the freshest verbatim lines. */
export function applySelfCondense(summary) {
  const state = loadState();
  state.selfSummary = String(summary ?? '').trim().slice(0, MAX_SELF_SUMMARY) || state.selfSummary;
  state.recentSayings = state.recentSayings.slice(-KEEP_AFTER_CONDENSE);
  saveState(state);
}

// ─── The eternal labour ───────────────────────────────────────────────────────
//
// Michael has one long-term work that is never, ever finished. It is not a
// goal — it is a backlog he has been carrying for centuries. It creeps forward,
// then suffers a setback, forever. He blames his mood on it, mentions it in
// rants, and lets it colour the register. It exists so he has an inner life
// between commands instead of being pure reaction.

const LABOURS = [
  {
    key: 'census',
    nl: 'de Volkstelling der Zielen (voor de derde maal opnieuw begonnen)',
    en: 'the Census of Souls (restarted for the third time)',
  },
  {
    key: 'report',
    nl: 'het Kwartaalverslag aan het Hogere Register (achterstallig sinds de veertiende eeuw)',
    en: 'the Quarterly Report to the Higher Register (overdue since the fourteenth century)',
  },
  {
    key: 'archive',
    nl: 'de herordening van het Archief van Onbeantwoorde Gebeden',
    en: 'the reordering of the Archive of Unanswered Prayers',
  },
  {
    key: 'inventory',
    nl: 'de inventarisatie van alle verloren voorwerpen sinds de Zondvloed',
    en: 'the inventory of every lost object since the Flood',
  },
];

const SETBACKS = {
  nl: [
    'een hele kolom is in het ongerede geraakt',
    'de nummering blijkt vanaf het begin verkeerd',
    'een lagere engel heeft het in de verkeerde volgorde teruggelegd',
    'de inkt is vervaagd op de belangrijkste bladzijde',
    'er is een nieuwe richtlijn van boven gekomen, met terugwerkende kracht',
  ],
  en: [
    'an entire column has gone astray',
    'the numbering turns out to have been wrong from the start',
    'a lesser angel refiled it in the wrong order',
    'the ink has faded on the one page that mattered',
    'a new directive has come down from above, retroactively',
  ],
};

const LABOUR_TICK_MS = 20 * 60 * 60 * 1000; // advances at most once a day-ish

function defaultLabour() {
  return {
    key: LABOURS[Math.floor(Math.random() * LABOURS.length)].key,
    progress: Math.floor(Math.random() * 30) + 5,
    setbacks: 0,
    lastSetback: null,
    tickedAt: 0,
  };
}

/**
 * The labour creeps forward, then collapses. It never completes: past 80% the
 * odds of a setback rise sharply, and a setback knocks it back down. On a total
 * collapse he starts a different work entirely, which is somehow worse.
 */
function tickLabour(state) {
  if (!state.labour || typeof state.labour !== 'object') state.labour = defaultLabour();
  const l = state.labour;
  if (Date.now() - (l.tickedAt ?? 0) < LABOUR_TICK_MS) return l;
  l.tickedAt = Date.now();

  const setbackChance = l.progress > 80 ? 0.65 : l.progress > 50 ? 0.3 : 0.15;
  if (Math.random() < setbackChance) {
    const pool = SETBACKS.nl;
    const idx = Math.floor(Math.random() * pool.length);
    l.lastSetback = { nl: SETBACKS.nl[idx], en: SETBACKS.en[idx], at: Date.now() };
    l.setbacks += 1;
    l.progress = Math.max(1, l.progress - (Math.floor(Math.random() * 35) + 15));
    if (l.progress <= 3 && Math.random() < 0.5) {
      // Total collapse: he begins a different eternal work instead
      const others = LABOURS.filter((x) => x.key !== l.key);
      l.key = others[Math.floor(Math.random() * others.length)].key;
      l.progress = Math.floor(Math.random() * 10) + 2;
      l.setbacks = 0;
    }
    console.log(`[michael] labour setback | ${l.key} | now ${l.progress}%`);
  } else {
    l.progress = Math.min(97, l.progress + Math.floor(Math.random() * 6) + 1);
  }
  saveState(state);
  return l;
}

/** The current eternal labour, ticked. */
export function getLabour() {
  const state = loadState();
  const l = tickLabour(state);
  const def = LABOURS.find((x) => x.key === l.key) ?? LABOURS[0];
  return { ...l, nl: def.nl, en: def.en };
}

// ─── Absence inquiries (cooldown bookkeeping) ────────────────────────────────
//
// Hard cooldowns, persisted: at most one inquiry per guild per ASK_GUILD_CD,
// and never about the same soul twice within ASK_USER_CD.

const ABSENCE_GUILD_CD_MS = 4 * 24 * 60 * 60 * 1000;  // one ask per guild per 4 days
const ABSENCE_USER_CD_MS = 14 * 24 * 60 * 60 * 1000;  // same soul at most every 2 weeks

export function canAskAboutAbsence(guildId, userId) {
  const state = loadState();
  const a = state.absenceAsks ?? { guilds: {}, users: {} };
  const now = Date.now();
  if (now - (a.guilds?.[guildId] ?? 0) < ABSENCE_GUILD_CD_MS) return false;
  if (now - (a.users?.[userId] ?? 0) < ABSENCE_USER_CD_MS) return false;
  return true;
}

export function noteAbsenceAsked(guildId, userId) {
  const state = loadState();
  if (!state.absenceAsks || typeof state.absenceAsks !== 'object') state.absenceAsks = { guilds: {}, users: {} };
  if (!state.absenceAsks.guilds) state.absenceAsks.guilds = {};
  if (!state.absenceAsks.users) state.absenceAsks.users = {};
  state.absenceAsks.guilds[guildId] = Date.now();
  state.absenceAsks.users[userId] = Date.now();
  saveState(state);
}

// ─── Prompt block ─────────────────────────────────────────────────────────────

/** Self-context block for AI prompts. English framing; output language is
 *  controlled by each prompt's own output instruction. */
export function buildSelfContextBlock() {
  const state = loadState();
  const mood = getGeneralMood();
  const labour = getLabour();
  const lines = [
    `YOUR OWN STATE (you, Michael — separate from your attitude toward any user):`,
    `Your general mood today: ${describeGeneralMood(mood)}`,
    `YOUR ETERNAL LABOUR (background, never a topic on its own): you are working on ${labour.en}. It stands at roughly ${labour.progress}% and has suffered ${labour.setbacks} setback(s).${labour.lastSetback ? ` Most recently: ${labour.lastSetback.en}.` : ''} It will never be finished. You may reference it rarely (roughly one reply in eight) — blame your mood on it, resent the time this conversation costs you, note that a soul's request goes to the bottom of a very long pile. Never explain it at length, never ask for help, never announce progress as good news.`,
  ];
  if (state.selfSummary) {
    lines.push(`What you recall of your own recent conduct: ${state.selfSummary}`);
  }
  const recent = state.recentSayings.slice(-4);
  if (recent.length) {
    lines.push('Things you yourself said recently (stay consistent with them; you may refer back, never repeat verbatim):');
    for (const s of recent) {
      const who = s.username ? ` to ${s.username}` : '';
      lines.push(`- [${s.kind}${who}] "${s.text}"`);
    }
  }
  if (state.ephemera.length) {
    lines.push('Temporary matters still on your desk (these expire; mention only while relevant):');
    for (const e of state.ephemera.slice(-5)) {
      lines.push(`- ${e.text}`);
    }
  }
  return lines.join('\n');
}
