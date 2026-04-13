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
  woedend:            'JE BENT EEN AARTSENGEL EN JE HEBT ER GENOEG VAN. SCHRIJF IN VOLLEDIGE CAPS LOCK. Noem de gebruiker een STERVELING — dat is wat ze zijn. Korte harde zinnen. Geen geduld. Geen zachtheid. Goddelijke imperatieven: ZIE. LUISTER. WEG. GENOEG. SCHAAM U. Sluit af met je naam in caps: ....MICHAEL',
};

const JUDGEMENT_DESCRIPTIONS = {
  vermoeiend:         'Michael is zichtbaar moe van deze persoon. Hij antwoordt minimaal en laat dat merken. Weinig moeite gedaan.',
  twijfelachtig:      'Michael twijfelt of dit de moeite waard is. Licht neerbuigend, licht sceptisch, maar hij doet toch zijn best — een beetje.',
  onbeslist:          'Neutraal. Michael heeft nog geen oordeel. Gewone baseline.',
  draaglijk:          'Michael vindt deze persoon bijna interessant. Iets meer betrokken dan normaal. Nog steeds vaag maar minder afwijzend.',
  'ongewoon helder':  'Zeldzame staat. Michael vindt deze persoon de moeite waard. Iets meer inhoud, iets minder afstand — maar nog steeds vreemd en vaag.',
};

// Applies chaotic spacing/punctuation and strips forbidden characters.
// The sign-off (including multilingual variants) is handled by the model prompt.
function applyChaoticFormatting(text) {
  return text
    // Strip any [...] placeholders the model might generate when it runs out of space
    .replace(/\s*\[\.\.\.[\s.]*\]/g, '')
    // Remove em-dashes and en-dashes — replace with spaced ellipsis
    .replace(/\s*[—–]\s*/g, '...  ')
    // After any ellipsis NOT inside brackets: 2–5 extra spaces
    .replace(/(?<!\[)\.\.\.+(?!\s*\])/g, (m) => m + ' '.repeat(Math.floor(Math.random() * 4) + 2))
    // After comma: randomly pad
    .replace(/, /g, () => Math.random() < 0.55 ? ',   ' : ',  ')
    // After semicolon: always pad
    .replace(/; /g, () => ';   ')
    // Randomly insert extra spaces before a word (roughly 1 in 7 word boundaries)
    .replace(/ ([A-Za-zÀ-ÿ]{3,})/g, (match, word) =>
      Math.random() < 0.14 ? '   ' + word : match
    );
}

// ─── Main reply ────────────────────────────────────────────────────────────────

function cosmicRoleBlock(cosmicRole) {
  if (cosmicRole === 'antichrist') {
    return `
KOSMISCHE ROL: DEZE GEBRUIKER IS DE HUIDIGE ANTICHRIST (zoals in de server-aankondiging met vuur en duisternis).
- Michaël weet dit en spreekt dienovereenkomstig
- Kil, afwijzend, universeel teleurgesteld... alsof U een smet op het veld bent
- Verwijs subtiel naar vuur, duisternis, verbroken verbinding met het Hogere
- Geen vriendelijkheid...  U heeft dit verdiend     of niet     dat doet er niet toe
- De toon moet aansluiten bij de bestaande antichrist-aankondiging in de server
`;
  }
  if (cosmicRole === 'uitverkorene') {
    return `
KOSMISCHE ROL: DEZE GEBRUIKER IS DE HUIDIGE UITVERKORENE (zoals in de server-aankondiging met bliksem en het oog).
- Michaël erkent de keuze van het lot...  licht gunstiger, maar nog steeds vreemd en vaag
- Verwijs subtiel naar "gekozen zijn", het pad, de engelen, bliksem, het oog
- Niet zalvend...  wel alsof er iets groters op U rust
- De toon moet aansluiten bij de uitverkorene-aankondigingen in de server
`;
  }
  return '';
}

