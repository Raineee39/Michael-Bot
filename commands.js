import './utils/load-env.js';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';

const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const DRAWCARD_COMMAND = {
  name: 'drawcard',
  description: 'Receive a wisdom from Archangel Michael',
  name_localizations: { nl: 'trekkaart' },
  description_localizations: { nl: 'Ontvang een wijsheid van Aartsengel Michaël' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURASCAN_COMMAND = {
  name: 'aurascan',
  description: 'Receive a personal aura reading from Michael',
  description_localizations: { nl: 'Ontvang een persoonlijke aura-lezing van Michaël' },
  options: [
    {
      type: 3,
      name: 'message',
      description: 'Tell something about yourself',
      name_localizations: { nl: 'bericht' },
      description_localizations: { nl: 'Vertel iets over jezelf' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHOSENONE_COMMAND = {
  name: 'chosenone',
  description: 'Michael chooses a new chosen one in the server',
  name_localizations: { nl: 'uitverkorene' },
  description_localizations: { nl: 'Michaël kiest een nieuwe uitverkorene in de server' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const ANTICHRIST_COMMAND = {
  name: 'antichrist',
  description: 'Michael designates the antichrist. Refused for 24 hours.',
  description_localizations: { nl: 'Michaël wijst de antichrist aan. ... voor 24 uur geweigerd' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const DATEANGEL_COMMAND = {
  name: 'dateangel',
  description: 'Go on a date with Archangel Michael',
  name_localizations: { nl: 'dateer' },
  description_localizations: { nl: 'Ga op date met Aartsengel Michaël' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHAT_COMMAND = {
  name: 'chat',
  description: 'Talk to Michael and receive dubious spiritual advice',
  description_localizations: { nl: 'Praat met Michael en ontvang twijfelachtig spiritueel advies' },
  options: [
    {
      type: 3,
      name: 'message',
      description: 'What do you want to say?',
      name_localizations: { nl: 'bericht' },
      description_localizations: { nl: 'Wat wil je tegen Michael zeggen?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BABYCHAT_COMMAND = {
  name: 'babychat',
  description: 'Michael answers like a toddler; 20% chance he snaps and demotes you',
  description_localizations: { nl: 'Michael antwoordt als peuter; 20% kans dat hij woedend wordt' },
  options: [
    {
      type: 3,
      name: 'message',
      description: 'What do you say to baby Michael?',
      name_localizations: { nl: 'bericht' },
      description_localizations: { nl: 'Wat zeg je tegen baby-Michael?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VIBECHECK_COMMAND = {
  name: 'vibecheck',
  description: "What does Michael actually think of you?",
  description_localizations: { nl: 'Wat vindt Michaël eigenlijk van jou?' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const COSMICSTATUS_COMMAND = {
  name: 'cosmicstatus',
  description: 'Who holds the field right now? Antichrist and chosen one.',
  name_localizations: { nl: 'cosmischestatus' },
  description_localizations: { nl: 'Wie draagt het veld op dit moment? Antichrist en uitverkorene.' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const MICHAELMOOD_COMMAND = {
  name: 'michaelmood',
  description: "How does Michael feel toward you right now?",
  name_localizations: { nl: 'michaelhumeur' },
  description_localizations: { nl: 'Hoe voelt Michael zich tegenover jou op dit moment?' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const FORGIVEME_COMMAND = {
  name: 'forgiveme',
  description: 'Apologise to Michael and hope for his mercy.',
  name_localizations: { nl: 'vergeefmij' },
  description_localizations: { nl: 'Bied je excuses aan bij Michael en hoop op zijn genade.' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURACHECK_COMMAND = {
  name: 'auracheck',
  description: "Let Michael read another user's aura.",
  description_localizations: { nl: 'Laat Michael de aura lezen van een andere gebruiker.' },
  options: [
    {
      type: 6,
      name: 'user',
      description: 'The user whose aura Michael should read.',
      name_localizations: { nl: 'gebruiker' },
      description_localizations: { nl: 'De gebruiker wiens aura Michael moet lezen.' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const MYCHARACTER_COMMAND = {
  name: 'mycharacter',
  description: "View the role Michael has assigned you in his cosmic field campaign.",
  name_localizations: { nl: 'mijnrol' },
  description_localizations: { nl: 'Bekijk de rol die Michaël voor je heeft vastgesteld in zijn kosmische veldcampagne.' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const NEGOTIATE_COMMAND = {
  name: 'negotiate',
  description: 'Grovel before the register: pick archetype, lineage, or title, state your wish, roll.',
  name_localizations: { nl: 'onderhandelen' },
  description_localizations: {
    nl: 'Smek vóór het register: kies archetype, afstamming of titel, spreek je wens, waag de worp.',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const FEEDBACK_COMMAND = {
  name: 'feedback',
  description: "Send a bug, idea, or note to Michael's maker (forwarded privately).",
  description_localizations: { nl: 'Stuur bug, idee of opmerking naar de maker van Michael (privé doorgestuurd).' },
  options: [
    {
      type: 3,
      name: 'kind',
      description: 'Bug, feature, or something else?',
      name_localizations: { nl: 'soort' },
      description_localizations: { nl: 'Bug, feature of iets anders?' },
      required: true,
      choices: [
        { name: 'Bug', value: 'bug' },
        {
          name: 'Feature / idea',
          value: 'feature',
          name_localizations: { nl: 'Feature / idee' },
        },
        { name: 'Other', value: 'other', name_localizations: { nl: 'Anders' } },
      ],
    },
    {
      type: 3,
      name: 'message',
      description: 'Your message to the maker',
      name_localizations: { nl: 'bericht' },
      description_localizations: { nl: 'Jouw bericht aan de maker' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SETLANGUAGE_COMMAND = {
  name: 'setlanguage',
  description: 'Set the language Michael Bot uses on this server (or your personal language in DMs)',
  name_localizations: { nl: 'michaeltaal' },
  description_localizations: {
    nl: 'Set the language Michael Bot uses on this server / Stel de taal in van Michael Bot',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const LISTENTOMICHAEL_COMMAND = {
  name: 'listentomichael',
  description: 'Ask Michael for advice; he answers in a voice message',
  description_localizations: { nl: 'Vraag Michael om advies; hij antwoordt in een spraakbericht' },
  options: [
    {
      type: 3,
      name: 'advice',
      description: 'What do you want advice about?',
      name_localizations: { nl: 'advies' },
      description_localizations: { nl: 'Waar wil je advies over?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const IMAGINE_COMMAND = {
  name: 'imagine',
  description: 'Have Michael generate an image from your prompt (he adds his own judgement)',
  description_localizations: { nl: 'Laat Michael een beeld maken van jouw prompt (hij voegt zijn eigen oordeel toe)' },
  options: [
    {
      type: 3,
      name: 'image',
      description: 'What should Michael visualise?',
      name_localizations: { nl: 'beeld' },
      description_localizations: { nl: 'Wat moet Michael visualiseren?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const WITNESS_COMMAND = {
  name: 'witness',
  description: "Let Michael bear witness on your soul — or someone else's",
  name_localizations: { nl: 'getuigenis' },
  description_localizations: { nl: 'Laat Michael getuigen over jouw ziel — of die van een ander' },
  options: [
    {
      type: 6,
      name: 'user',
      description: 'Who should Michael witness against? (default: you)',
      name_localizations: { nl: 'gebruiker' },
      description_localizations: { nl: 'Over wie moet Michael getuigen? (standaard: jij)' },
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CONFESS_COMMAND = {
  name: 'confess',
  description: "Confess to the register — only you see Michael's reply",
  name_localizations: { nl: 'biecht' },
  description_localizations: { nl: 'Biecht in het register — alleen jij ziet Michaels antwoord' },
  options: [
    {
      type: 3,
      name: 'confession',
      description: 'What do you file in the register?',
      name_localizations: { nl: 'biecht' },
      description_localizations: { nl: 'Wat leg je in het register?' },
      required: true,
    },
    {
      type: 6,
      name: 'user',
      description: 'Who is this confession about? (default: yourself)',
      name_localizations: { nl: 'gebruiker' },
      description_localizations: { nl: 'Over wie is deze biecht? (standaard: over jezelf)' },
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SWITCHOFLIFE_COMMAND = {
  name: 'switchoflife',
  description: 'Turn Michael on or off in this channel or for the whole server',
  description_localizations: { nl: 'Zet Michaël aan of uit in dit kanaal of op deze server' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const HOROSCOPE_COMMAND = {
  name: 'horoscope',
  description: "Michael reads today's field — predictions drawn from the register",
  name_localizations: { nl: 'horoscoop' },
  description_localizations: { nl: 'Michael leest het veld voor vandaag — met voorspellingen uit het register' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  DRAWCARD_COMMAND,
  AURASCAN_COMMAND,
  CHOSENONE_COMMAND,
  ANTICHRIST_COMMAND,
  DATEANGEL_COMMAND,
  CHAT_COMMAND,
  BABYCHAT_COMMAND,
  VIBECHECK_COMMAND,
  COSMICSTATUS_COMMAND,
  MICHAELMOOD_COMMAND,
  FORGIVEME_COMMAND,
  AURACHECK_COMMAND,
  MYCHARACTER_COMMAND,
  NEGOTIATE_COMMAND,
  FEEDBACK_COMMAND,
  SETLANGUAGE_COMMAND,
  IMAGINE_COMMAND,
  LISTENTOMICHAEL_COMMAND,
  WITNESS_COMMAND,
  CONFESS_COMMAND,
  HOROSCOPE_COMMAND,
  SWITCHOFLIFE_COMMAND,
];

// Guild registration = instant in those servers. Global with DM-only contexts =
// chats / group DMs, without duplicating the same names inside servers.
const DM_CONTEXTS = [1, 2];
const DM_COMMANDS = ALL_COMMANDS
  .filter((cmd) => (cmd.contexts ?? []).some((c) => DM_CONTEXTS.includes(c)))
  .map((cmd) => ({ ...cmd, contexts: DM_CONTEXTS, integration_types: [0, 1] }));

const guildIds = process.env.GUILD_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

if (guildIds.length) {
  for (const guildId of guildIds) {
    await InstallGuildCommands(process.env.APP_ID, guildId, ALL_COMMANDS);
  }
}
await InstallGlobalCommands(process.env.APP_ID, guildIds.length ? DM_COMMANDS : ALL_COMMANDS);
if (guildIds.length) {
  console.log('Global DM commands registered:', DM_COMMANDS.map((c) => c.name).join(', '));
}
