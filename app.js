import 'dotenv/config';
import express from 'express';
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
import { getRandomBoodschap, getRandomGifQuery } from './uitverkorene.js';
import { ROUND_1, ROUND_2, ROUND_3, VERDICTS } from './date.js';

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

  return { content, embeds };
}

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

// Antichrist state — in memory, clears on restart (intentional)
const antichristState = { userId: null, expiresAt: null };

function isAntichrist(userId) {
  if (!antichristState.userId) return false;
  if (Date.now() > antichristState.expiresAt) {
    antichristState.userId = null;
    antichristState.expiresAt = null;
    return false;
  }
  return antichristState.userId === userId;
}

const NEE = [
  'nee.',
  'nee.',
  'nee.',
  'NEE.',
  'nee.     ...Michael',
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
  if (isAntichrist(invokingUserId) && data?.name !== 'antichrist') {
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

      const { content, embeds } = await buildUitverkoreneMessage(req.body.guild_id);
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
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: ROUND_1.intro,
          components: [buildDateButtons(ROUND_1.choices.map(c => ({ ...c, custom_id: `date_r1_${c.id}` })))],
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  // Handle date button interactions
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id;

    // Round 1 clicked — path is 1 char e.g. "a"
    if (componentId.startsWith('date_r1_')) {
      const path = componentId.replace('date_r1_', '');
      const r2 = ROUND_2[path];
      return res.send({
        type: 7, // UPDATE_MESSAGE
        data: {
          content: `${r2.response}\n\n${r2.prompt}`,
          components: [buildDateButtons(r2.choices.map(c => ({ ...c, custom_id: `date_r2_${path}${c.id}` })))],
        },
      });
    }

    // Round 2 clicked — path is 2 chars e.g. "ab"
    if (componentId.startsWith('date_r2_')) {
      const path = componentId.replace('date_r2_', '');
      const r3 = ROUND_3[path];
      return res.send({
        type: 7, // UPDATE_MESSAGE
        data: {
          content: `${r3.response}\n\n${r3.prompt}`,
          components: [buildDateButtons(r3.choices.map(c => ({ ...c, custom_id: `date_r3_${path}${c.id}` })))],
        },
      });
    }

    // Round 3 clicked — path is 3 chars e.g. "abc"
    if (componentId.startsWith('date_r3_')) {
      const path = componentId.replace('date_r3_', '');
      const r3key = path.slice(0, 2);
      const lastChoice = path.slice(-1);
      const reaction = ROUND_3[r3key].reactions[lastChoice];
      const verdict = VERDICTS[path];
      return res.send({
        type: 7, // UPDATE_MESSAGE
        data: {
          content: `${reaction}\n\n${verdict}`,
          components: [],
        },
      });
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
    const { content, embeds } = await buildUitverkoreneMessage(guildId);
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

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