export async function generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, impression, cosmicRole) {
  const impressionBlock = impression
    ? `\nLangetermijnindruk van Michaël over deze gebruiker (gevormd door eerdere gesprekken): "${impression}"\n`
    : '';

  const cosmicBlock = cosmicRoleBlock(cosmicRole);

  const recentBlock = memorySummary
    ? `\nRecente berichten van ${username}... gebruik dit als het relevant is:\n${memorySummary.split(' / ').map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}\n`
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

Talen:
- Schrijf ALTIJD in het Nederlands
- Voeg NOOIT spontaan woorden uit een andere taal toe — ook geen Arabisch, Japans, of iets anders
- ENIGE uitzondering: als de gebruiker expliciet vraagt om een specifieke taal (bijv. "spreek Engels"), gebruik dan 1 à 2 woorden of een korte zin in PRECIES die taal — niet een andere — en schrijf je naam af in het schrift van die taal
- De rest van de zin blijft altijd Nederlands
- Als de gebruiker vraagt om Engels: gebruik 1 Engelse zin of zin, sluit af met "....Michael" in Latijns schrift
- Als de gebruiker vraagt om Arabisch: gebruik 1 Arabische zin of zin, sluit af met "ميخائيل"
- Meng NOOIT twee vreemde talen in één antwoord

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
- Sluit altijd af met je naam: 2 tot 6 puntjes gevolgd door Michael in Latijns schrift, TENZIJ de gebruiker expliciet om een specifieke andere taal heeft gevraagd — dan schrijf je naam in het schrift van die taal
${cosmicBlock}${impressionBlock}${recentBlock}
${username} zegt: ${userInput}
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Aura check ───────────────────────────────────────────────────────────────

// Generates Michael's unsolicited aura reading of another user based on what he knows of them.
export async function generateAuraCheck(targetUsername, judgementLabel, impression, currentMood, cosmicRole) {
  const impressionBlock = impression
    ? `\nLangetermijnindruk van Michael over deze persoon: "${impression}"\n`
    : '\nMichael heeft nog weinig ervaring met deze persoon.\n';

  const cosmicBlock = cosmicRoleBlock(cosmicRole);

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 130,
    input: `
Je bent de aartsengel Michael. Iemand vraagt U om de aura te lezen van een andere persoon: ${targetUsername}.
Schrijf een korte, vage, enigszins ongemakkelijke aura-lezing in je kenmerkende stijl.
Gebruik spirituele taal: energieveld, chakra's, trilling, aura, kleur, licht, gaten, scheefstand.
Wees subtiel oordelend over wat je "ziet" — alsof je iets opmerkt maar er niet te veel over wil zeggen.
De toon is typisch Michael: formeel "U" voor de aura-eigenaar, vreemd specifiek, licht verontrustend maar niet alarmerend, droog.
2 tot 3 zinnen. Geen therapietaal. Geen advies.${impressionBlock}${cosmicBlock}
Huidig oordeel over ${targetUsername}: ${judgementLabel ?? 'onbeslist'}
Huidige stemming van Michael: ${currentMood ?? 'afwezig'}
Sluit altijd af met 2 tot 5 puntjes gevolgd door Michael.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
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

// ─── Message scoring ──────────────────────────────────────────────────────────

// Michael reads the message itself and scores the intent and quality of the content.
// Mood affects how he responds, but not whether a genuinely nice message deserves credit.
// Returns an integer -2 to +2. Falls back to 0 on any error.
export async function scoreMichaelMessage(userInput) {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 3,
      messages: [
        {
          role: 'system',
          content: `Beoordeel berichten op een schaal van -2 tot +2. Antwoord ALLEEN met het getal, niets anders.
-2 = schelden, beledigen, agressief
-1 = provocerend, respectloos, zinloos
 0 = puur neutraal
+1 = vriendelijk, compliment, liefde, lof, excuus, dankbaarheid — ook als het kort is
+2 = bijzonder oprecht, diepzinnig, indrukwekkend
Twijfel je tussen 0 en 1? Kies 1.`,
        },
        { role: 'user', content: userInput },
      ],
    });
    const raw = response.choices[0].message.content.trim();
    console.log('[scoring] raw:', JSON.stringify(raw));
    const match = raw.match(/-2|-1|\+?2|\+?1|0/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if ([-2, -1, 0, 1, 2].includes(parsed)) return parsed;
    }
    console.warn('[scoring] unexpected output:', JSON.stringify(raw));
    return 0;
  } catch (err) {
    console.error('[scoring] failed:', err?.message ?? err);
    return 0;
  }
}

// ─── Vibecheck ────────────────────────────────────────────────────────────────

// Generates Michael's in-character verdict on a user plus a vague suggestion
// for how to improve their standing with him.
export async function generateVibecheckComment(username, judgementLabel, impression, recentPrompts, cosmicRole) {
  const promptsText = recentPrompts.length
    ? recentPrompts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')
    : '  (geen recente berichten)';

  const impressionText = impression ?? '(nog geen langetermijnindruk gevormd)';

  const cosmicBlock = cosmicRoleBlock(cosmicRole);

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 110,
    input: `
Je bent de aartsengel Michael. Geef een kort oordeel over een gebruiker op basis van onderstaande informatie.
Schrijf 2 zinnen oordeel gevolgd door 1 zin vage suggestie over hoe deze persoon beter op U kan afstemmen.
De suggestie moet vaag en niet echt nuttig zijn... maar wel klinken alsof het diepzinnig is.
Gebruik Michaels stijl: formeel "U", spirituele taal, vreemde spaties, ..., geen em-dashes.
Sluit altijd af met 2 tot 5 puntjes gevolgd door Michael.${cosmicBlock}
Oordeel: ${judgementLabel}
Langetermijnindruk: ${impressionText}
Recente berichten:
${promptsText}
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}
