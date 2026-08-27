import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands, InstallGuildCommands } from './utils.js';

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: 'challenge',
  description: 'Challenge to a match of rock paper scissors',
  options: [
    {
      type: 3,
      name: 'object',
      description: 'Pick your object',
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const TREKKAART_COMMAND = {
  name: 'trekkaart',
  description: 'Ontvang een wijsheid van Aartsengel Michaël',
  name_localizations: { 'en-US': 'drawcard', 'en-GB': 'drawcard' },
  description_localizations: { 'en-US': 'Receive a wisdom from Archangel Michael', 'en-GB': 'Receive a wisdom from Archangel Michael' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURASCAN_COMMAND = {
  name: 'aurascan',
  description: 'Ontvang een persoonlijke aura-lezing van Michaël',
  name_localizations: { 'en-US': 'aurascan', 'en-GB': 'aurascan' },
  description_localizations: { 'en-US': 'Receive a personal aura reading from Michael', 'en-GB': 'Receive a personal aura reading from Michael' },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Vertel iets over jezelf',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message' },
      description_localizations: { 'en-US': 'Tell something about yourself', 'en-GB': 'Tell something about yourself' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const UITVERKORENE_COMMAND = {
  name: 'uitverkorene',
  description: 'Michaël kiest een nieuwe uitverkorene in de server',
  name_localizations: { 'en-US': 'chosenone', 'en-GB': 'chosenone' },
  description_localizations: { 'en-US': 'Michael chooses a new chosen one in the server', 'en-GB': 'Michael chooses a new chosen one in the server' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const ANTICHRIST_COMMAND = {
  name: 'antichrist',
  description: 'Michaël wijst de antichrist aan. ... voor 24 uur geweigerd',
  name_localizations: { 'en-US': 'antichrist', 'en-GB': 'antichrist' },
  description_localizations: { 'en-US': 'Michael designates the antichrist. Refused for 24 hours.', 'en-GB': 'Michael designates the antichrist. Refused for 24 hours.' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const DATEER_COMMAND = {
  name: 'dateer',
  description: 'Ga op date met Aartsengel Michaël',
  name_localizations: { 'en-US': 'dateangel', 'en-GB': 'dateangel' },
  description_localizations: { 'en-US': 'Go on a date with Archangel Michael', 'en-GB': 'Go on a date with Archangel Michael' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const PRAATMETMICHAEL_COMMAND = {
  name: 'chat',
  description: 'Praat met Michael en ontvang twijfelachtig spiritueel advies',
  name_localizations: { 'en-US': 'chat', 'en-GB': 'chat' },
  description_localizations: { 'en-US': 'Talk to Michael and receive dubious spiritual advice', 'en-GB': 'Talk to Michael and receive dubious spiritual advice' },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Wat wil je tegen Michael zeggen?',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message' },
      description_localizations: { 'en-US': 'What do you want to say?', 'en-GB': 'What do you want to say?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BABYCHAT_COMMAND = {
  name: 'babychat',
  description: 'Michael antwoordt als peuter; 20% kans dat hij woedend wordt',
  name_localizations: { 'en-US': 'babychat', 'en-GB': 'babychat' },
  description_localizations: {
    'en-US': 'Michael answers like a toddler; 20% chance he snaps and demotes you',
    'en-GB': 'Michael answers like a toddler; 20% chance he snaps and demotes you',
  },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Wat zeg je tegen baby-Michael?',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message' },
      description_localizations: { 'en-US': 'What do you say to baby Michael?', 'en-GB': 'What do you say to baby Michael?' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VIBECHECK_COMMAND = {
  name: 'vibecheck',
  description: 'Wat vindt Michaël eigenlijk van jou?',
  name_localizations: { 'en-US': 'vibecheck', 'en-GB': 'vibecheck' },
  description_localizations: { 'en-US': "What does Michael actually think of you?", 'en-GB': "What does Michael actually think of you?" },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const COSMISCHESTATUS_COMMAND = {
  name: 'cosmischestatus',
  description: 'Wie draagt het veld op dit moment? Antichrist en uitverkorene.',
  name_localizations: { 'en-US': 'cosmicstatus', 'en-GB': 'cosmicstatus' },
  description_localizations: { 'en-US': 'Who holds the field right now? Antichrist and chosen one.', 'en-GB': 'Who holds the field right now? Antichrist and chosen one.' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const MICHAELHUMEUR_COMMAND = {
  name: 'michaelhumeur',
  description: 'Hoe voelt Michael zich tegenover jou op dit moment?',
  name_localizations: { 'en-US': 'michaelmood', 'en-GB': 'michaelmood' },
  description_localizations: { 'en-US': "How does Michael feel toward you right now?", 'en-GB': "How does Michael feel toward you right now?" },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VERGEEFMIJ_COMMAND = {
  name: 'vergeefmij',
  description: 'Bied je excuses aan bij Michael en hoop op zijn genade.',
  name_localizations: { 'en-US': 'forgiveme', 'en-GB': 'forgiveme' },
  description_localizations: { 'en-US': 'Apologise to Michael and hope for his mercy.', 'en-GB': 'Apologise to Michael and hope for his mercy.' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURACHECK_COMMAND = {
  name: 'auracheck',
  description: 'Laat Michael de aura lezen van een andere gebruiker.',
  name_localizations: { 'en-US': 'auracheck', 'en-GB': 'auracheck' },
  description_localizations: { 'en-US': "Let Michael read another user's aura.", 'en-GB': "Let Michael read another user's aura." },
  options: [
    {
      type: 6,
      name: 'gebruiker',
      description: 'De gebruiker wiens aura Michael moet lezen.',
      name_localizations: { 'en-US': 'user', 'en-GB': 'user' },
      description_localizations: { 'en-US': 'The user whose aura Michael should read.', 'en-GB': 'The user whose aura Michael should read.' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const MIJNROL_COMMAND = {
  name: 'mijnrol',
  description: 'Bekijk de rol die Michaël voor je heeft vastgesteld in zijn kosmische veldcampagne.',
  name_localizations: { 'en-US': 'mycharacter', 'en-GB': 'mycharacter' },
  description_localizations: { 'en-US': "View the role Michael has assigned you in his cosmic field campaign.", 'en-GB': "View the role Michael has assigned you in his cosmic field campaign." },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ONDERHANDELEN_COMMAND = {
  name: 'onderhandelen',
  description:
    'Smek vóór het register: kies archetype, afstamming of titel, spreek je wens, waag de worp.',
  name_localizations: { 'en-US': 'negotiate', 'en-GB': 'negotiate' },
  description_localizations: {
    'en-US':
      'Grovel before the register: pick archetype, lineage, or title, state your wish, roll.',
    'en-GB':
      'Grovel before the register: pick archetype, lineage, or title, state your wish, roll.',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const FEEDBACK_COMMAND = {
  name: 'feedback',
  description: 'Stuur bug, idee of opmerking naar de maker van Michael (privé doorgestuurd).',
  name_localizations: { 'en-US': 'feedback', 'en-GB': 'feedback' },
  description_localizations: {
    'en-US': "Send a bug, idea, or note to Michael's maker (forwarded privately).",
    'en-GB': "Send a bug, idea, or note to Michael's maker (forwarded privately).",
  },
  options: [
    {
      type: 3,
      name: 'soort',
      description: 'Bug, feature of iets anders?',
      name_localizations: { 'en-US': 'kind', 'en-GB': 'kind' },
      description_localizations: {
        'en-US': 'Bug, feature, or something else?',
        'en-GB': 'Bug, feature, or something else?',
      },
      required: true,
      choices: [
        { name: 'Bug', value: 'bug', name_localizations: { 'en-US': 'Bug', 'en-GB': 'Bug' } },
        {
          name: 'Feature / idee',
          value: 'feature',
          name_localizations: { 'en-US': 'Feature / idea', 'en-GB': 'Feature / idea' },
        },
        { name: 'Anders', value: 'other', name_localizations: { 'en-US': 'Other', 'en-GB': 'Other' } },
      ],
    },
    {
      type: 3,
      name: 'bericht',
      description: 'Jouw bericht aan de maker',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message' },
      description_localizations: {
        'en-US': 'Your message to the maker',
        'en-GB': 'Your message to the maker',
      },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Language selector...  sets the language Michael uses on this server
const MICHAELTAAL_COMMAND = {
  name: 'michaeltaal',
  description: 'Set the language Michael Bot uses on this server / Stel de taal in van Michael Bot',
  name_localizations: { 'en-US': 'setlanguage', 'en-GB': 'setlanguage' },
  description_localizations: {
    'en-US': 'Set the language Michael Bot uses on this server (or your personal language in DMs)',
    'en-GB': 'Set the language Michael Bot uses on this server (or your personal language in DMs)',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const LISTENTOMICHAEL_COMMAND = {
  name: 'listentomichael',
  description: 'Vraag Michael om advies; hij antwoordt in een spraakbericht',
  name_localizations: { 'en-US': 'listentomichael', 'en-GB': 'listentomichael' },
  description_localizations: {
    'en-US': 'Ask Michael for advice; he answers in a voice message',
    'en-GB': 'Ask Michael for advice; he answers in a voice message',
  },
  options: [
    {
      type: 3,
      name: 'advies',
      description: 'Waar wil je advies over?',
      name_localizations: { 'en-US': 'advice', 'en-GB': 'advice' },
      description_localizations: {
        'en-US': 'What do you want advice about?',
        'en-GB': 'What do you want advice about?',
      },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const IMAGINE_COMMAND = {
  name: 'imagine',
  description: 'Laat Michael een beeld maken van jouw prompt (hij voegt zijn eigen oordeel toe)',
  name_localizations: { 'en-US': 'imagine', 'en-GB': 'imagine' },
  description_localizations: {
    'en-US': 'Have Michael generate an image from your prompt (he adds his own judgement)',
    'en-GB': 'Have Michael generate an image from your prompt (he adds his own judgement)',
  },
  options: [
    {
      type: 3,
      name: 'beeld',
      description: 'Wat moet Michael visualiseren?',
      name_localizations: { 'en-US': 'image', 'en-GB': 'image' },
      description_localizations: {
        'en-US': 'What should Michael visualise?',
        'en-GB': 'What should Michael visualise?',
      },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const GETUIGENIS_COMMAND = {
  name: 'getuigenis',
  description: 'Laat Michael getuigen over jouw ziel — of die van een ander',
  name_localizations: { 'en-US': 'witness', 'en-GB': 'witness' },
  description_localizations: {
    'en-US': 'Let Michael bear witness on your soul — or someone else\'s',
    'en-GB': 'Let Michael bear witness on your soul — or someone else\'s',
  },
  options: [
    {
      type: 6,
      name: 'gebruiker',
      description: 'Over wie moet Michael getuigen? (standaard: jij)',
      name_localizations: { 'en-US': 'user', 'en-GB': 'user' },
      description_localizations: {
        'en-US': 'Who should Michael witness against? (default: you)',
        'en-GB': 'Who should Michael witness against? (default: you)',
      },
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BIECHT_COMMAND = {
  name: 'biecht',
  description: 'Biecht in het register — alleen jij ziet Michaels antwoord',
  name_localizations: { 'en-US': 'confess', 'en-GB': 'confess' },
  description_localizations: {
    'en-US': 'Confess to the register — only you see Michael\'s reply',
    'en-GB': 'Confess to the register — only you see Michael\'s reply',
  },
  options: [
    {
      type: 3,
      name: 'biecht',
      description: 'Wat leg je in het register?',
      name_localizations: { 'en-US': 'confession', 'en-GB': 'confession' },
      description_localizations: {
        'en-US': 'What do you file in the register?',
        'en-GB': 'What do you file in the register?',
      },
      required: true,
    },
    {
      type: 6,
      name: 'gebruiker',
      description: 'Over wie is deze biecht? (standaard: over jezelf)',
      name_localizations: { 'en-US': 'user', 'en-GB': 'user' },
      description_localizations: {
        'en-US': 'Who is this confession about? (default: yourself)',
        'en-GB': 'Who is this confession about? (default: yourself)',
      },
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SWITCHOFLIFE_COMMAND = {
  name: 'switchoflife',
  description: 'Zet Michaël aan of uit in dit kanaal of op deze server',
  name_localizations: { 'en-US': 'switchoflife', 'en-GB': 'switchoflife' },
  description_localizations: {
    'en-US': 'Turn Michael on or off in this channel or for the whole server',
    'en-GB': 'Turn Michael on or off in this channel or for the whole server',
  },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const HOROSCOPE_COMMAND = {
  name: 'horoscoop',
  description: 'Michael leest het veld voor vandaag — met voorspellingen uit het register',
  name_localizations: { 'en-US': 'horoscope', 'en-GB': 'horoscope' },
  description_localizations: {
    'en-US': "Michael reads today's field — predictions drawn from the register",
    'en-GB': "Michael reads today's field — predictions drawn from the register",
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

/** English alias so /horoscope works even when the client locale is Dutch. */
const HOROSCOPE_ALIAS_COMMAND = {
  name: 'horoscope',
  description: "Michael reads today's field — predictions drawn from the register",
  description_localizations: {
    'nl': 'Michael leest het veld voor vandaag — met voorspellingen uit het register',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

/** English alias so /confess works even when the client locale is Dutch. */
const CONFESS_ALIAS_COMMAND = {
  name: 'confess',
  description: 'Confess to the register — only you see Michael\'s reply',
  description_localizations: {
    'nl': 'Biecht in het register — alleen jij ziet Michaels antwoord',
  },
  options: [
    {
      type: 3,
      name: 'confession',
      description: 'What do you file in the register?',
      name_localizations: { 'nl': 'biecht' },
      description_localizations: {
        'nl': 'Wat leg je in het register?',
      },
      required: true,
    },
    {
      type: 6,
      name: 'user',
      description: 'Who is this confession about? (default: yourself)',
      name_localizations: { 'nl': 'gebruiker' },
      description_localizations: {
        'nl': 'Over wie is deze biecht? (standaard: over jezelf)',
      },
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, TREKKAART_COMMAND, AURASCAN_COMMAND, UITVERKORENE_COMMAND, ANTICHRIST_COMMAND, DATEER_COMMAND, PRAATMETMICHAEL_COMMAND, BABYCHAT_COMMAND, VIBECHECK_COMMAND, COSMISCHESTATUS_COMMAND, MICHAELHUMEUR_COMMAND, VERGEEFMIJ_COMMAND, MIJNROL_COMMAND, ONDERHANDELEN_COMMAND, FEEDBACK_COMMAND, MICHAELTAAL_COMMAND, IMAGINE_COMMAND, LISTENTOMICHAEL_COMMAND, GETUIGENIS_COMMAND, BIECHT_COMMAND, CONFESS_ALIAS_COMMAND, HOROSCOPE_COMMAND, HOROSCOPE_ALIAS_COMMAND, SWITCHOFLIFE_COMMAND];

// Register commands — guild IDs update instantly; global can take up to ~1 hour.
const guildIds = process.env.GUILD_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

for (const guildId of guildIds) {
  await InstallGuildCommands(process.env.APP_ID, guildId, ALL_COMMANDS);
}
await InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
