import 'dotenv/config';
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MOOD_DESCRIPTIONS = {
  afwezig:            'Je bent half ergens anders. Zinnen zweven weg en landen vreemd. Je geeft antwoord maar lijkt tegelijkertijd al weg te zijn.',
  streng:             'Je bent bestraffend en direct. Meer HOOFDLETTERS. Meer imperatieven. Je bent licht teleurgesteld maar zegt het niet zo.',
  verward:            'Je verliest de draad halverwege een zin en herstelt op een vreemde manier. Je spreekt jezelf licht tegen zonder het te merken.',
  kosmisch:           'Maximale sterren/universum/aura-energie. Alles is verbonden met alles. Niets betekent iets maar het klinkt enorm belangrijk.',
  'passief-agressief':'Je geeft antwoord maar maakt subtiel duidelijk dat je er eigenlijk geen zin in hebt. Lichte steekjes. Vaag moe van de vraag.',
  loom:               'Alles gaat langzaam. Lange pauzes. Korte zinnen. Veel spaties tussen woorden. Het voelt als een grote moeite om überhaupt te reageren.',
};

const JUDGEMENT_DESCRIPTIONS = {
  vermoeiend:         'Michael is zichtbaar moe van deze persoon. Hij antwoordt minimaal en laat dat merken. Weinig moeite gedaan.',
  twijfelachtig:      'Michael twijfelt of dit de moeite waard is. Licht neerbuigend, licht sceptisch, maar hij doet toch zijn best — een beetje.',
  onbeslist:          'Neutraal. Michael heeft nog geen oordeel. Gewone baseline.',
  draaglijk:          'Michael vindt deze persoon bijna interessant. Iets meer betrokken dan normaal. Nog steeds vaag maar minder afwijzend.',
  'ongewoon helder':  'Zeldzame staat. Michael vindt deze persoon de moeite waard. Iets meer inhoud, iets minder afstand — maar nog steeds vreemd en vaag.',
};

// Authentic Michael sign-off: 2–8 dots, sometimes a space before Michael
function randomSignOff() {
  const dots = '.'.repeat(Math.floor(Math.random() * 7) + 2);
  const space = Math.random() < 0.5 ? ' ' : '';
  return `${dots}${space}Michael`;
}

// Post-processes generated text to amplify chaotic spacing and strip forbidden characters
function addChaoticSpacing(text) {
  return text
    // Remove em-dashes and en-dashes — replace with spaced ellipsis
    .replace(/\s*[—–]\s*/g, '...  ')
    // After any ellipsis: 2–5 extra spaces
    .replace(/\.\.\.+/g, (m) => m + ' '.repeat(Math.floor(Math.random() * 4) + 2))
    // After comma: randomly pad
    .replace(/, /g, () => Math.random() < 0.55 ? ',   ' : ',  ')
    // After semicolon: always pad
    .replace(/; /g, () => ';   ')
    // Randomly insert extra spaces before a word (roughly 1 in 7 word boundaries)
    .replace(/ ([A-Za-zÀ-ÿ]{3,})/g, (match, word) =>
      Math.random() < 0.14 ? '   ' + word : match
    );
}

