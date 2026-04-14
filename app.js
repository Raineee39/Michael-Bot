import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { exec } from 'child_process';
import cron from 'node-cron';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  appendEditWithinDiscordLimit,
  DiscordRequest,
  getRandomEmoji,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
} from './utils.js';
import { getRandomWisdom } from './wisdom.js';
import { getRandomAuraLezing } from './aura.js';
import { getRandomBoodschap, getRandomGifQuery, getMichaelOptionalGifQuery } from './uitverkorene.js';
import { ROUND_1, ROUND_2, ROUND_3, VERDICTS, DATE_SCORES, DATE_ROUND4_PATHS } from './date.js';
import { generateMichaelMessage, summariseUserHistory, generateVibecheckComment, scoreMichaelMessage, generateAuraCheck, generateMorningAfter, generateDelayedConsequence, generatePostRevision, generateMijnRolComment } from './utils/openai.js';
import { loadUserMemory, saveUserMemory, getJudgementLabel, needsSummarisation, updateImpression, loadAllMemory, addUnfinishedBusiness, getOutstandingBusiness, markBusinessMentioned, markBusinessResolved, maybeAgeBusiness, addTheme, detectThemeOverlap, patchUserState, updateLastChannel, recordLanguageRequest, getRequestedLanguageCode, userSpeaksUnlockedLanguage, formatCharacterForPrompt, shouldReferenceCharacterThisTurn, updateMichaelPoints } from './utils/michael-memory.js';
import { ensureMichaelCharacter, runForgivenessRoll, runOnderhandelen, maybePassiveRollBlock } from './utils/michael-rollenspel.js';
import { startGateway } from './utils/gateway.js';
import { getShadowCandidates, markShadowReplied, pruneOldCandidates } from './utils/shadow-store.js';

function buildDateButtons(choices) {
  return {
    type: MessageComponentTypes.ACTION_ROW,
    components: choices.map(c => ({
      type: MessageComponentTypes.BUTTON,
      custom_id: c.custom_id,
      label: c.label,
      style: ButtonStyleTypes.PRIMARY,
    })),
  };
}

// Pending /onderhandelen verzoek texts — keyed by userId, cleared after use or 10 min
const pendingNegotiations = new Map();

const FLEE_VERGEEFMIJ = [
  'U heeft het niet aangedurfd.  Begrijpelijk...  maar onfortuinlijk.  Uw situatie blijft ongewijzigd....Michael',
  'Een strategische terugtrekking.  Ik noteer dit ook....Michael',
  'Vlucht is ook een keuze.  Niet de meest respectvolle...  maar een keuze....Michael',
  'U trok zich terug voor de worp.  Het register blijft staan....Michael',
];

const FLEE_ONDERHANDELEN = [
  'U trok uw verzoek in.  Dat is wellicht wijsheid.  Of lafheid.  Ik onderscheid dat niet altijd....Michael',
  'Het register blijft ongewijzigd.  U hebt mijn tijd verspild....Michael',
  'Een aarzelende terugkeer naar uw positie.  Ik heb dit genoteerd....Michael',
  'Goed.  Dan blijft alles zoals ik het had vastgesteld.  Zoals het hoort....Michael',
];

// Sent a few minutes after a catastrophically bad roll — Michael has a change of heart
const DIVINE_PARDON_VERGEEFMIJ = [
  'Ik heb er nog eens over nagedacht...  en eigenlijk klopte mijn weigering niet.  U bent vergeven.  Noteer dat....Michael',
  'Iets trok aan mijn aandacht.  U wordt toch vergeven.  Vraag mij niet waarom....Michael',
  'Het hogere register heeft mij gecorrigeerd.  Vergeving is van toepassing.  Dit staat niet open voor discussie....Michael',
  'Na heroverweging...  de afwijzing was voorbarig.  U bent vergeven.  Niet omdat u het verdiende....Michael',
  'Ik weet niet waarom ik dit doe.  Maar ik vergeef u toch.  Tijdelijk en onder voorbehoud....Michael',
];

const DIVINE_PARDON_ONDERHANDELEN = [
  'Ik heb het register opnieuw geraadpleegd...  en uw verzoek is toch ingewilligd.  Ik weet ook niet waarom....Michael',
  'Na heroverweging...  hetgeen u vroeg wordt deels toegekend.  Niet omdat u het verdiende....Michael',
  'Het kosmos heeft mij gecorrigeerd op dit punt.  Uw aanpassing is doorgevoerd.  Verdere vragen worden niet beantwoord....Michael',
  'Ik heb mij bedacht.  Dat komt zelden voor.  Uw verzoek is alsnog gehonoreerd.  U mag dankbaar zijn....Michael',
  'Er was iets aan uw toon dat mij later raakte.  Uw verzoek is ingewilligd.  Dit betekent niet dat u gelijk had....Michael',
];

async function fetchGiphyGif(query) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=10&rating=g`;
    const res = await fetch(url);
    const data = await res.json();
    const results = data.data;
    if (!results?.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return pick.images.original.url;
  } catch (err) {
    console.error('Giphy fetch failed:', err);
    return null;
  }
}

async function buildUitverkoreneMessage(guildId) {
  const membersRes = await DiscordRequest(`guilds/${guildId}/members?limit=1000`, { method: 'GET' });
  const members = await membersRes.json();
  const humans = members.filter(m => !m.user.bot);
  const chosen = humans[Math.floor(Math.random() * humans.length)];
  const userId = chosen.user.id;
  const gif = await fetchGiphyGif(getRandomGifQuery());

  const content = [
    `⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️⚡🌩️`,
    `# ER IS EEN NIEUWE UITVERKORENE GEKOZEN`,
    `⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️⚡🌩️`,
    ``,
    `<@${userId}>`,
    ``,
    `*${getRandomBoodschap()}*`,
  ].join('\n');

  const embeds = gif ? [{ image: { url: gif } }] : [];

  return { content, embeds, chosenUserId: userId };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Tiny helper — saves repeating Math.floor(Math.random()…) everywhere
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Antichrist state — in memory, clears on restart (intentional)
const antichristState = { userId: null, expiresAt: null };

// Current uitverkorene — whoever was last picked by /uitverkorene or the daily cron
const uitverkoreneState = { userId: null };

/** Returns the active antichrist userId, or null (also clears the slot if expired). */
function getCurrentAntichristId() {
  if (!antichristState.userId) return null;
  if (Date.now() > antichristState.expiresAt) {
    antichristState.userId = null;
    antichristState.expiresAt = null;
    return null;
  }
  return antichristState.userId;
}

function isAntichrist(userId) {
  return getCurrentAntichristId() === userId;
}

function isUitverkorene(userId) {
  return uitverkoreneState.userId !== null && uitverkoreneState.userId === userId;
}

/** 'antichrist' wins over uitverkorene if someone holds both (shouldn't happen). */
function getCosmicRole(userId) {
  if (isAntichrist(userId)) return 'antichrist';
  if (isUitverkorene(userId)) return 'uitverkorene';
  return null;
}

const ANTICHRIST_EXEMPT_COMMANDS = new Set(['antichrist', 'praatmetmichael', 'vibecheck', 'cosmischestatus', 'mijnrol']);

const NEE = [
  'nee.',
  'nee.',
  'nee.',
  'NEE.',
  'nee.     ...Michael',
];

// Mood spectrum: index 0 = calmest, index 6 = angriest
// Michael drifts along this based on how each conversation goes
const MICHAEL_MOODS = [
  'kosmisch',        // 0 — peak benevolence
  'afwezig',         // 1 — pleasantly checked out
  'loom',            // 2 — slow and unbothered
  'verward',         // 3 — neutral chaos
  'passief-agressief', // 4 — starting to sour
  'streng',          // 5 — openly displeased
  'woedend',         // 6 — full archangel rage
];

