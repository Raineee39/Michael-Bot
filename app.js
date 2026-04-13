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
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { getRandomWisdom } from './wisdom.js';
import { getRandomAuraLezing } from './aura.js';
import { getRandomBoodschap, getRandomGifQuery, getMichaelOptionalGifQuery } from './uitverkorene.js';
import { ROUND_1, ROUND_2, ROUND_3, VERDICTS, DATE_SCORES, DATE_ROUND4_PATHS } from './date.js';
import { generateMichaelMessage, summariseUserHistory, generateVibecheckComment, scoreMichaelMessage, generateAuraCheck, generateMorningAfter } from './utils/openai.js';
import { loadUserMemory, saveUserMemory, getJudgementLabel, needsSummarisation, updateImpression } from './utils/michael-memory.js';
import { startGateway } from './utils/gateway.js';

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

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

// Antichrist state — in memory, clears on restart (intentional)
const antichristState = { userId: null, expiresAt: null };

// Current uitverkorene — whoever was last picked by /uitverkorene or the daily cron
const uitverkoreneState = { userId: null };

function isAntichrist(userId) {
  if (!antichristState.userId) return false;
  if (Date.now() > antichristState.expiresAt) {
    antichristState.userId = null;
    antichristState.expiresAt = null;
    return false;
  }
  return antichristState.userId === userId;
}

function isUitverkorene(userId) {
  return uitverkoreneState.userId != null && uitverkoreneState.userId === userId;
}

/** 'antichrist' wins over uitverkorene if someone is both (shouldn't happen) */
function getCosmicRole(userId) {
  if (isAntichrist(userId)) return 'antichrist';
  if (isUitverkorene(userId)) return 'uitverkorene';
  return null;
}

/** Active antichrist user id, or null (cleans up expired slot) */
function getCurrentAntichristId() {
  if (!antichristState.userId) return null;
  if (Date.now() > antichristState.expiresAt) {
    antichristState.userId = null;
    antichristState.expiresAt = null;
    return null;
  }
  return antichristState.userId;
}

