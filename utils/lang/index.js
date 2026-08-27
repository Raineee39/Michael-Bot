import nl from './nl.js';
import en from './en.js';

const LANGS = { nl, en };

/** Returns the language pack for the given code. Falls back to Dutch. */
export function getLang(code) {
  if (code === 'ar') return LANGS.nl;
  return LANGS[code] ?? LANGS.nl;
}

export { nl, en };