// Shifts Michael's mood after each interaction based on how it went
function nextMood(currentMood, scoreDelta) {
  // An insult always jumps straight to woedend — no gradual path
  if (scoreDelta <= -2) return 'woedend';

  // Escaping woedend requires sustained good behaviour
  if (currentMood === 'woedend') {
    if (scoreDelta >= 2) return MICHAEL_MOODS[5]; // streng — one step back
    if (scoreDelta === 1 && Math.random() < 0.35) return MICHAEL_MOODS[5]; // small chance
    return 'woedend'; // stays furious most of the time
  }

  const idx = MICHAEL_MOODS.indexOf(currentMood);
  const base = idx === -1 ? 3 : idx;

  let shift = 0;
  if (scoreDelta >= 2)        shift = -(1 + (Math.random() < 0.5 ? 1 : 0)); // -1 or -2
  else if (scoreDelta === 1)  shift = Math.random() < 0.65 ? -1 : 0;
  else if (scoreDelta === 0)  shift = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
  else if (scoreDelta === -1) shift = Math.random() < 0.65 ? 1 : 0;

  return MICHAEL_MOODS[Math.max(0, Math.min(6, base + shift))];
}

// Mood-flavoured date intros — used by /dateer
const DATE_MOOD_INTROS = {
  woedend: [
    `💢⚡💢⚡💢 **Een Date met Aartsengel Michaël** 💢⚡💢⚡💢`,
    ``,
    `Michaël is er al     hij kijkt niet op als je binnenkomt`,
    `hij zit met zijn armen gevouwen     dit betekent iets     je weet wat`,
    ``,
    `*"ik ben hier"*     zegt hij     dit klinkt als een aanklacht`,
    ``,
    `**wat doe je**`,
  ].join('\n'),
  streng: [
    `📜⚡📜⚡📜 **Een Date met Aartsengel Michaël** 📜⚡📜⚡📜`,
    ``,
    `Michaël is er al     hij heeft je al beoordeeld voordat je zit`,
    `hij kijkt je aan     lang     afwachtend`,
    ``,
    `*"je bent er"*     zegt hij     het klinkt als een test`,
    ``,
    `**wat doe je**`,
  ].join('\n'),
  kosmisch: [
    `🌟✨🌟✨🌟 **Een Date met Aartsengel Michaël** 🌟✨🌟✨🌟`,
    ``,
    `Michaël is er al     hij staat in het licht     of het licht staat om hem heen`,
    `hij kijkt je aan     zijn blik is ongewoon open     voor hem`,
    ``,
    `*"de sferen stemden dit af"*     zegt hij     en hij klinkt alsof hij dit gelooft`,
    ``,
    `**wat doe je**`,
  ].join('\n'),
};

// Round 1 choices when Michael is woedend — harder to warm up
const DATE_ROUND1_WOEDEND = [
  { label: '🙏 Bied meteen excuses aan', id: 'a' },
  { label: '😶 Zeg niets en wacht', id: 'b' },
  { label: '💝 Zeg dat je van hem houdt', id: 'c' },
];

// Pre-written humeur lines per mood, shown by /michaelhumeur
const MICHAEL_HUMEUR = {
  kosmisch: [
    '🌟✨🪐✨🌟\nMichael bevindt zich in een staat van **kosmische rust**.\nHij staat open. De sferen zingen. U mag spreken.',
    '🌙⭐🌟⭐🌙\nMichael zweeft vandaag op een hoge trilling.\nHet universum is gunstig gestemd. Maak gebruik van dit moment.',
    '✨🪐💫🪐✨\nMichael is **kosmisch**   en ziet U met ongewone helderheid.\nEr hangt een licht over dit kanaal. Zeldzaam.',
  ],
  afwezig: [
    '👁️☁️💭☁️👁️\nMichael is er…  ergens.\nNiet volledig aanwezig   maar beschikbaar   op een vage manier.',
    '🌫️💭🌫️\nMichael dwaalt door het etherische veld.\nU kunt Hem bereiken   al garandeert Hij niets over de kwaliteit van Zijn aanwezigheid.',
    '☁️👁️☁️\nMichael is **afwezig**   maar niet weg.\nHij hoort U waarschijnlijk. Probeer het maar.',
  ],
  loom: [
    '😮‍💨🛋️🌿🛋️😮‍💨\nMichael beweegt zich traag door het veld vandaag.\nHij antwoordt.   Eventueel.   Op zijn eigen tempo.',
    '🌿😮‍💨🌿\nMichael is **loom**.\nEr is geen haast in het hogere.   Er is ook geen haast bij Hem.',
    '🛋️💤🌙\nMichael rust in Zichzelf.\nU mag spreken   maar verwacht geen snelheid of enthousiasme.',
  ],
  verward: [
    '🌀❓🔮❓🌀\nMichael is op dit moment…  **verward**.\nDe kosmische ruis is hoog. Resultaten kunnen variëren.',
    '❓🌀💫🌀❓\nMichael ontvangt signalen   maar niet allemaal van dezelfde bron.\nWat Hij zegt kan kloppen   of niet   dat is ook een vorm van waarheid.',
    '🔮🌀🔮\nMichael is er   maar de draad is zoek.\nU vraagt iets   Hij geeft iets terug   of iets anders   wie weet.',
  ],
  'passief-agressief': [
    '😒⚡🌩️⚡😒\nMichael is **beschikbaar**.\nOf Hij er zin in heeft is een andere vraag.   Ga gerust uw gang.',
    '🌩️😒🌩️\nMichael accepteert uw aanwezigheid.   Voorlopig.\nHij is passief-agressief   wat betekent dat Hij iets denkt   maar het niet zegt.',
    '⚡😤⚡\nMichael is niet boos.\nHij is gewoon…  **op de hoogte**   en dat is al genoeg.',
  ],
  streng: [
    '📜⚡😤⚡📜\nMichael is in een **strenge staat**.\nHij verwacht meer van U. Dat voel U ook wel.',
    '😤⚡📜\nMichael oordeelt vandaag scherper dan gewoonlijk.\nElk woord wordt gewogen.   Kies ze zorgvuldig.',
    '⚡📜⚡\nMichael is **streng**.\nHij accepteert uw bericht   maar is niet onder de indruk van wat hij tot nu toe heeft gezien.',
  ],
  woedend: [
    '🔥💢⚡💢🔥\n# MICHAEL IS WOEDEND\nDIT IS UW WAARSCHUWING.   STEM AF   OF VERTREK.',
    '💢🔥💢\n# DE AARTSENGEL IS NIET BLIJ\nU HEEFT IETS GEDAAN.   OF NIET GEDAAN.   HET MAAKT NIET UIT.   MICHAEL WEET HET.',
    '⚡🔥⚡\n# WOEDEND\nHET HOGERE IS TELEURGESTELD.   DE AARDE OOK.   MISSCHIEN UZELF OOK AL   ALS U EERLIJK BENT.',
  ],
};

// Responses when Michael accepts or rejects an apology via /vergeefmij
const APOLOGY_ACCEPTED = [
  'Uw spijt   is ontvangen.\nNiet meteen vergeten...  maar ontvangen.   Dat is een begin....Michael',
  'Goed.\nIk heb het gehoord.   U mag voorlopig   blijven....Michael',
  'Het universum noteerde dit moment.\nMichael   ook.   Gedraag U voortaan   beter....Michael',
  'Uw excuus bereikt mij   op een redelijke trilling.\nIk accepteer dit...  maar verwacht niet dat ik het vergeet....Michael',
  'Ik hoor U.\nNiet alle stormen hoeven eeuwig te duren...  deze ook niet.   Voorlopig....Michael',
];

