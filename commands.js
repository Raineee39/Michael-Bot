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
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const AURASCAN_COMMAND = {
  name: 'aurascan',
  description: 'Ontvang een persoonlijke aura-lezing van Michaël',
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Vertel iets over jezelf',
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
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const ANTICHRIST_COMMAND = {
  name: 'antichrist',
  description: 'Michaël wijst de antichrist aan. ... voor 24 uur geweigerd',
  type: 1,
  integration_types: [0],
  contexts: [0],
};

const DATEER_COMMAND = {
  name: 'dateer',
  description: 'Ga op date met Aartsengel Michaël',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const PRAATMETMICHAEL_COMMAND = {
  name: 'praatmetmichael',
  description: 'Praat met Michael en ontvang twijfelachtig spiritueel advies',
  options: [
    {
      type: 3,
      name: 'bericht',
      description: 'Wat wil je tegen Michael zeggen?',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const MICHAELGEHEUGEN_COMMAND = {
  name: 'michaelgeheugen',
  description: 'Wat onthoudt Michaël over jou — en wat vindt hij van je?',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, TREKKAART_COMMAND, AURASCAN_COMMAND, UITVERKORENE_COMMAND, ANTICHRIST_COMMAND, DATEER_COMMAND, PRAATMETMICHAEL_COMMAND, MICHAELGEHEUGEN_COMMAND];

// Clear any leftover guild-specific commands so they don't show up as duplicates
if (process.env.GUILD_IDS) {
  const guildIds = process.env.GUILD_IDS.split(',');
  for (const guildId of guildIds) {
    InstallGuildCommands(process.env.APP_ID, guildId.trim(), []);
  }
}

// Register all commands globally
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
