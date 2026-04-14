import nl from './nl.js';
import en from './en.js';
import ar from './ar.js';

const LANGS = { nl, en, ar };

/** Returns the language pack for the given code. Falls back to Dutch. */
export function getLang(code) {
  return LANGS[code] ?? LANGS.nl;
}

export { nl, en, ar };