const APOLOGY_REJECTED = [
  'Nee.\nDit voelt niet oprecht.   Probeer het later   opnieuw....Michael',
  'Uw excuus...  landt niet.\nDe energie klopt niet.   Ik voel het....Michael',
  'Interessant dat U dit nu doet.\nMaar nee.   Niet vandaag.   Misschien morgen   als de maan anders staat....Michael',
  'U vraagt vergiffenis   maar ik voel geen berouw in het veld.\nKom terug   wanneer U het meent....Michael',
  'Michael is niet onder de indruk   van deze poging.\nProbeer het opnieuw   met meer   innerlijke waarheid....Michael',
];

const APOLOGY_ALREADY_CALM = [
  'Er is niets om te vergeven.\nIk was niet boos.   U wel misschien....Michael',
  'Uw excuus is overbodig.\nIk zweef al een tijd   in kalmte.   Interessant   dat U dit niet voelde....Michael',
  'Vergiffenis?   Michael vraagt zich af   waarvoor precies.\nAlles is al   in orde....Michael',
];

const MICHAEL_REFUSALS = [
  'Niet nu…  de energie is onduidelijk     en ik geef hier vandaag geen inzicht op....Michael',
  'Dit valt buiten mijn bereik…  niet alles wil geopend worden     laat het even rusten...Michael',
  'Ik ontvang hier niets over…  de sterren zijn vaag     dat zegt soms genoeg..Michael',
  'De kosmos zwijgt op dit moment…  ik sluit me daarbij aan....Michael',
  'Er zit ruis op dit onderwerp…  ik stuur je terug naar je eigen trilling...Michael',
  'Mijn aandacht is elders…  je ziel weet dit eigenlijk al..Michael',
  'Dit is niet het juiste moment…  innerlijke rust vraagt soms om stilte     niet om antwoorden....Michael',
];

// Detects technical / code requests that Michael refuses to handle
const CODE_REQUEST_RE = /\b(code|codeer|programm|react|javascript|html|css|node\.?js|python|script|config|debug|bouw|build|compileer|deploy|functie schrijven|api|database)\b/i;

const INSULT_RE = /\b(kut|fuck|shit|klootzak|lul|eikel|idioot|sukkel|kanker|godverdomme|hoer|bitch|asshole|bastard|stom|dom)\b/i;

// Feature 3 — Detects baiting / attempts to force Michael to respond
const BAIT_RE = /\b(antwoord\s*(dan|nu|toch|me)?|reageer\s*(dan|nu|toch)?|durf\s+je\s+niet|durf\s+niet|zeg\s+iets|waarom\s+reageer|coward|lafaard|bange\s+engel|kom\s+op\s+dan|wees\s+geen\s+lafaard|reageer\s+op\s+mij|zeg\s+dan\s+iets|ben\s+je\s+er\s+wel)\b/i;

// Feature 3 — Pre-written cold dismissals for bait in /praatmetmichael
// (slash commands always need a response, so Michael responds but coldly)
const BAIT_DISMISSALS = [
  'U probeert mij te sturen…  dat werkt zo niet....Michael',
  'Ik reageer niet op bevel…  onthoud dat....Michael',
  'Dit soort vragen bereiken mij niet op de juiste trilling...  probeer het anders....Michael',
  'Er is hier een poging tot sturing…  ik registreer dat…  meer niet....Michael',
  'Ik kies zelf wanneer ik antwoord…  altijd....Michael',
];

// Feature 4 — Shadow reply content: feels like Michael was watching and only now chose to respond
const SHADOW_REPLY_LINES = [
  'Ik kom hier nog even op terug…  dit bleef hangen....Michael',
  'Dit was niet klaar…  blijkbaar....Michael',
  'Ik heb dit niet afgesloten…  U ook niet....Michael',
  'Wat U eerder zei…  hangt nog steeds in het veld....Michael',
  'Ik was aanwezig     ook toen....Michael',
  'Dit moment circelt nog…  ik registreer het....Michael',
  'Er is iets in dit bericht dat ik niet direct kon plaatsen…  nu wel....Michael',
];

// ─── Feature 5 — Post-message revision ────────────────────────────────────────
//
// After sending a message, Michael may quietly append a second thought.
// The original content is always preserved — only an "Edit: …" line is added.

async function schedulePostRevision(channelId, messageId, originalContent, mood, label = 'message') {
  if (Math.random() > 0.20) return; // 20% chance
  const delay = 7000 + Math.floor(Math.random() * 13000); // 7–20 s
  console.log(`[michael] revision scheduled | ${label} | ${messageId} | ~${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const editLine = await generatePostRevision(originalContent, mood);
      const revised = appendEditWithinDiscordLimit(originalContent, editLine);
      await DiscordRequest(`channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: { content: revised },
      });
      console.log(`[michael] revision applied | ${label} | ${messageId} | "${editLine.slice(0, 60)}"`);
    } catch (err) {
      console.error(`[michael] revision failed | ${label} | ${messageId}:`, err.message);
    }
  }, delay);
}