const ANTICHRIST_EXEMPT_COMMANDS = new Set(['antichrist', 'praatmetmichael', 'vibecheck', 'cosmischestatus']);

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
  // Interaction id, type and data
  const { id, type, data } = req.body;

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
      data: {
        content: NEE[Math.floor(Math.random() * NEE.length)],
      },
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

    // "cosmischestatus" — who holds antichrist / uitverkorene (guild only)
    if (name === 'cosmischestatus') {
      const antichristId = getCurrentAntichristId();
      const uitId = uitverkoreneState.userId;
      const fireRow = "👹🔥👹🔥👹🔥👹🔥👹🔥";
      const eyeRowStr = "⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️";
      const calmRow = "✨👁️✨";

      const antichristLine = antichristId
        ? `${fireRow}\n**DE ANTICHRIST**\n<@${antichristId}>\n*Het veld verstikt...  Michaël kijkt met afkeer...  dit is voor Uw eigen bestwil of niet....Michael*`
        : `${calmRow}\n**Geen actieve antichrist**\n*Het schild is open...  voor nu...  geniet ervan..Michael*`;

      const uitLine = uitId
        ? `${eyeRowStr}\n**DE UITVERKORENE**\n<@${uitId}>\n*Het lot heeft gesproken...  wie U ook bent...  U bent het nu..Michael*`
        : `${eyeRowStr}\n**Geen uitverkorene in het register**\n*Niemand draagt de bliksem vandaag...  dat kan veranderen..Michael*`;

      const header = `${eyeRowStr}\n# COSMISCHE STATUS\n*Michaël deelt wat het universum toestaat te delen...*\n`;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${header}\n${antichristLine}\n\n${uitLine}` },
      });
    }

    // "vergeefmij" — dedicated apology command with its own mood-shift logic
    if (name === 'vergeefmij') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const memory = loadUserMemory(userId);
      const currentMood = memory.currentMood ?? 'afwezig';
      const moodIdx = MICHAEL_MOODS.indexOf(currentMood);

      // Already calm — apology is unnecessary
      if (moodIdx <= 2) {
        const line = APOLOGY_ALREADY_CALM[Math.floor(Math.random() * APOLOGY_ALREADY_CALM.length)];
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: line },
        });
      }

      // Woedend: harder to appease (40% chance). Calmer bad moods: easier (65% chance).
      const forgivenessChance = currentMood === 'woedend' ? 0.40 : 0.65;
      const forgiven = Math.random() < forgivenessChance;

      if (forgiven) {
        // Drop mood by 2 steps — meaningful but doesn't fully reset
        const newMood = MICHAEL_MOODS[Math.max(0, moodIdx - 2)];
        saveUserMemory(userId, username, '[vergeefmij]', currentMood, 1, newMood);
        const line = APOLOGY_ACCEPTED[Math.floor(Math.random() * APOLOGY_ACCEPTED.length)];
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🕊️✨🕊️✨🕊️\n${line}\n\n*Stemming verbeterd: **${currentMood}** → **${newMood}***` },
        });
      } else {
        // Rejection — mood stays, score unchanged (trying to apologise shouldn't hurt you)
        saveUserMemory(userId, username, '[vergeefmij]', currentMood, 0, currentMood);
        const line = APOLOGY_REJECTED[Math.floor(Math.random() * APOLOGY_REJECTED.length)];
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🔥💢🔥💢🔥\n${line}\n\n*Stemming onveranderd: **${currentMood}***` },
        });
      }
    }

    // "michaelhumeur" — shows Michael's current persistent mood toward this user
    if (name === 'michaelhumeur') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const memory = loadUserMemory(userId);
      const mood = memory.currentMood ?? 'afwezig';
      const lines = MICHAEL_HUMEUR[mood] ?? MICHAEL_HUMEUR['afwezig'];
      const line = lines[Math.floor(Math.random() * lines.length)];
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${line}\n\n*Huidige stemming: **${mood}***` },
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
          memory.prompts.slice(-3),
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
      const placeholder = MICHAEL_PLACEHOLDERS[Math.floor(Math.random() * MICHAEL_PLACEHOLDERS.length)];
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${placeholder}` },
      });

      // Code / technical request — refuse in-character, penalise score
      if (CODE_REQUEST_RE.test(userInput)) {
        const refusal = CODE_REFUSALS[Math.floor(Math.random() * CODE_REFUSALS.length)];
        saveUserMemory(userId, username, userInput, mood, -2, nextMood(mood, -2));
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${refusal}` },
        });
        return;
      }

      // ~15% chance Michael refuses outright — no OpenAI call
      if (Math.random() < 0.15) {
        const refusal = MICHAEL_REFUSALS[Math.floor(Math.random() * MICHAEL_REFUSALS.length)];
        saveUserMemory(userId, username, userInput, mood, 0, nextMood(mood, 0));
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${refusal}` },
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
        const memory = loadUserMemory(userId);
        const judgementLabel = getJudgementLabel(memory.judgementScore ?? 0);
        const memorySummary = memory.prompts.length
          ? memory.prompts.slice(-3).join(' / ')
          : null;
        const cosmicRole = getCosmicRole(userId);

        // Run message generation and AI scoring in parallel — no extra wait time
        const [michaelMessage, scoreDelta] = await Promise.all([
          generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, memory.impression ?? null, cosmicRole),
          scoreMichaelMessage(userInput),
        ]);

        const newScore = (memory.judgementScore ?? 0) + scoreDelta;
        console.log(`[score] ${username} | mood: ${mood} | delta: ${scoreDelta} | score: ${memory.judgementScore ?? 0} → ${newScore} | input: "${userInput.slice(0, 60)}"`);
        saveUserMemory(userId, username, userInput, mood, scoreDelta, nextMood(mood, scoreDelta));

        // Fire-and-forget summarisation once the message buffer fills up
        if (needsSummarisation(userId)) {
          const fresh = loadUserMemory(userId);
          summariseUserHistory(username, fresh.prompts, fresh.impression)
            .then(imp => updateImpression(userId, imp))
            .catch(err => console.error('Summarisation failed:', err));
        }

        // ~25% chance of a thematic Giphy embed (same API as uitverkorene)
        let gifUrl = null;
        if (process.env.GIPHY_API_KEY && Math.random() < 0.25) {
          gifUrl = await fetchGiphyGif(getMichaelOptionalGifQuery(cosmicRole));
        }
        const patchBody = { content: `> ${safeInput}\n\n${michaelMessage}` };
        if (gifUrl) patchBody.embeds = [{ image: { url: gifUrl } }];

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: patchBody,
        });
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
      console.log(`[date] ${invokerUsername} | path: ${path} | score: +${dateScore}`);

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

// Daily uitverkorene — runs at 10:00 AM Amsterdam time
// Change the cron expression to adjust the time: 'minute hour * * *'
cron.schedule('0 10 * * *', async () => {
  const guildId = process.env.DAILY_GUILD_ID;
  const channelId = process.env.DAILY_CHANNEL_ID;
  if (!guildId || !channelId) return;

  try {
    const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(guildId);
    uitverkoreneState.userId = chosenUserId;
    await DiscordRequest(`channels/${channelId}/messages`, {
      method: 'POST',
      body: {
        content,
        embeds,
        flags: 4096, // SUPPRESS_NOTIFICATIONS = @silent
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
