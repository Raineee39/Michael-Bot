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
  name_localizations: { 'en-US': 'drawcard', 'en-GB': 'drawcard', ar: 'بطاقة-حكمة' },
  description_localizations: { 'en-US': 'Receive a wisdom from Archangel Michael', 'en-GB': 'Receive a wisdom from Archangel Michael', ar: 'احصل على حكمة من الملاك ميخائيل' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURASCAN_COMMAND = {
  name: 'aurascan',
  description: 'Ontvang een persoonlijke aura-lezing van Michaël',
  name_localizations: { 'en-US': 'aurascan', 'en-GB': 'aurascan', ar: 'مسح-الأورا' },
  description_localizations: { 'en-US': 'Receive a personal aura reading from Michael', 'en-GB': 'Receive a personal aura reading from Michael', ar: 'احصل على قراءة أورا شخصية من ميخائيل' },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Vertel iets over jezelf',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message', ar: 'رسالة' },
      description_localizations: { 'en-US': 'Tell something about yourself', 'en-GB': 'Tell something about yourself', ar: 'أخبر شيئاً عن نفسك' },
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
  name_localizations: { 'en-US': 'chosenone', 'en-GB': 'chosenone', ar: 'المختار' },
  description_localizations: { 'en-US': 'Michael chooses a new chosen one in the server', 'en-GB': 'Michael chooses a new chosen one in the server', ar: 'يختار ميخائيل مختاراً جديداً في الخادم' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const ANTICHRIST_COMMAND = {
  name: 'antichrist',
  description: 'Michaël wijst de antichrist aan. ... voor 24 uur geweigerd',
  name_localizations: { 'en-US': 'antichrist', 'en-GB': 'antichrist', ar: 'الدجال' },
  description_localizations: { 'en-US': 'Michael designates the antichrist. Refused for 24 hours.', 'en-GB': 'Michael designates the antichrist. Refused for 24 hours.', ar: 'يعيِّن ميخائيل الدجال. مرفوض لمدة 24 ساعة.' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const DATEER_COMMAND = {
  name: 'dateer',
  description: 'Ga op date met Aartsengel Michaël',
  name_localizations: { 'en-US': 'dateangel', 'en-GB': 'dateangel', ar: 'موعد-غرامي' },
  description_localizations: { 'en-US': 'Go on a date with Archangel Michael', 'en-GB': 'Go on a date with Archangel Michael', ar: 'اذهب في موعد غرامي مع الملاك ميخائيل' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const PRAATMETMICHAEL_COMMAND = {
  name: 'chat',
  description: 'Praat met Michael en ontvang twijfelachtig spiritueel advies',
  name_localizations: { 'en-US': 'chat', 'en-GB': 'chat', ar: 'حوار' },
  description_localizations: { 'en-US': 'Talk to Michael and receive dubious spiritual advice', 'en-GB': 'Talk to Michael and receive dubious spiritual advice', ar: 'تحدَّث مع امرئ القيس واحصل على حكمة مشكوك فيها' },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Wat wil je tegen Michael zeggen?',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message', ar: 'رسالة' },
      description_localizations: { 'en-US': 'What do you want to say?', 'en-GB': 'What do you want to say?', ar: 'ماذا تريد أن تقول؟' },
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BABYCHAT_COMMAND = {
  name: 'babychat',
  description: 'Michael antwoordt als peuter; half van de tijd wordt hij woedend',
  name_localizations: { 'en-US': 'babychat', 'en-GB': 'babychat', ar: 'دردشة-طفل' },
  description_localizations: {
    'en-US': 'Michael answers like a toddler; half the time he snaps and demotes you',
    'en-GB': 'Michael answers like a toddler; half the time he snaps and demotes you',
    ar: 'ميخائيل يردّ كطفل صغير؛ ونصف الوقت ينفجر ويخفضك',
  },
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Wat zeg je tegen baby-Michael?',
      name_localizations: { 'en-US': 'message', 'en-GB': 'message', ar: 'رسالة' },
      description_localizations: { 'en-US': 'What do you say to baby Michael?', 'en-GB': 'What do you say to baby Michael?', ar: 'ماذا تقول لميخائيل الطفل؟' },
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
  name_localizations: { 'en-US': 'vibecheck', 'en-GB': 'vibecheck', ar: 'فحص-الطاقة' },
  description_localizations: { 'en-US': "What does Michael actually think of you?", 'en-GB': "What does Michael actually think of you?", ar: 'ماذا يعتقد ميخائيل عنك في الواقع؟' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const COSMISCHESTATUS_COMMAND = {
  name: 'cosmischestatus',
  description: 'Wie draagt het veld op dit moment? Antichrist en uitverkorene.',
  name_localizations: { 'en-US': 'cosmicstatus', 'en-GB': 'cosmicstatus', ar: 'الحالة-الكونية' },
  description_localizations: { 'en-US': 'Who holds the field right now? Antichrist and chosen one.', 'en-GB': 'Who holds the field right now? Antichrist and chosen one.', ar: 'من يحمل الحقل الآن؟ الدجال والمختار.' },
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const MICHAELHUMEUR_COMMAND = {
  name: 'michaelhumeur',
  description: 'Hoe voelt Michael zich tegenover jou op dit moment?',
  name_localizations: { 'en-US': 'michaelmood', 'en-GB': 'michaelmood', ar: 'مزاج-ميخائيل' },
  description_localizations: { 'en-US': "How does Michael feel toward you right now?", 'en-GB': "How does Michael feel toward you right now?", ar: 'كيف يشعر ميخائيل تجاهك الآن؟' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const VERGEEFMIJ_COMMAND = {
  name: 'vergeefmij',
  description: 'Bied je excuses aan bij Michael en hoop op zijn genade.',
  name_localizations: { 'en-US': 'forgiveme', 'en-GB': 'forgiveme', ar: 'اغفر-لي' },
  description_localizations: { 'en-US': 'Apologise to Michael and hope for his mercy.', 'en-GB': 'Apologise to Michael and hope for his mercy.', ar: 'اعتذر لميخائيل وأمل في رحمته.' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURACHECK_COMMAND = {
  name: 'auracheck',
  description: 'Laat Michael de aura lezen van een andere gebruiker.',
  name_localizations: { 'en-US': 'auracheck', 'en-GB': 'auracheck', ar: 'فحص-أورا' },
  description_localizations: { 'en-US': "Let Michael read another user's aura.", 'en-GB': "Let Michael read another user's aura.", ar: 'دع ميخائيل يقرأ أورا مستخدم آخر.' },
  options: [
    {
      type: 6,
      name: 'gebruiker',
      description: 'De gebruiker wiens aura Michael moet lezen.',
      name_localizations: { 'en-US': 'user', 'en-GB': 'user', ar: 'مستخدم' },
      description_localizations: { 'en-US': 'The user whose aura Michael should read.', 'en-GB': 'The user whose aura Michael should read.', ar: 'المستخدم الذي يجب على ميخائيل قراءة أوراه.' },
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
  name_localizations: { 'en-US': 'mycharacter', 'en-GB': 'mycharacter', ar: 'شخصيتي' },
  description_localizations: { 'en-US': "View the role Michael has assigned you in his cosmic field campaign.", 'en-GB': "View the role Michael has assigned you in his cosmic field campaign.", ar: 'اعرض الدور الذي عيَّنه ميخائيل لك في حملته الكونية.' },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ONDERHANDELEN_COMMAND = {
  name: 'onderhandelen',
  description:
    'Smek en buig vóór het register...  kies archetype, afstamming of titel, spreek uw wens, waag de worp.',
  name_localizations: { 'en-US': 'negotiate', 'en-GB': 'negotiate', ar: 'تفاوض' },
  description_localizations: {
    'en-US':
      'Plead and grovel before the register...  pick archetype, lineage, or title, then your wish, then roll.',
    'en-GB':
      'Plead and grovel before the register...  pick archetype, lineage, or title, then your wish, then roll.',
    ar: 'توسَّل واستذل قبل أن يُفتَح باب التفاوض...  اختر النمط أو السلالة أو اللقب، ثم قول مرادك وارمِ.',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Language selector...  sets the language Michael uses on this server
const MICHAELTAAL_COMMAND = {
  name: 'michaeltaal',
  description: 'Set the language Michael Bot uses on this server / Stel de taal in van Michael Bot',
  name_localizations: { 'en-US': 'setlanguage', 'en-GB': 'setlanguage', ar: 'لغة-ميخائيل' },
  description_localizations: {
    'en-US': 'Set the language Michael Bot uses on this server (or your personal language in DMs)',
    'en-GB': 'Set the language Michael Bot uses on this server (or your personal language in DMs)',
    ar: 'اضبط لغة الخادم...  أو لغتك الشخصية في الرسائل الخاصة',
  },
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, TREKKAART_COMMAND, AURASCAN_COMMAND, UITVERKORENE_COMMAND, ANTICHRIST_COMMAND, DATEER_COMMAND, PRAATMETMICHAEL_COMMAND, BABYCHAT_COMMAND, VIBECHECK_COMMAND, COSMISCHESTATUS_COMMAND, MICHAELHUMEUR_COMMAND, VERGEEFMIJ_COMMAND, MIJNROL_COMMAND, ONDERHANDELEN_COMMAND, MICHAELTAAL_COMMAND];

// Clear any leftover guild-specific commands so they don't show up as duplicates
if (process.env.GUILD_IDS) {
  const guildIds = process.env.GUILD_IDS.split(',');
  for (const guildId of guildIds) {
    InstallGuildCommands(process.env.APP_ID, guildId.trim(), []);
  }
}

// Register all commands globally
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