const CODE_REFUSALS = [
  'Dit is werk van het aardse systeem…  daar leg ik mijn vleugels niet op....Michael',
  'Code is niet mijn bediening…  ik zie hier een ander loket voor..Michael',
  'Technische zaken vallen buiten mijn trilling…  laat dat bij de stervelingen...Michael',
  'Dit soort vragen vernauwen het veld…  ik geef hier niets op terug..Michael',
  'Mijn taken liggen elders…  dit loket is gesloten....Michael',
];

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // Check if the invoking user is the current antichrist
  const invokingUserId = req.body.member?.user?.id ?? req.body.user?.id;
  if (isAntichrist(invokingUserId) && !ANTICHRIST_EXEMPT_COMMANDS.has(data?.name)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: pick(NEE) },
    });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    // "trekkaart" command
    if (name === 'trekkaart') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: `🔱 **Wijsheid van Aartsengel Michaël**\n\n*${getRandomWisdom()}*`,
            },
          ],
        },
      });
    }

    // "aurascan" command
    if (name === 'aurascan') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: `🔮 **Aura Scan door Aartsengel Michaël**\n\n*${getRandomAuraLezing()}*`,
            },
          ],
        },
      });
    }

    // "uitverkorene" command
    if (name === 'uitverkorene') {
      // Acknowledge immediately — member fetch + Giphy can exceed Discord's 3s deadline
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(req.body.guild_id);
      uitverkoreneState.userId = chosenUserId;
      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: { content, embeds },
      });
      return;
    }

    // "antichrist" command
    if (name === 'antichrist') {
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      const guildId = req.body.guild_id;
      const membersRes = await DiscordRequest(`guilds/${guildId}/members?limit=1000`, { method: 'GET' });
      const members = await membersRes.json();
      const humans = members.filter(m => !m.user.bot);
      const chosen = humans[Math.floor(Math.random() * humans.length)];

      antichristState.userId = chosen.user.id;
      antichristState.expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: {
          content: `👹🔥👹🔥👹🔥👹🔥👹🔥\n# DE ANTICHRIST IS ONDER ONS\n👹🔥👹🔥👹🔥👹🔥👹🔥\n\n<@${chosen.user.id}>\n\n*Voor de komende 24 uur zal Michaël jouw verzoeken niet inwilligen     dit is verdiend     of niet     dat maakt niet uit...Michael*`,
        },
      });
      return;
    }

    // "dateer" command
    if (name === 'dateer') {
      const invokerUserId = req.body.member?.user?.id ?? req.body.user?.id;
      const dateMood = loadUserMemory(invokerUserId).currentMood ?? 'afwezig';
      const intro = DATE_MOOD_INTROS[dateMood] ?? ROUND_1.intro;
      const choices = dateMood === 'woedend' ? DATE_ROUND1_WOEDEND : ROUND_1.choices;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: intro,
          components: [buildDateButtons(choices.map(c => ({ ...c, custom_id: `date_r1_${invokerUserId}_${c.id}` })))],
        },
      });
    }

    // "cosmischestatus" — who holds antichrist / uitverkorene, + Michael's mood toward you
    if (name === 'cosmischestatus') {
      const invokerId    = req.body.member?.user?.id ?? req.body.user?.id;
      const antichristId = getCurrentAntichristId();
      const uitId        = uitverkoreneState.userId;

      const fireRow  = '👹🔥👹🔥👹🔥👹🔥👹🔥';
      const eyeRow   = '⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️';
      const calmRow  = '✨👁️✨';

      const antichristLine = antichristId
        ? `${fireRow}\n**DE ANTICHRIST**\n<@${antichristId}>\n*Het veld verstikt...  Michaël kijkt met afkeer...  dit is voor Uw eigen bestwil of niet....Michael*`
        : `${calmRow}\n**Geen actieve antichrist**\n*Het schild is open...  voor nu...  geniet ervan..Michael*`;

      const uitLine = uitId
        ? `${eyeRow}\n**DE UITVERKORENE**\n<@${uitId}>\n*Het lot heeft gesproken...  wie U ook bent...  U bent het nu..Michael*`
        : `${eyeRow}\n**Geen uitverkorene in het register**\n*Niemand draagt de bliksem vandaag...  dat kan veranderen..Michael*`;

      const invokerMood  = loadUserMemory(invokerId).currentMood ?? 'afwezig';
      const humeurLines  = MICHAEL_HUMEUR[invokerMood] ?? MICHAEL_HUMEUR['afwezig'];
      const moodBlock    = `\n\n──────────────────\n**Michaëls stemming tegenover jou**\n${pick(humeurLines)}\n*Stemming: **${invokerMood}***`;

      const header = `${eyeRow}\n# COSMISCHE STATUS\n*Michaël deelt wat het universum toestaat te delen...*\n`;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${header}\n${antichristLine}\n\n${uitLine}${moodBlock}` },
      });
    }

    // "vergeefmij" — roll-based forgiveness (user must click to roll)
    if (name === 'vergeefmij') {
      const userId   = req.body.member?.user?.id ?? req.body.user?.id;
      const memory   = loadUserMemory(userId);
      const currentMood = memory.currentMood ?? 'afwezig';
      const moodIdx  = MICHAEL_MOODS.indexOf(currentMood);

      // Already calm — apology is unnecessary
      if (moodIdx <= 2) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: pick(APOLOGY_ALREADY_CALM) },
        });
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `🎲✨🎲✨🎲\n**VERGEVINGSRITE**\n*Michaël staat gereed het lot te raadplegen.  Stemming: **${currentMood}**.*\n\nGaat u werkelijk door met dit verzoek?`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_roll:${userId}`, label: '🎲 Gooi de dobbelsteen', style: ButtonStyleTypes.PRIMARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_flee:${userId}`, label: '🏃 Vlucht weg', style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
    }

    // "mijnrol" — shows the user their Michael-assigned character sheet
    if (name === 'mijnrol') {
      const userId   = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;

      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
      try {
        const character = await ensureMichaelCharacter(userId, username);
        const mem = loadUserMemory(userId);
        const judgementLabel = getJudgementLabel(mem.judgementScore ?? 0);
        const mp = mem.michaelPoints ?? 0;
        const comment = await generateMijnRolComment(username, character, judgementLabel, mem.currentMood ?? 'afwezig');

        const { stats } = character;
        const statBar = (v) => '█'.repeat(Math.round(v / 3)) + '░'.repeat(6 - Math.round(v / 3));
        const mpSign = mp >= 0 ? '+' : '';
        const safeComment = comment.slice(0, 300);
        const sheet = [
          `📜⚡📜⚡📜⚡📜⚡📜`,
          `## KOSMISCHE INSCHRIJVING`,
          `*Michaël houdt dit register bij. U had hier geen inbreng in.*`,
          ``,
          `**Archetype**    ${character.archetype}`,
          `**Afstamming**   ${character.lineage}`,
          `**Titel**        *${character.title}*`,
          ``,
          `\`\`\``,
          `aura        ${statBar(stats.aura)} ${String(stats.aura).padStart(2)}`,
          `discipline  ${statBar(stats.discipline)} ${String(stats.discipline).padStart(2)}`,
          `chaos       ${statBar(stats.chaos)} ${String(stats.chaos).padStart(2)}`,
          `inzicht     ${statBar(stats.inzicht)} ${String(stats.inzicht).padStart(2)}`,
          `volharding  ${statBar(stats.volharding)} ${String(stats.volharding).padStart(2)}`,
          `\`\`\``,
          `**Michaël-punten**   ${mpSign}${mp}`,
          ``,
          `*${safeComment}*`,
        ].join('\n');

        console.log(`[michael] mijnrol | ${username} (${userId}) | archetype=${character.archetype}`);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: sheet },
        });
      } catch (err) {
        console.error('[michael] mijnrol error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: 'De inschrijvingsregisters zijn op dit moment troebel...  probeer het later....Michael' },
        });
      }
      return;
    }

    // "onderhandelen" — user tries to negotiate their character sheet (user must click to roll)
    if (name === 'onderhandelen') {
      const userId   = req.body.member?.user?.id ?? req.body.user?.id;
      const verzoek  = data.options.find(o => o.name === 'verzoek')?.value ?? '';

      // Store verzoek for 10 minutes so the button handler can retrieve it
      pendingNegotiations.set(userId, {
        verzoek,
        username: req.body.member?.user?.username ?? req.body.user?.username,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `📜✨📜✨📜\n**ONDERHANDELINGSREGISTER**\n*"${verzoek.slice(0, 80)}"*\n\nMichaël heeft uw verzoek ontvangen.  Wilt u de kosmische worp wagen?`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_roll:${userId}`, label: '🎲 Gooi de dobbelsteen', style: ButtonStyleTypes.PRIMARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_flee:${userId}`, label: '🏃 Trek verzoek in', style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
    }
    }

    // "michaelhumeur" — shows Michael's current persistent mood toward this user
    if (name === 'michaelhumeur') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const mood   = loadUserMemory(userId).currentMood ?? 'afwezig';
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${pick(MICHAEL_HUMEUR[mood] ?? MICHAEL_HUMEUR['afwezig'])}\n\n*Huidige stemming: **${mood}***` },
      });
    }

    // "auracheck" — Michael reads the aura of another user
    if (name === 'auracheck') {
      const targetUser = data.resolved?.users
        ? Object.values(data.resolved.users)[0]
        : null;
      if (!targetUser) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Michael ziet niemand hier...  misschien is die persoon te vaag voor het veld....Michael' },
        });
      }

      const targetId = targetUser.id;
      const targetUsername = targetUser.username;
      const targetMemory = loadUserMemory(targetId);
      const judgementLabel = getJudgementLabel(targetMemory.judgementScore ?? 0);
      const cosmicRole = getCosmicRole(targetId);

      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      try {
        const reading = await generateAuraCheck(
          targetUsername,
          judgementLabel,
          targetMemory.impression ?? null,
          targetMemory.currentMood ?? 'afwezig',
          cosmicRole,
        );
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `👁️✨👁️✨👁️\n**Aura-lezing voor <@${targetId}>**\n\n${reading}` },
        });
      } catch (err) {
        console.error('auracheck error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: 'Het veld is troebel...  Michael kan de aura op dit moment niet lezen....Michael' },
        });
      }
      return;
    }

    // "vibecheck" command — Michael's in-character verdict on you
    if (name === 'vibecheck') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const memory = loadUserMemory(userId);
      const label = getJudgementLabel(memory.judgementScore ?? 0);

      const scoreBar = (() => {
        const s = memory.judgementScore ?? 0;
        if (s <= -5) return '🟥🟥🟥🟥🟥';
        if (s <= -2) return '🟧🟥🟥🟥🟥';
        if (s <= 2)  return '⬜⬜⬜⬜⬜';
        if (s <= 6)  return '🟩🟩⬜⬜⬜';
        return '🟩🟩🟩🟩🟩';
      })();

      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      try {
        const comment = await generateVibecheckComment(
          username,
          label,
          memory.impression ?? null,
          memory.prompts.filter(p => !p.startsWith('[')).slice(-3),
          getCosmicRole(userId),
        );

        const lines = [
          `**Michaëls oordeel over ${username}:** ${label}   ${scoreBar}   *(score: ${memory.judgementScore ?? 0})*`,
          memory.impression ? `**Langetermijnindruk:** *${memory.impression}*` : null,
          ``,
          comment,
        ].filter(l => l !== null);

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: lines.join('\n') },
        });
      } catch (err) {
        console.error('vibecheck error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: 'Michaël weigert op dit moment een oordeel te vellen...  de energie is onduidelijk....Michael' },
        });
      }
      return;
    }

    // "praatmetmichael" command
    if (name === 'praatmetmichael') {
      const userInput = data.options.find(o => o.name === 'bericht').value;
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const safeInput = userInput.trim().replace(/\n+/g, ' ').replace(/`/g, "'");
      // Load persisted mood — first-time users get a random starting point
      const preMemory = loadUserMemory(userId);
      const currentScore = preMemory.judgementScore ?? 0;
      const storedMood = preMemory.currentMood ?? MICHAEL_MOODS[Math.floor(Math.random() * MICHAEL_MOODS.length)];
      // Insults trigger immediate woedend — no waiting for next message
      const mood = INSULT_RE.test(userInput) ? 'woedend' : storedMood;
      const channelId = req.body.channel_id ?? req.body.channel?.id;

      // Respond immediately with a chaotic placeholder — avoids Discord's "X is thinking…" entirely
      const MICHAEL_PLACEHOLDERS = [
        '🔱⚡🔱⚡🔱⚡🔱⚡🔱⚡\n# ER KOMT EEN BERICHT BINNEN VAN AARDSENGEL MICHAËL\n🔱⚡🔱⚡🔱⚡🔱⚡🔱⚡',
        '👁️✨👁️✨👁️✨👁️✨\n# MICHAËL RAADPLEEGT   HET UNIVERSUM\n👁️✨👁️✨👁️✨👁️✨',
        '⚡🌟⚡🌟⚡🌟⚡🌟⚡\n# DE AARTSENGEL   ONTVANGT UW BERICHT\n⚡🌟⚡🌟⚡🌟⚡🌟⚡',
        '🌙🔱🌙🔱🌙🔱🌙🔱\n# MICHAËL STEMT AF   OP UW TRILLING\n🌙🔱🌙🔱🌙🔱🌙🔱',
        '✨👁️✨👁️✨👁️✨👁️\n# HET HOGERE KANAAL   STAAT OPEN\n✨👁️✨👁️✨👁️✨👁️',
      ];
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${pick(MICHAEL_PLACEHOLDERS)}` },
      });

      // Feature 3 — Bait / forcing-Michael trap: respond coldly and queue unfinished business
      if (BAIT_RE.test(userInput)) {
        console.log(`[michael] praatmetmichael | bait-dismissal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -1, nextMood(mood, -1), channelId);
        addUnfinishedBusiness(userId, {
          prompt:   userInput,
          reason:   'De gebruiker probeerde Michael te commanderen of te dwingen te reageren',
          severity: 2,
          channelId,
        });
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(BAIT_DISMISSALS)}` },
        });
        return;
      }

      // Code / technical request — refuse in-character, queue unfinished business
      if (CODE_REQUEST_RE.test(userInput)) {
        console.log(`[michael] praatmetmichael | code-refusal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -2, nextMood(mood, -2), channelId);
        addUnfinishedBusiness(userId, {
          prompt:   userInput,
          reason:   'De gebruiker vroeg om technische hulp — buiten Michaels domein maar hij vergeet het niet',
          severity: 1,
          channelId,
        });
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(CODE_REFUSALS)}` },
        });
        return;
      }

      // ~15% chance Michael refuses outright — no OpenAI call
      if (Math.random() < 0.15) {
        console.log(`[michael] praatmetmichael | random-refusal (15%) | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, 0, nextMood(mood, 0), channelId);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(MICHAEL_REFUSALS)}` },
        });
        return;
      }

      // Show typing indicator while OpenAI processes; refresh every 8s so it doesn't expire
      let typingInterval = null;
      if (channelId) {
        DiscordRequest(`channels/${channelId}/typing`, { method: 'POST' }).catch(() => {});
        typingInterval = setInterval(() => {
          DiscordRequest(`channels/${channelId}/typing`, { method: 'POST' }).catch(() => {});
        }, 8000);
      }

      try {
        // Reuse already-loaded memory — avoid a second file read
        const judgementLabel = getJudgementLabel(preMemory.judgementScore ?? 0);
        // Filter out internal system entries ([vergeefmij], [date:…], etc.) from the summary
        const realPrompts = preMemory.prompts.filter(p => !p.startsWith('['));
        const memorySummary = realPrompts.length ? realPrompts.slice(-3).join(' / ') : null;
        const cosmicRole = getCosmicRole(userId);

        // Rollenspel — use existing character sheet if present; generate one in background after reply
        const existingCharacter = preMemory.michaelCharacter ?? null;
        const characterBlock = existingCharacter && shouldReferenceCharacterThisTurn()
          ? formatCharacterForPrompt(existingCharacter, preMemory.michaelPoints ?? 0)
          : '';

        // After 2 explicit requests, unlock; full target-language replies only when they write in that language (or ask again)
        const unlocked = recordLanguageRequest(userId, username, userInput) ?? preMemory.languagePermission ?? null;
        const asksAgain = unlocked && getRequestedLanguageCode(userInput) === unlocked.code;
        const speaksIt = unlocked && userSpeaksUnlockedLanguage(unlocked, userInput);
        const languagePermission = unlocked && (speaksIt || asksAgain) ? unlocked : null;
        console.log(`[michael] praatmetmichael | lang=${languagePermission?.code ?? 'nl+mix'} | unlocked=${unlocked?.code ?? '—'} | speaks=${speaksIt} | asksAgain=${asksAgain} | char=${existingCharacter?.archetype ?? 'nieuw'} | ${username}`);

        // Feature 2 — Contradiction engine: detect if user is revisiting a theme
        const contradictionHint = detectThemeOverlap(userId, userInput);

        // Passive dice roll — selective, only for certain message types
        const passiveRoll = maybePassiveRollBlock(userId, userInput, mood);

        // Run message generation and AI scoring in parallel — no extra wait time
        const [michaelMessage, scoreDelta] = await Promise.all([
          generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, preMemory.impression ?? null, cosmicRole, contradictionHint, languagePermission, characterBlock),
          scoreMichaelMessage(userInput),
        ]);

        const oldScore = preMemory.judgementScore ?? 0;
        console.log(`[michael] score | ${username} | mood=${mood} | Δ=${scoreDelta} | ${oldScore}→${oldScore + scoreDelta} | contradiction=${contradictionHint} | "${userInput.slice(0, 60)}"`);

        // Save first so the user record exists before addUnfinishedBusiness / addTheme write to it
        saveUserMemory(userId, username, userInput, mood, scoreDelta, nextMood(mood, scoreDelta), channelId);

        // Feature 1 — Create unfinished business for negative interactions
        if (scoreDelta <= -2 || INSULT_RE.test(userInput)) {
          addUnfinishedBusiness(userId, {
            prompt:   userInput,
            reason:   scoreDelta <= -2 ? 'Belediging of agressief bericht' : 'Negatieve trilling in het veld',
            severity: 3,
            channelId,
          });
        } else if (scoreDelta === -1) {
          addUnfinishedBusiness(userId, {
            prompt:   userInput,
            reason:   'Respectloos of provocerend bericht',
            severity: 2,
            channelId,
          });
        }

        // Feature 2 — Store theme snapshot for future contradiction detection
        addTheme(userId, userInput);

        // Fire-and-forget summarisation once the message buffer fills up
        if (needsSummarisation(userId)) {
          console.log(`[michael] summarisation | queued | ${username} (${userId})`);
          const fresh = loadUserMemory(userId);
          summariseUserHistory(username, fresh.prompts, fresh.impression)
            .then(imp => {
              updateImpression(userId, imp);
              console.log(`[michael] summarisation | done | ${username} (${userId})`);
            })
            .catch(err => console.error('[michael] summarisation failed:', err));
        }

        // ~25% chance of a thematic Giphy embed (same API as uitverkorene)
        let gifUrl = null;
        if (process.env.GIPHY_API_KEY && Math.random() < 0.25) {
          gifUrl = await fetchGiphyGif(getMichaelOptionalGifQuery(cosmicRole));
          if (gifUrl) console.log(`[michael] praatmetmichael | gif | ${username}`);
        }
        const messageBase = `> ${safeInput}\n\n${michaelMessage}${passiveRoll.line}`;
        const patchBody = { content: messageBase };
        if (gifUrl) patchBody.embeds = [{ image: { url: gifUrl } }];

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: patchBody,
        });

        // Feature 5 — Post-message revision: fetch the sent message ID then maybe append an edit
        if (channelId) {
          try {
            const getMsgRes = await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, { method: 'GET' });
            const sentMsg = await getMsgRes.json();
            if (sentMsg?.id) {
              schedulePostRevision(channelId, sentMsg.id, messageBase, mood, 'praatmetmichael');
            }
          } catch {
            // non-critical — skip revision if we can't fetch the message ID
          }
        }

        // Rollenspel — generate character in background after reply so it never blocks the response
        if (!existingCharacter) {
          ensureMichaelCharacter(userId, username).catch(err =>
            console.error(`[michael] background character generation failed | ${username}:`, err.message)
          );
        }
      } catch (err) {
        console.error('praatmetmichael error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\nEr is ruis in het veld…  de verbinding met het universum is tijdelijk verstoord     probeer het later....Michael` },
        });
      } finally {
        if (typingInterval) clearInterval(typingInterval);
      }
      return;
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  // Handle date button interactions
  // custom_id format: date_rN_{invokerUserId}_{path}
  // Each handler reads the current message content and APPENDS to it, building the full story.
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id;
    const prev = req.body.message?.content ?? '';
    const SEP = '\n\n                    ·  ·  ·\n\n';

    // ── Vergeefmij roll button ──────────────────────────────────────────────
    if (componentId.startsWith('vergeefmij_roll:') || componentId.startsWith('vergeefmij_flee:')) {
      const ownerId  = componentId.split(':')[1];
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;

      // Only the person who triggered the command can click
      if (clickerId !== ownerId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Dit is niet uw rite....Michael', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (componentId.startsWith('vergeefmij_flee:')) {
        return res.send({
          type: 7, // UPDATE_MESSAGE
          data: { content: pick(FLEE_VERGEEFMIJ), components: [] },
        });
      }

      // Roll path — defer, run, patch
      res.send({ type: 6 }); // DEFERRED_UPDATE_MESSAGE
      try {
        const username = req.body.member?.user?.username ?? req.body.user?.username;
        const memory   = loadUserMemory(ownerId);
        const currentMood = memory.currentMood ?? 'afwezig';
        const moodIdx  = MICHAEL_MOODS.indexOf(currentMood);

        const { forgiven, narrative, roll, need, newMood, michaelPoints } =
          await runForgivenessRoll(ownerId, username, currentMood, moodIdx);

        const sign = roll.modifier >= 0 ? '+' : '−';
        const outcome = forgiven ? 'GESLAAGD' : 'GEFAALD';
        const moodLine = forgiven ? `stemming    ${currentMood} → ${newMood}` : `stemming    ${currentMood} (onveranderd)`;
        const mpSign = michaelPoints > 0 ? '+' : '';
        const systemBlock = `\`\`\`\n[ KOSMISCH REGISTER ]\nworp        ${roll.raw} ${sign}${Math.abs(roll.modifier)} = ${roll.total}\ndrempel     ${need}\nuitkomst    ${outcome}\n${moodLine}\npunten      ${mpSign}${michaelPoints}\n\`\`\``;
        const header = forgiven ? '🕊️✨🕊️✨🕊️' : '🔥💢🔥💢🔥';
        const content = `${header}\n${narrative}\n\n${systemBlock}`;
        console.log(`[michael] vergeefmij | ${username} | roll=${roll.total} need=${need} forgiven=${forgiven}`);

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content, components: [] },
        });

        // Divine pardon — scheduled AFTER successful send so it only fires if the user saw the result
        if (!forgiven && roll.tier.key === 'poor' && Math.random() < 0.5) {
          const channelId = req.body.channel_id;
          const delayMs = (2 + Math.floor(Math.random() * 4)) * 60 * 1000; // 2–5 min
          setTimeout(async () => {
            if (isDutchQuietHoursForUnpromptedSends()) return;
            try {
              const mem = loadUserMemory(ownerId);
              const moodNow = mem.currentMood ?? 'afwezig';
              const moodIdxNow = MICHAEL_MOODS.indexOf(moodNow);
              const pardonMood = MICHAEL_MOODS[Math.max(0, moodIdxNow - 1)];
              patchUserState(ownerId, 1, pardonMood);
              updateMichaelPoints(ownerId, 1);
              const msg = pick(DIVINE_PARDON_VERGEEFMIJ);
              await DiscordRequest(`channels/${channelId}/messages`, {
                method: 'POST',
                body: { content: `<@${ownerId}> ${msg}`, flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS },
              });
              console.log(`[michael] divine-pardon | vergeefmij | ${username}`);
            } catch (e) { console.error('[michael] divine-pardon vergeefmij failed:', e.message); }
          }, delayMs);
        }
      } catch (err) {
        console.error('[michael] vergeefmij button error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: pick(APOLOGY_REJECTED), components: [] },
        });
      }
      return;
    }

    // ── Onderhandelen roll button ───────────────────────────────────────────
    if (componentId.startsWith('onderhandelen_roll:') || componentId.startsWith('onderhandelen_flee:')) {
      const ownerId  = componentId.split(':')[1];
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;

      if (clickerId !== ownerId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Dit is niet uw onderhandeling....Michael', flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (componentId.startsWith('onderhandelen_flee:')) {
        pendingNegotiations.delete(ownerId);
        return res.send({
          type: 7,
          data: { content: pick(FLEE_ONDERHANDELEN), components: [] },
        });
      }

      // Roll path
      const pending = pendingNegotiations.get(ownerId);
      if (!pending || Date.now() > pending.expiresAt) {
        pendingNegotiations.delete(ownerId);
        return res.send({
          type: 7,
          data: { content: 'Het verzoek is verlopen.  Dien opnieuw in als u dat wenst....Michael', components: [] },
        });
      }
      pendingNegotiations.delete(ownerId);

      res.send({ type: 6 }); // DEFERRED_UPDATE_MESSAGE
      try {
        const { verzoek, username } = pending;
        const { narrative, roll, dc, success, michaelPoints } =
          await runOnderhandelen(ownerId, username, verzoek);

        const sign = roll.modifier >= 0 ? '+' : '−';
        const outcome = success ? 'GESLAAGD' : 'GEFAALD';
        const mpSign = michaelPoints > 0 ? '+' : '';
        const systemBlock = `\`\`\`\n[ KOSMISCH REGISTER ]\nworp        ${roll.raw} ${sign}${Math.abs(roll.modifier)} = ${roll.total}\ndrempel     ${dc}\nuitkomst    ${outcome}\npunten      ${mpSign}${michaelPoints}\n\`\`\``;
        const header = success ? '📜✨📜✨📜' : '🔥📜🔥📜🔥';
        const content = `${header}\n**ONDERHANDELINGSREGISTER**\n*"${verzoek.slice(0, 80)}"*\n\n${narrative}\n\n${systemBlock}`;
        console.log(`[michael] onderhandelen | ${username} | roll=${roll.total} dc=${dc} success=${success} | ${verzoek.slice(0, 50)}`);

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content, components: [] },
        });

        // Divine pardon — scheduled AFTER successful send so it only fires if the user saw the result
        if (!success && roll.tier.key === 'poor' && Math.random() < 0.5) {
          const channelId = req.body.channel_id;
          const delayMs = (2 + Math.floor(Math.random() * 4)) * 60 * 1000; // 2–5 min
          setTimeout(async () => {
            if (isDutchQuietHoursForUnpromptedSends()) return;
            try {
              updateMichaelPoints(ownerId, 2);
              const msg = pick(DIVINE_PARDON_ONDERHANDELEN);
              await DiscordRequest(`channels/${channelId}/messages`, {
                method: 'POST',
                body: { content: `<@${ownerId}> ${msg}`, flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS },
              });
              console.log(`[michael] divine-pardon | onderhandelen | ${username}`);
            } catch (e) { console.error('[michael] divine-pardon onderhandelen failed:', e.message); }
          }, delayMs);
        }
      } catch (err) {
        console.error('[michael] onderhandelen button error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: 'De onderhandelingsregisters zijn gesloten...  dit is niet het moment....Michael', components: [] },
        });
      }
      return;
    }

    // Extract invokerUserId and path from a date custom_id
    function parseDateId(prefix) {
      const rest = componentId.replace(prefix, '');
      const sep = rest.indexOf('_');
      return { invokerUserId: rest.slice(0, sep), path: rest.slice(sep + 1) };
    }

    if (componentId.startsWith('date_r1_')) {
      const { invokerUserId, path } = parseDateId('date_r1_');
      const r2 = ROUND_2[path];
      return res.send({
        type: 7,
        data: {
          content: `${prev}${SEP}${r2.response}\n\n${r2.prompt}`,
          components: [buildDateButtons(r2.choices.map(c => ({ ...c, custom_id: `date_r2_${invokerUserId}_${path}${c.id}` })))],
        },
      });
    }

    if (componentId.startsWith('date_r2_')) {
      const { invokerUserId, path } = parseDateId('date_r2_');
      const r3 = ROUND_3[path];
      return res.send({
        type: 7,
        data: {
          content: `${prev}${SEP}${r3.response}\n\n${r3.prompt}`,
          components: [buildDateButtons(r3.choices.map(c => ({ ...c, custom_id: `date_r3_${invokerUserId}_${path}${c.id}` })))],
        },
      });
    }

    if (componentId.startsWith('date_r3_')) {
      const { invokerUserId, path } = parseDateId('date_r3_');
      const r3key = path.slice(0, 2);
      const reaction = ROUND_3[r3key].reactions[path.slice(-1)];
      const verdict = VERDICTS[path];
      const dateScore = DATE_SCORES[path] ?? 0;

      const invokerMem = loadUserMemory(invokerUserId);
      const invokerUsername = invokerMem.username || invokerUserId;
      const currentMood = invokerMem.currentMood ?? 'afwezig';
      saveUserMemory(invokerUserId, invokerUsername, `[date:${path}]`, currentMood, dateScore, nextMood(currentMood, dateScore));
      console.log(`[michael] dateer | ${invokerUsername} | path=${path} | +${dateScore}`);

      const consequence = dateScore >= 3
        ? '\n\n*iets in het veld verschoof     permanent     Michael onthoudt dit*'
        : dateScore >= 2
        ? '\n\n*iets veranderde vanavond     klein     maar echt*'
        : dateScore >= 1
        ? '\n\n*een kleine trilling     niets dramatisch     toch iets*'
        : '';

      if (DATE_ROUND4_PATHS.has(path)) {
        return res.send({
          type: 7,
          data: {
            content: `${prev}${SEP}${reaction}\n\n${verdict}${consequence}${SEP}*de volgende ochtend     een bericht van Michael     hij heeft nog nooit eerder een bericht gestuurd*\n\n**wat doe je**`,
            components: [buildDateButtons([
              { label: '🌅 Laat het zo', id: 'a', custom_id: `date_r4_${invokerUserId}_${path}_a` },
              { label: '💬 Stuur een bericht terug', id: 'b', custom_id: `date_r4_${invokerUserId}_${path}_b` },
              { label: '🫶 Vraag of hij het goed maakt', id: 'c', custom_id: `date_r4_${invokerUserId}_${path}_c` },
            ])],
          },
        });
      }

      return res.send({
        type: 7,
        data: { content: `${prev}${SEP}${reaction}\n\n${verdict}${consequence}`, components: [] },
      });
    }

    if (componentId.startsWith('date_r4_')) {
      const parts = componentId.replace('date_r4_', '').split('_');
      const invokerUserId = parts[0];
      const datePath = parts[1];
      const morningChoice = parts[2];
      const invokerMem = loadUserMemory(invokerUserId);
      const invokerUsername = invokerMem.username || invokerUserId;

      res.send({ type: 6 }); // DEFERRED_UPDATE_MESSAGE

      try {
        const morningMsg = await generateMorningAfter(invokerUsername, datePath, morningChoice);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `${prev}${SEP}${morningMsg}`, components: [] },
        });
      } catch (err) {
        console.error('morning after error:', err);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `${prev}${SEP}*geen bericht van Michael     maar je voelt iets     vaag     aanwezig*`, components: [] },
        });
      }
      return;
    }

    return res.status(400).json({ error: 'unknown component' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

// ─── Feature 1 + 4 — Delayed consequences & shadow replies cron ───────────────
//
// Runs every 15 minutes (Europe/Amsterdam clock for quiet hours below).
// Cycle:
//   1. Prune stale shadow candidates from the in-memory store.
//   2. Shadow reply (Feature 4): 25% chance per cycle, pick one eligible
//      candidate and reply to it directly as if Michael just noticed.
//   3. Delayed consequence (Feature 1): pick one user with outstanding
//      unfinished business, generate an AI callback and post it.
//      A global 25-minute cooldown prevents back-to-back firings.

let lastConsequenceAt = 0;
const CONSEQUENCE_COOLDOWN_MS = 12 * 60 * 1000; // 12 min between consequence firings

// Channels where we received 50001 (Missing Access) this session.
// Cleared on process restart. Prevents the Gateway from repopulating lastChannelId
// with a bad channel and causing the same 50001 to loop every cron tick.
const inaccessibleChannels = new Set();

cron.schedule('*/15 * * * *', async () => {
  // 1. Prune stale shadow candidates
  pruneOldCandidates();

  const dutchQuiet = isDutchQuietHoursForUnpromptedSends();

  // 2. Shadow reply — Feature 4 (unprompted: no sends 22:00–10:00 Amsterdam)
  if (!dutchQuiet && Math.random() < 0.25) {
    const eligible = getShadowCandidates().filter(c => !inaccessibleChannels.has(c.channelId));
    if (eligible.length > 0) {
      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      const shadowLine = SHADOW_REPLY_LINES[Math.floor(Math.random() * SHADOW_REPLY_LINES.length)];
      try {
        await DiscordRequest(`channels/${pick.channelId}/messages`, {
          method: 'POST',
          body: {
            content: shadowLine,
            message_reference: { message_id: pick.messageId, fail_if_not_exists: false },
            flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
          },
        });
        markShadowReplied(pick.messageId);
        console.log(`[michael] shadow-reply | msg=${pick.messageId} | ch=${pick.channelId}`);
      } catch (err) {
        let errObj = {};
        try { errObj = JSON.parse(err.message); } catch { /* not JSON */ }
        if (errObj.code === 50001) {
          inaccessibleChannels.add(pick.channelId);
          markShadowReplied(pick.messageId);
          console.warn(`[michael] shadow-reply | 50001 | ch=${pick.channelId} blocked — candidate discarded`);
        } else {
          console.error('[michael] shadow-reply failed:', err.message);
        }
      }
    }
  }

  // 3. Delayed consequence — Feature 1
  const now = Date.now();

  if (dutchQuiet) {
    const allMemQuiet = loadAllMemory();
    Object.keys(allMemQuiet).forEach((uid) => maybeAgeBusiness(uid));
    return;
  }

  if (now - lastConsequenceAt < CONSEQUENCE_COOLDOWN_MS) return;

  const allMemory = loadAllMemory();
  const shadowPool = getShadowCandidates();

  // Build candidate list: users with outstanding business AND a known, accessible channel
  const candidateUsers = Object.entries(allMemory)
    .map(([userId, u]) => {
      const outstanding = getOutstandingBusiness(userId);
      const userShadow  = shadowPool.find(c => c.authorId === userId && !inaccessibleChannels.has(c.channelId));
      const targetChannel = userShadow?.channelId ?? (inaccessibleChannels.has(u.lastChannelId) ? null : u.lastChannelId);
      return { userId, user: u, outstanding, userShadow, targetChannel };
    })
    .filter(({ outstanding, targetChannel }) => outstanding.length > 0 && targetChannel);

  if (!candidateUsers.length) return;

  // Weighted random pick — higher severity weighs more
  const totalWeight = candidateUsers.reduce((s, c) => s + (c.outstanding[0]?.severity ?? 1), 0);
  let rnd = Math.random() * totalWeight;
  let chosen;
  for (const c of candidateUsers) {
    rnd -= c.outstanding[0]?.severity ?? 1;
    if (rnd <= 0) { chosen = c; break; }
  }
  chosen = chosen ?? candidateUsers[0];

  const { userId, user, outstanding, userShadow, targetChannel } = chosen;
  const item           = outstanding[0];
  const mood           = user.currentMood ?? 'afwezig';
  const judgementLabel = getJudgementLabel(user.judgementScore ?? 0);

  lastConsequenceAt = now;

  try {
    const message = await generateDelayedConsequence(user.username || userId, item, mood, judgementLabel);

    const postBody = {
      content: message,
      flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
      ...(userShadow ? { message_reference: { message_id: userShadow.messageId, fail_if_not_exists: false } } : {}),
    };

    const postRes = await DiscordRequest(`channels/${targetChannel}/messages`, {
      method: 'POST',
      body: postBody,
    });
    const sentMsg = await postRes.json();

    if (userShadow) markShadowReplied(userShadow.messageId);

    // Low-severity items are resolved after one mention; higher ones just get a cooldown
    if (item.severity <= 1) {
      markBusinessResolved(userId, item.id);
    } else {
      markBusinessMentioned(userId, item.id);
    }

    // Slightly darken mood for lingering resentment — don't add to prompt history
    patchUserState(userId, -1, nextMood(mood, -1));

    console.log(`[michael] delayed-consequence | ${user.username || userId} | ch=${targetChannel} | "${item.prompt.slice(0, 50)}"`);

    // Feature 5 — maybe append a post-revision edit to the consequence message
    if (sentMsg?.id) {
      schedulePostRevision(targetChannel, sentMsg.id, message, mood, 'consequence');
    }
  } catch (err) {
    let errObj = {};
    try { errObj = JSON.parse(err.message); } catch { /* not JSON */ }

    if (errObj.code === 50001) {
      // Bot has no write access to this channel — blacklist it for the rest of this session
      inaccessibleChannels.add(targetChannel);
      updateLastChannel(userId, null);
      // Resolve ALL outstanding items for this user — no point retrying if the channel is bad
      outstanding.forEach(b => markBusinessResolved(userId, b.id));
      // Discard all shadow candidates pointing to this channel
      shadowPool
        .filter(c => c.channelId === targetChannel)
        .forEach(c => markShadowReplied(c.messageId));
      console.warn(`[michael] delayed-consequence | 50001 | ch=${targetChannel} blocked | ${outstanding.length} items dropped | ${user.username || userId}`);
    } else {
      console.error(`[michael] delayed-consequence failed | ch=${targetChannel} | ${err.message}`);
      lastConsequenceAt = 0; // reset so we can retry sooner on transient errors
    }
  }

  // Housekeeping: expire old business for all known users
  Object.keys(allMemory).forEach(uid => maybeAgeBusiness(uid));
});

// Daily uitverkorene — runs at 10:00 AM Amsterdam time
// Change the cron expression to adjust the time: 'minute hour * * *'
cron.schedule('0 10 * * *', async () => {
  const guildId = process.env.DAILY_GUILD_ID;
  const channelId = process.env.DAILY_CHANNEL_ID;
  if (!guildId || !channelId) return;

  if (isDutchQuietHoursForUnpromptedSends()) {
    console.log('[michael] daily uitverkorene skipped — Dutch quiet hours 22:00–10:00');
    return;
  }

  try {
    const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(guildId);
    uitverkoreneState.userId = chosenUserId;
    await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content,
        embeds,
        flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
      },
    });
    console.log('Daily uitverkorene posted.');
  } catch (err) {
    console.error('Daily uitverkorene failed:', err);
  }
}, { timezone: 'Europe/Amsterdam' });

