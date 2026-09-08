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

// ─── Prompt block ─────────────────────────────────────────────────────────────

/** Self-context block for AI prompts. English framing; output language is
 *  controlled by each prompt's own output instruction. */
export function buildSelfContextBlock() {
  const state = loadState();
  const mood = getGeneralMood();
  const lines = [
    `YOUR OWN STATE (you, Michael — separate from your attitude toward any user):`,
    `Your general mood today: ${describeGeneralMood(mood)}`,
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
