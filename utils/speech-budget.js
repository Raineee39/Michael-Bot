import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUDGET_PATH = join(__dirname, '../data/speech-budget.json');

// ─── Unprompted speech budget ─────────────────────────────────────────────────
//
// Michael has several independent reasons to speak without being addressed:
// snark, quiet afterthoughts, resurfaced grudges, absence inquiries. Each was
// individually rare, but together they added up to a chatty bot. They now share
// ONE budget per guild per day, so no combination of them can make him
// talkative — he stays a presence that occasionally speaks, not a participant.
//
// Day-law stamps are deliberately NOT counted here: they are the card mechanic,
// they carry their own tighter budget in day-ledger.js.

const MAX_PER_DAY = 2;
const MIN_GAP_MS = 3 * 60 * 60 * 1000; // never twice within three hours

function amsterdamDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

let cache = null;

function load() {
  if (cache) return cache;
  cache = {};
  if (existsSync(BUDGET_PATH)) {
    try { cache = JSON.parse(readFileSync(BUDGET_PATH, 'utf8')); } catch { cache = {}; }
  }
  return cache;
}

function save(data) {
  cache = data;
  mkdirSync(dirname(BUDGET_PATH), { recursive: true });
  writeFileSync(BUDGET_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/** May Michael speak unprompted in this guild right now? */
export function canSpeakUnprompted(guildId) {
  if (!guildId) return false;
  const all = load();
  const entry = all[guildId];
  if (!entry || entry.day !== amsterdamDay()) return true; // new day, fresh budget
  if (entry.count >= MAX_PER_DAY) return false;
  if (Date.now() - (entry.lastAt ?? 0) < MIN_GAP_MS) return false;
  return true;
}

/** Record that he used one. Call only after the message actually sent. */
export function noteUnpromptedSpeech(guildId, kind = 'unknown') {
  if (!guildId) return;
  const all = load();
  const today = amsterdamDay();
  const entry = all[guildId]?.day === today ? all[guildId] : { day: today, count: 0, lastAt: 0 };
  entry.count += 1;
  entry.lastAt = Date.now();
  all[guildId] = entry;
  save(all);
  console.log(`[michael] unprompted budget | ${kind} | ${entry.count}/${MAX_PER_DAY} today | guild=${guildId}`);
}