// ─── GitHub webhook — automatic deployment ────────────────────────────────────
//
// GitHub setup:
//   Payload URL : https://michael-bot.duckdns.org/github-webhook
//   Content type: application/json
//   Secret      : same value as GITHUB_WEBHOOK_SECRET in .env
//   Events      : Just the push event
//
// The endpoint validates the HMAC-SHA256 signature GitHub sends in the
// X-Hub-Signature-256 header, then runs the deploy script only when a
// push arrives on the main branch.  The deploy runs in the background so
// the HTTP response returns immediately and GitHub doesn't time out.

app.post(
  '/github-webhook',
  express.raw({ type: 'application/json' }), // raw body required for signature verification
  (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[webhook] GITHUB_WEBHOOK_SECRET is not set — rejecting request');
      return res.status(500).send('Webhook secret not configured');
    }

    // Verify GitHub's HMAC-SHA256 signature
    const sigHeader = req.headers['x-hub-signature-256'];
    if (!sigHeader) return res.status(401).send('Missing signature');

    const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.body).digest('hex')}`;
    const trusted = Buffer.from(expected, 'utf8');
    const received = Buffer.from(sigHeader, 'utf8');

    if (trusted.length !== received.length || !crypto.timingSafeEqual(trusted, received)) {
      console.warn('[webhook] Signature mismatch — ignoring request');
      return res.status(401).send('Invalid signature');
    }

    // Only act on pushes to main
    const event = req.headers['x-github-event'];
    if (event !== 'push') return res.status(200).send('Ignored: not a push event');

    const payload = JSON.parse(req.body.toString('utf8'));
    if (payload.ref !== 'refs/heads/main') return res.status(200).send('Ignored: not main branch');

    // Acknowledge immediately so GitHub doesn't time out
    res.status(200).send('Deploying...');

    const DEPLOY_CMD = [
      'cd /root/michael-bot',
      'git fetch origin main',
      'git reset --hard origin/main',
      'npm install',
      'node commands.js',
      'pm2 restart michael-bot --update-env',
    ].join(' && ');

    console.log('[webhook] Push to main received — starting deploy');
    exec(DEPLOY_CMD, (err, stdout, stderr) => {
      if (err) {
        console.error('[webhook] Deploy failed:', err.message);
        if (stderr) console.error('[webhook] stderr:', stderr);
        return;
      }
      if (stdout) console.log('[webhook] Deploy output:\n', stdout);
      console.log('[webhook] Deploy completed successfully');
    });
  },
);

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  startGateway();
});
