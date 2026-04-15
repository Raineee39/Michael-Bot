const BOODSCHAPPEN = [
  'Dit betekent grote verandering     maar wanneer precies     dat weten wij niet     geduld is een schone zaak..Michael',
  'De uitverkorene draagt nu een verantwoordelijkheid     wat die precies inhoudt     wordt later duidelijk..Michael',
  'Jij bent gekozen uit velen     dit is geen vergissing     maar het kan even wennen..Michael',
  'Het lot heeft zijn vinger naar jou uitgestoken     dit reinigt niet altijd     maar het wijst wel..Michael',
  'Verwacht niet dat alles nu makkelijker wordt     maar het wordt anders     zeker anders..Michael',
  'De engelen hebben vergaderd     het duurde lang     maar over jou waren ze het snel eens..Michael',
  'Er is iets in jou dat het universum heeft opgemerkt     wat dat is     zeggen we nog niet..Michael',
  'De uitverkorene weet het zelf nog niet     dat is normaal     dat was bij ons allemaal zo..Michael',
  'Jouw pad was altijd al dit pad     je liep er alleen nog niet bewust op     dat verandert nu..Michael',
  'Dit moment was al geschreven voordat jij geboren werd     en toch verrast het ons een beetje..Michael',
  'Er wordt van je gevraagd     wat dat is weten wij     jij leert het onderweg..Michael',
  'De hemel heeft gesproken     de boodschap is jouw naam     en een zeker gevoel van onvermijdelijkheid..Michael',
];

// ─── GIF query pools...  Dutch / English (Archangel Michael themed) ────────────

const GIF_QUERIES = [
  'archangel michael painting',
  'saint michael warrior',
  'heavenly angel glowing',
  'angel wings divine light',
  'holy warrior armor heaven',
  'renaissance angel art',
  'divine judgment clouds',
  'angel sword heaven',
  'celestial light dramatic',
  'biblical lightning heaven',
  'angel descending light',
  'holy fire heaven',
];

const ANTICHRIST_GIF_QUERIES = [
  'fallen angel darkness',
  'biblical apocalypse fire',
  'devil horns dramatic',
  'hellfire brimstone',
  'dark angel fallen wings',
  'beast revelation biblical',
  'inferno dante painting',
];

const MICHAEL_MISC_GIF_QUERIES = [
  'cosmic nebula dramatic',
  'heaven gates opening light',
  'divine light rays cathedral',
  'thunderstorm dramatic sky',
  'warrior of god dramatic',
  'biblical clouds dramatic',
  'ancient cathedral light beam',
  'sword of light heaven',
];

// ─── GIF query pools...  Arabic (Imru' al-Qais / Jahili poet themed) ────────────

const GIF_QUERIES_AR = [
  'arabic calligraphy art',
  'desert sunset dramatic',
  'arabian horse galloping',
  'ancient manuscript arabic',
  'desert night stars',
  'bedouin desert dramatic',
  'arabian desert wind sand',
  'classical arabic art painting',
  'desert oasis dramatic',
  'poet dramatic nature',
];

const ANTICHRIST_GIF_QUERIES_AR = [
  'desert sandstorm dramatic',
  'arabian thunder storm',
  'ancient curse dramatic poetry',
  'dramatic sand dunes storm',
  'dark arabic calligraphy',
];

const MICHAEL_MISC_GIF_QUERIES_AR = [
  'arabic oud music dramatic',
  'ancient desert wisdom',
  'dramatic sunset poetry',
  'arabian night sky stars',
  'sand dunes wind dramatic',
  'desert fire dramatic',
  'ancient scroll poetry',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomBoodschap() {
  return BOODSCHAPPEN[Math.floor(Math.random() * BOODSCHAPPEN.length)];
}

/** Giphy search term for the daily uitverkorene announcement. */
export function getRandomGifQuery(langCode = 'nl') {
  return pick(langCode === 'ar' ? GIF_QUERIES_AR : GIF_QUERIES);
}

/** Giphy search term for optional GIFs on /chat */
export function getMichaelOptionalGifQuery(cosmicRole, langCode = 'nl') {
  if (langCode === 'ar') {
    if (cosmicRole === 'antichrist') return pick(ANTICHRIST_GIF_QUERIES_AR);
    if (cosmicRole === 'uitverkorene') return pick(GIF_QUERIES_AR);
    return pick([...GIF_QUERIES_AR, ...MICHAEL_MISC_GIF_QUERIES_AR]);
  }
  if (cosmicRole === 'antichrist') return pick(ANTICHRIST_GIF_QUERIES);
  if (cosmicRole === 'uitverkorene') return pick(GIF_QUERIES);
  return pick([...GIF_QUERIES, ...MICHAEL_MISC_GIF_QUERIES]);
}
