import nl from './nl.js';
import en from './en.js';

const LANGS = { nl, en };

/** Returns the language pack for the given code. Falls back to Dutch. */
export function getLang(code) {
  if (code === 'ar') return LANGS.nl;
  return LANGS[code] ?? LANGS.nl;
}

export { nl, en };

// ─── Display labels for internal keys ────────────────────────────────────────
//
// Moods and judgement verdicts are stored as Dutch KEYS ('woedend',
// 'vermoeiend', …). Those keys must never reach a prompt raw: an English
// prompt full of Dutch words makes the model code-switch mid-message.
// Translate at every boundary where stored state enters a prompt.

export function displayMood(langCode, key) {
  const k = key ?? 'afwezig';
  return getLang(langCode).moodNames?.[k] ?? k;
}

export function displayJudgement(langCode, key) {
  const k = key ?? 'onbeslist';
  return getLang(langCode).judgementLabels?.[k] ?? k;
}