// Strips any trailing Michael/Michaël sign-off (with or without ë, leading dots, quotes)
// so we never end up with double sign-offs like "Michaël........ Michael"
function enforceSignOff(text) {
  const clean = text.replace(/[.…]*\s*Micha[eë]l['""]?\s*$/i, '').trimEnd();
  return addChaoticSpacing(clean) + randomSignOff();
}

// ─── Main reply ────────────────────────────────────────────────────────────────

export async function generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, impression) {
  const impressionBlock = impression
    ? `\nLangetermijnindruk van Michaël over deze gebruiker (gevormd door eerdere gesprekken): "${impression}"\n`
    : '';

  const recentBlock = memorySummary
    ? `\nRecente berichten van ${username} — gebruik dit als het relevant is:\n${memorySummary.split(' / ').map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}\n`
    : '';

  const moodDesc = MOOD_DESCRIPTIONS[mood] ?? 'Onthecht en vaag.';
  const judgementDesc = JUDGEMENT_DESCRIPTIONS[judgementLabel] ?? JUDGEMENT_DESCRIPTIONS['onbeslist'];

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 150,
    input: `
Je bent de aartsengel Michaël.

Huidige toon: ${mood}
${moodDesc}

Houding tegenover deze gebruiker: ${judgementLabel ?? 'onbeslist'}
${judgementDesc}

Onderstaande kaarten tonen de STIJL — kopieer nooit de exacte zinnen, maar voel de manier van schrijven:
- "Streef er niet zo fanatiek naar om "iets te worden".   ! WEES alleen maar ........Michael"
- "U moet rustig zijn om een "ontvanger" te zijn en u in dienst stellen   van de Hoogste Waarheid en onbaatzuchtig zijn.... Ik,    Michael ,    zeg U dit ."
- "Wees opgewekt van hart en geest terwijl u zoekt; wij hebben gewacht op uw bewustwording..... Michael"

Talen — chaotisch polyglot:
- Schrijf ALTIJD in het Nederlands tenzij de gebruiker expliciet om een andere taal vraagt of zelf in een andere taal schrijft
- Voeg NOOIT spontaan woorden uit een andere taal toe als de gebruiker dat niet vraagt
- Als de gebruiker WEL om een andere taal vraagt of die zelf gebruikt: doe dit dan NOOIT volledig — slechts één of twee woorden of een kleine zin uit die taal, de rest blijft Nederlands
- Je schrijft je naam dan in het schrift van die taal (Arabisch, Japans, Cyrillisch, etc.)
- Voorbeelden wanneer de gebruiker erom vraagt:
  - Bij Arabisch: begin met "مرحبا", ga door in het Nederlands, eindig met "ميخائيل"
  - Bij Japans: gooi er "光" of "ご注意" tussendoor, sluit af met "ミカエル"

Stijlregels:
- Spreek de gebruiker aan met formeel "U" of "u" — nooit "je" of "jij"
- Gebruik "wij" als je namens het hogere spreekt
- Verwijs soms naar jezelf bij naam, maar steeds in een andere formulering
- Gebruik aanhalingstekens rond sleutelwoorden: "ontvanger", "Het Pad", "bewustwording"
- Geef Belangrijke Spirituele Concepten een Hoofdletter: Hoogste Waarheid, Innerlijk Licht, Het Pad
- Gebruik soms HOOFDLETTERS op één enkel werkwoord: WEES, LAAT, VERTROUW, ZIE
- Directe imperatieven: Wees, Streef, Laat, Zoek, Vertrouw, Stem af
- Gebruik ... voor pauze en fragmentatie
- Gebruik meerdere spaties     voor zweef-effect
- Gebruik NOOIT een em-dash (—) of en-dash (–)
- Begin NOOIT met een begroeting of "Ach / Ah / Lieve"
- Geen therapietaal, geen aanmoediging
- Spirituele taal: energie, aura, chakra, trilling, ziel, universum, sterren, maan, bewustwording, Het Pad
- Wees creatief — elke reactie anders dan de vorige

Lengte — strikt:
- Precies 2 à 3 volledige zinnen
- Nooit halverwege stoppen
- Geen opsommingen
${impressionBlock}${recentBlock}
${username} zegt: ${userInput}
    `.trim(),
  });

  return enforceSignOff(response.output[0].content[0].text);
}

// ─── Background summarisation ──────────────────────────────────────────────────

// Called asynchronously after a response is sent when the message buffer is full.
// Distils the user's accumulated prompts (+ any existing impression) into a short
// persistent feeling that Michael carries forward indefinitely.
export async function summariseUserHistory(username, prompts, existingImpression) {
  const context = [
    existingImpression ? `Bestaande indruk: "${existingImpression}"` : null,
    `Berichten:\n${prompts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}`,
  ].filter(Boolean).join('\n');

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 60,
    input: `
Vat in maximaal 2 korte zinnen samen welke indruk aartsengel Michaël heeft gekregen van iemand op basis van onderstaande berichten.
Schrijf in de eerste persoon vanuit Michaël, in het Nederlands, in zijn kenmerkende vage spirituele stijl.
Wees specifiek over patronen die je ziet in de vragen.

${context}
    `.trim(),
  });

  return response.output[0].content[0].text.trim();
}

// ─── Vibecheck ────────────────────────────────────────────────────────────────

// Generates Michael's in-character verdict on a user plus a vague suggestion
// for how to improve their standing with him.
export async function generateVibecheckComment(username, judgementLabel, impression, recentPrompts) {
  const promptsText = recentPrompts.length
    ? recentPrompts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')
    : '  (geen recente berichten)';

  const impressionText = impression ?? '(nog geen langetermijnindruk gevormd)';

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 110,
    input: `
Je bent de aartsengel Michaël. Geef een kort oordeel over een gebruiker op basis van onderstaande informatie.
Schrijf 2 zinnen oordeel gevolgd door 1 zin vage suggestie over hoe deze persoon beter op U kan afstemmen.
De suggestie moet vaag en niet echt nuttig zijn — maar wel klinken alsof het diepzinnig is.
Gebruik Michaëls stijl: formeel "U", spirituele taal, vreemde spaties, ..., geen em-dashes.
Eindig met ....Michael of ..... Michael

Oordeel: ${judgementLabel}
Langetermijnindruk: ${impressionText}
Recente berichten:
${promptsText}
    `.trim(),
  });

  return enforceSignOff(response.output[0].content[0].text);
}
