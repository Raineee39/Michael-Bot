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
import { generateMichaelMessage, summariseUserHistory, generateVibecheckComment, scoreMichaelMessage, generateMorningAfter, generateDelayedConsequence, generatePostRevision, generateMijnRolComment } from './utils/openai.js';
import { loadUserMemory, saveUserMemory, getJudgementLabel, needsSummarisation, updateImpression, loadAllMemory, addUnfinishedBusiness, getOutstandingBusiness, markBusinessMentioned, markBusinessResolved, maybeAgeBusiness, addTheme, detectThemeOverlap, patchUserState, updateLastChannel, recordLanguageRequest, getRequestedLanguageCode, userSpeaksUnlockedLanguage, formatCharacterForPrompt, shouldReferenceCharacterThisTurn } from './utils/michael-memory.js';
import { ensureMichaelCharacter, runForgivenessRoll, runOnderhandelen, maybePassiveRollBlock, executePassiveRoll } from './utils/michael-rollenspel.js';
import { startGateway } from './utils/gateway.js';
import { getShadowCandidates, markShadowReplied, pruneOldCandidates } from './utils/shadow-store.js';
import { getGuildLanguage, setGuildLanguage, resolveLanguage } from './utils/guild-settings.js';
import { getUserLanguage, setUserLanguage } from './utils/user-settings.js';
import { getLang } from './utils/lang/index.js';

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

/** Returns ROUND_1/2/3/VERDICTS from date.js (Dutch) or from the lang pack (EN/AR). */
function getDateRounds(lang) {
  if (lang.code === 'nl') {
    return { r1: ROUND_1, r2: ROUND_2, r3: ROUND_3, verdicts: VERDICTS };
  }
  return {
    r1: lang.date.round1,
    r2: lang.date.round2,
    r3: lang.date.round3,
    verdicts: lang.date.verdicts,
  };
}

// Pending /onderhandelen verzoek texts — keyed by userId, cleared after use or 10 min
const pendingNegotiations = new Map();

// All flee/pardon/apology/refusal strings are now in lang packs (utils/lang/{nl,en,ar}.js)
// and accessed via lang.ui.*  throughout the handler.

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

async function buildUitverkoreneMessage(guildId, lang) {
  const membersRes = await DiscordRequest(`guilds/${guildId}/members?limit=1000`, { method: 'GET' });
  const members = await membersRes.json();
  const humans = members.filter(m => !m.user.bot);
  const chosen = humans[Math.floor(Math.random() * humans.length)];
  const userId = chosen.user.id;
  const gif = await fetchGiphyGif(getRandomGifQuery());

  const boodschap = pick(lang.uitverkorene.boodschappen);

  const content = [
    lang.uitverkorene.header,
    lang.uitverkorene.title,
    lang.uitverkorene.header,
    ``,
    `<@${userId}>`,
    ``,
    `*${boodschap}*`,
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

const ANTICHRIST_EXEMPT_COMMANDS = new Set(['antichrist', 'chat', 'vibecheck', 'cosmischestatus', 'mijnrol']);

// NEE array is now per-lang: lang.ui.nee

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

// DATE_MOOD_INTROS and DATE_ROUND1_WOEDEND are now in lang packs: lang.date.moodIntros / lang.date.round1WoedendChoices

// MICHAEL_HUMEUR, APOLOGY_*, MICHAEL_REFUSALS, BAIT_DISMISSALS, SHADOW_REPLY_LINES are now in lang packs.
// Access via lang.humeur[mood], lang.ui.apologyAccepted, lang.ui.apologyRejected, lang.ui.apologyAlreadyCalm,
// lang.ui.refusals, lang.ui.baitDismissals, lang.ui.shadowReplyLines.

// Detects technical / code requests that Michael refuses to handle
const CODE_REQUEST_RE = /\b(code|codeer|programm|react|javascript|html|css|node\.?js|python|script|config|debug|bouw|build|compileer|deploy|functie schrijven|api|database)\b/i;

const INSULT_RE = /\b(kut|fuck|shit|klootzak|lul|eikel|idioot|sukkel|kanker|godverdomme|hoer|bitch|asshole|bastard|stom|dom)\b/i;

// Feature 3 — Detects baiting / attempts to force Michael to respond
const BAIT_RE = /\b(antwoord\s*(dan|nu|toch|me)?|reageer\s*(dan|nu|toch)?|durf\s+je\s+niet|durf\s+niet|zeg\s+iets|waarom\s+reageer|coward|lafaard|bange\s+engel|kom\s+op\s+dan|wees\s+geen\s+lafaard|reageer\s+op\s+mij|zeg\s+dan\s+iets|ben\s+je\s+er\s+wel)\b/i;

/** Returns the localised display name for a mood key, falling back to the raw key. */
function moodName(lang, key) {
  return lang.moodNames?.[key] ?? key;
}

// ─── Feature 5 — Post-message revision ────────────────────────────────────────
//
// After sending a message, Michael may quietly append a second thought.
// The original content is always preserved — only an "Edit: …" line is added.

async function schedulePostRevision(channelId, messageId, originalContent, mood, label = 'message', langCode = 'nl') {
  if (Math.random() > 0.20) return; // 20% chance
  const delay = 7000 + Math.floor(Math.random() * 13000); // 7–20 s
  console.log(`[michael] revision scheduled | ${label} | ${messageId} | ~${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const editLine = await generatePostRevision(originalContent, mood, langCode);
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


// CODE_REFUSALS is now in lang packs: lang.ui.codeRefusals

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

  // Resolve guild language for all subsequent handlers
  const guildId = req.body.guild_id;
  const invokingUserId = req.body.member?.user?.id ?? req.body.user?.id;
  const langCode = resolveLanguage(guildId, invokingUserId);
  const lang = getLang(langCode);
  if (isAntichrist(invokingUserId) && !ANTICHRIST_EXEMPT_COMMANDS.has(data?.name)) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: pick(lang.ui.nee) },
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
      const kaart = pick(lang.trekkaart.kaarten);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: `${lang.trekkaart.header}\n\n*${kaart}*`,
            },
          ],
        },
      });
    }

    // "aurascan" command
    if (name === 'aurascan') {
      const lezing = pick(lang.aurascan.lezingen);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              content: `${lang.aurascan.header}\n\n*${lezing}*`,
            },
          ],
        },
      });
    }

    // "uitverkorene" command
    if (name === 'uitverkorene') {
      // Acknowledge immediately — member fetch + Giphy can exceed Discord's 3s deadline
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(guildId, lang);
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

      const membersRes = await DiscordRequest(`guilds/${guildId}/members?limit=1000`, { method: 'GET' });
      const members = await membersRes.json();
      const humans = members.filter(m => !m.user.bot);
      const chosen = humans[Math.floor(Math.random() * humans.length)];

      antichristState.userId = chosen.user.id;
      antichristState.expiresAt = Date.now() + 24 * 60 * 60 * 1000;

      await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
        method: 'PATCH',
        body: { content: lang.antichrist.announcement(chosen.user.id) },
      });
      return;
    }

    // "dateer" command
    if (name === 'dateer') {
      const invokerUserId = req.body.member?.user?.id ?? req.body.user?.id;
      const dateMood = loadUserMemory(invokerUserId).currentMood ?? 'afwezig';
      const dateRounds = getDateRounds(lang);
      const intro = lang.date.moodIntros[dateMood] ?? dateRounds.r1.intro;
      const choices = dateMood === 'woedend' ? lang.date.round1WoedendChoices : dateRounds.r1.choices;
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

      const cs = lang.cosmicStatus;
      const antichristLine = antichristId ? cs.antichristActive(antichristId, fireRow) : cs.antichristNone(calmRow);
      const uitLine = uitId ? cs.uitverkoreneActive(uitId, eyeRow) : cs.uitverkoreneNone(eyeRow);

      const invokerMood  = loadUserMemory(invokerId).currentMood ?? 'afwezig';
      const humeurLines  = lang.humeurLines[invokerMood] ?? lang.humeurLines['afwezig'];
      const moodBlock    = `\n\n──────────────────\n${cs.moodTowardYou}\n${pick(humeurLines)}\n${cs.moodLabel(moodName(lang, invokerMood))}`;

      const header = cs.header(eyeRow);

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
          data: { content: pick(lang.ui.apologyAlreadyCalm) },
        });
      }

      const ui = lang.ui;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${ui.vergeefmijRiteHeader}\n${ui.vergeefmijMoodText(moodName(lang, currentMood))}${ui.vergeefmijConfirm}`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_roll:${userId}`, label: ui.vergeefmijRollButton, style: ButtonStyleTypes.PRIMARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_flee:${userId}`, label: ui.vergeefmijFleeButton, style: ButtonStyleTypes.SECONDARY },
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
        const character = await ensureMichaelCharacter(userId, username, langCode);
        const mem = loadUserMemory(userId);
        const judgementLabel = getJudgementLabel(mem.judgementScore ?? 0);
        const comment = await generateMijnRolComment(username, character, judgementLabel, mem.currentMood ?? 'afwezig', langCode);

        const { stats } = character;
        const mr = lang.mijnrol;
        const statBar = (v) => '█'.repeat(Math.round(v / 3)) + '░'.repeat(6 - Math.round(v / 3));
        const safeComment = comment.slice(0, 300);
        const sheet = [
          mr.header,
          mr.title,
          mr.subtitle,
          ``,
          `${mr.archetypeLabel}    ${character.archetype}`,
          `${mr.lineageLabel}   ${character.lineage}`,
          `${mr.titleLabel}        *${character.title}*`,
          ``,
          `\`\`\``,
          `${mr.statNames.aura.padEnd(10)} ${statBar(stats.aura)} ${String(stats.aura).padStart(2)}`,
          `${mr.statNames.discipline.padEnd(10)} ${statBar(stats.discipline)} ${String(stats.discipline).padStart(2)}`,
          `${mr.statNames.chaos.padEnd(10)} ${statBar(stats.chaos)} ${String(stats.chaos).padStart(2)}`,
          `${mr.statNames.inzicht.padEnd(10)} ${statBar(stats.inzicht)} ${String(stats.inzicht).padStart(2)}`,
          `${mr.statNames.volharding.padEnd(10)} ${statBar(stats.volharding)} ${String(stats.volharding).padStart(2)}`,
          `\`\`\``,
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
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.mijnrolError },
          });
        } catch { /* token expired */ }
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

      const ui = lang.ui;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${ui.onderhandelenRegisterHeader}\n${ui.onderhandelenConfirm(verzoek)}`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_roll:${userId}`, label: ui.onderhandelenRollButton, style: ButtonStyleTypes.PRIMARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_flee:${userId}`, label: ui.onderhandelenFleeButton, style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
    }

    // "michaelhumeur" — shows Michael's current persistent mood toward this user
    if (name === 'michaelhumeur') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const mood   = loadUserMemory(userId).currentMood ?? 'afwezig';
      const humeurLines = lang.humeurLines[mood] ?? lang.humeurLines['afwezig'];
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${pick(humeurLines)}\n\n${lang.humeur.currentMoodLabel(moodName(lang, mood))}` },
      });
    }


    // "vibecheck" command — full points dashboard + improvement tips
    if (name === 'vibecheck') {
      const userId   = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const memory   = loadUserMemory(userId);
      const label    = getJudgementLabel(memory.judgementScore ?? 0);
      const character = memory.michaelCharacter ?? null;

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
          character,
          langCode,
        );

        const vc = lang.vibecheck;
        const lines = [
          vc.header(username),
          ``,
          `${vc.oordeelLabel}          ${label}   ${scoreBar}   *(${memory.judgementScore ?? 0})*`,
        ];

        if (character) {
          lines.push(`${vc.kosmischeRolLabel}    ${character.archetype} • ${character.lineage} — *${character.title.slice(0, 60)}*`);
        }

        lines.push(``, comment);

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: lines.join('\n') },
        });
      } catch (err) {
        console.error('vibecheck error:', err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.vibecheckError },
          });
        } catch { /* token expired */ }
      }
      return;
    }

    // "chat" command (was praatmetmichael)
    if (name === 'chat') {
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
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelPlaceholders)}` },
      });

      // Feature 3 — Bait / forcing-Michael trap: respond coldly and queue unfinished business
      if (BAIT_RE.test(userInput)) {
        console.log(`[michael] chat | bait-dismissal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -1, nextMood(mood, -1), channelId);
        addUnfinishedBusiness(userId, {
          prompt:   userInput,
          reason:   'De gebruiker probeerde Michael te commanderen of te dwingen te reageren',
          severity: 2,
          channelId,
        });
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.baitDismissals)}` },
        });
        return;
      }

      // Code / technical request — refuse in-character, queue unfinished business
      if (CODE_REQUEST_RE.test(userInput)) {
        console.log(`[michael] chat | code-refusal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -2, nextMood(mood, -2), channelId);
        addUnfinishedBusiness(userId, {
          prompt:   userInput,
          reason:   'De gebruiker vroeg om technische hulp — buiten Michaels domein maar hij vergeet het niet',
          severity: 1,
          channelId,
        });
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.codeRefusals)}` },
        });
        return;
      }

      // ~15% chance Michael refuses outright — no OpenAI call
      if (Math.random() < 0.15) {
        console.log(`[michael] chat | random-refusal (15%) | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, 0, nextMood(mood, 0), channelId);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelRefusals)}` },
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
          ? formatCharacterForPrompt(existingCharacter)
          : '';

        // After 2 explicit requests, unlock; full target-language replies only when they write in that language (or ask again)
        const unlocked = recordLanguageRequest(userId, username, userInput) ?? preMemory.languagePermission ?? null;
        const asksAgain = unlocked && getRequestedLanguageCode(userInput) === unlocked.code;
        const speaksIt = unlocked && userSpeaksUnlockedLanguage(unlocked, userInput);
        const languagePermission = unlocked && (speaksIt || asksAgain) ? unlocked : null;
        console.log(`[michael] chat | lang=${languagePermission?.code ?? 'nl+mix'} | unlocked=${unlocked?.code ?? '—'} | speaks=${speaksIt} | asksAgain=${asksAgain} | char=${existingCharacter?.archetype ?? 'nieuw'} | ${username}`);

        // Feature 2 — Contradiction engine: detect if user is revisiting a theme
        const contradictionHint = detectThemeOverlap(userId, userInput);

        // Passive dice roll — selective, returns true if buttons should be shown
        const passiveTriggered = maybePassiveRollBlock(userId, userInput);

        // Run message generation and AI scoring in parallel — no extra wait time
        const [michaelMessage, scoreDelta] = await Promise.all([
          generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, preMemory.impression ?? null, cosmicRole, contradictionHint, languagePermission, characterBlock, langCode),
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
          if (gifUrl) console.log(`[michael] chat | gif | ${username}`);
        }
        const messageBase = `> ${safeInput}\n\n${michaelMessage}`;
        const patchBody = { content: messageBase };
        if (gifUrl) patchBody.embeds = [{ image: { url: gifUrl } }];
        if (passiveTriggered) {
          patchBody.components = [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `passive_roll:${userId}`, label: lang.ui.passiveRollButton, style: ButtonStyleTypes.SECONDARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `passive_flee:${userId}`, label: lang.ui.passiveFleeButton, style: ButtonStyleTypes.SECONDARY },
            ],
          }];
        }

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
              schedulePostRevision(channelId, sentMsg.id, messageBase, mood, 'chat', langCode);
            }
          } catch {
            // non-critical — skip revision if we can't fetch the message ID
          }
        }

        // Rollenspel — generate character in background after reply so it never blocks the response
        if (!existingCharacter) {
          ensureMichaelCharacter(userId, username, langCode).catch(err =>
            console.error(`[michael] background character generation failed | ${username}:`, err.message)
          );
        }
      } catch (err) {
        console.error('chat error:', err);
        // If the token expired (10015) the fallback PATCH will also fail — swallow it silently
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `> ${safeInput}\n\n${lang.ui.praatError}` },
          });
        } catch { /* token already gone */ }
      } finally {
        if (typingInterval) clearInterval(typingInterval);
      }
      return;
    }

    // "michaeltaal" — set language (server or personal in DMs)
    if (name === 'michaeltaal') {
      // DM context — no guild, so set per-user language instead
      if (!guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: lang.ui.michaeltaalPromptDM ?? lang.ui.michaeltaalPrompt,
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [{
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaaldm_nl:${invokingUserId}`, label: '🇳🇱 Nederlands', style: ButtonStyleTypes.SECONDARY },
                { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaaldm_en:${invokingUserId}`, label: '🇬🇧 English', style: ButtonStyleTypes.SECONDARY },
                { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaaldm_ar:${invokingUserId}`, label: '🇸🇾 العربية', style: ButtonStyleTypes.SECONDARY },
              ],
            }],
          },
        });
      }

      // Guild context — requires Manage Guild permission
      const member = req.body.member;
      const permissions = BigInt(member?.permissions ?? '0');
      const MANAGE_GUILD = BigInt(0x20);
      if (!(permissions & MANAGE_GUILD)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.michaeltaalNoPermission, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: lang.ui.michaeltaalPrompt,
          flags: InteractionResponseFlags.EPHEMERAL,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaal_nl:${guildId}`, label: '🇳🇱 Nederlands', style: ButtonStyleTypes.SECONDARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaal_en:${guildId}`, label: '🇬🇧 English', style: ButtonStyleTypes.SECONDARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaal_ar:${guildId}`, label: '🇸🇾 العربية', style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
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
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (componentId.startsWith('vergeefmij_flee:')) {
        return res.send({
          type: 7, // UPDATE_MESSAGE
          data: { content: pick(lang.ui.fleeVergeefmij), components: [] },
        });
      }

      // Roll path — immediately update message with loading state + disabled buttons, then patch result
      res.send({
        type: 7, // UPDATE_MESSAGE
        data: {
          content: lang.ui.vergeefmijRolling,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_roll:${ownerId}`, label: lang.ui.vergeefmijRollingButton, style: ButtonStyleTypes.PRIMARY, disabled: true },
              { type: MessageComponentTypes.BUTTON, custom_id: `vergeefmij_flee:${ownerId}`, label: lang.ui.vergeefmijFleeButton, style: ButtonStyleTypes.SECONDARY, disabled: true },
            ],
          }],
        },
      });
      try {
        const username = req.body.member?.user?.username ?? req.body.user?.username;
        const memory   = loadUserMemory(ownerId);
        const currentMood = memory.currentMood ?? 'afwezig';
        const moodIdx  = MICHAEL_MOODS.indexOf(currentMood);

        const { forgiven, narrative, roll, need, newMood, oordeelDelta } =
          await runForgivenessRoll(ownerId, username, currentMood, moodIdx, langCode);

        const rl = lang.rollUI;
        const sign = roll.modifier >= 0 ? '+' : '−';
        const outcome = forgiven ? rl.succeededLabel : rl.failedLabel;
        const moodLine = forgiven
          ? `${rl.moodLabel}    ${moodName(lang, currentMood)} → ${moodName(lang, newMood)}`
          : `${rl.moodLabel}    ${moodName(lang, currentMood)} (${rl.moodUnchanged})`;
        const oordeelSign = oordeelDelta > 0 ? '+' : '';
        const systemBlock = `\`\`\`\n[ ${rl.registerLabel} ]\n${rl.rollLabel}        ${roll.raw} ${sign}${Math.abs(roll.modifier)} = ${roll.total}\n${rl.thresholdLabel}     ${need}\n${rl.outcomeLabel}    ${outcome}\n${moodLine}\n${rl.judgementLabel}     ${oordeelSign}${oordeelDelta}\n\`\`\``;
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
              const pardonLang = getLang(getGuildLanguage(req.body.guild_id));
              const msg = pick(pardonLang.ui.divinepardonVergeefmij);
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
          body: { content: pick(lang.ui.apologyRejected), components: [] },
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
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (componentId.startsWith('onderhandelen_flee:')) {
        pendingNegotiations.delete(ownerId);
        return res.send({
          type: 7,
          data: { content: pick(lang.ui.fleeOnderhandelen), components: [] },
        });
      }

      // Roll path
      const pending = pendingNegotiations.get(ownerId);
      if (!pending || Date.now() > pending.expiresAt) {
        pendingNegotiations.delete(ownerId);
        return res.send({
          type: 7,
          data: { content: lang.ui.onderhandelenExpired, components: [] },
        });
      }
      pendingNegotiations.delete(ownerId);

      // Immediately update with loading state + disabled buttons, then patch result
      res.send({
        type: 7, // UPDATE_MESSAGE
        data: {
          content: `${lang.ui.onderhandelenRegisterHeader}\n*"${pending.verzoek.slice(0, 80)}"*\n\n${lang.ui.onderhandelenRolling.split('\n').slice(-1)[0]}`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_roll:${ownerId}`, label: lang.ui.onderhandelenRollingButton, style: ButtonStyleTypes.PRIMARY, disabled: true },
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_flee:${ownerId}`, label: lang.ui.onderhandelenFleeButton, style: ButtonStyleTypes.SECONDARY, disabled: true },
            ],
          }],
        },
      });
      try {
        const { verzoek, username } = pending;
        const { narrative, roll, dc, success, oordeelDelta } =
          await runOnderhandelen(ownerId, username, verzoek, langCode);

        const rl = lang.rollUI;
        const sign = roll.modifier >= 0 ? '+' : '−';
        const outcome = success ? rl.succeededLabel : rl.failedLabel;
        const oordeelSign = oordeelDelta > 0 ? '+' : '';
        const systemBlock = `\`\`\`\n[ ${rl.registerLabel} ]\n${rl.rollLabel}        ${roll.raw} ${sign}${Math.abs(roll.modifier)} = ${roll.total}\n${rl.thresholdLabel}     ${dc}\n${rl.outcomeLabel}    ${outcome}\n${rl.judgementLabel}     ${oordeelSign}${oordeelDelta}\n\`\`\``;
        const header = success ? '📜✨📜✨📜' : '🔥📜🔥📜🔥';
        const content = `${header}\n${lang.ui.onderhandelenRegisterHeader.split('\n').slice(-1)[0]}\n*"${verzoek.slice(0, 80)}"*\n\n${narrative}\n\n${systemBlock}`;
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
              const uPardon = loadUserMemory(ownerId);
              patchUserState(ownerId, 1, uPardon.currentMood ?? 'afwezig');
              const pardonLang = getLang(getGuildLanguage(req.body.guild_id));
              const msg = pick(pardonLang.ui.divinepardonOnderhandelen);
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
          body: { content: lang.ui.onderhandelenError, components: [] },
        });
      }
      return;
    }

    // ── Passive cosmic register button ─────────────────────────────────────
    if (componentId.startsWith('passive_roll:') || componentId.startsWith('passive_flee:')) {
      const ownerId   = componentId.split(':')[1];
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;

      if (clickerId !== ownerId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (componentId.startsWith('passive_flee:')) {
        return res.send({
          type: 7,
          data: { content: prev, components: [] },
        });
      }

      // Roll path — disable buttons immediately, then patch with result
      res.send({
        type: 7,
        data: {
          content: prev + '\n\n*⏳...*',
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `passive_roll:${ownerId}`, label: '⏳...', style: ButtonStyleTypes.SECONDARY, disabled: true },
              { type: MessageComponentTypes.BUTTON, custom_id: `passive_flee:${ownerId}`, label: lang.ui.passiveFleeButton, style: ButtonStyleTypes.SECONDARY, disabled: true },
            ],
          }],
        },
      });
      try {
        const { line } = executePassiveRoll(ownerId);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: prev + '\n\n' + line, components: [] },
        });
      } catch (e) {
        console.error('[michael] passive-roll button error:', e.message);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: prev, components: [] },
          });
        } catch { /* token expired */ }
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
      const { r2 } = getDateRounds(lang);
      const r2entry = r2[path];
      return res.send({
        type: 7,
        data: {
          content: `${prev}${SEP}${r2entry.response}\n\n${r2entry.prompt}`,
          components: [buildDateButtons(r2entry.choices.map(c => ({ ...c, custom_id: `date_r2_${invokerUserId}_${path}${c.id}` })))],
        },
      });
    }

    if (componentId.startsWith('date_r2_')) {
      const { invokerUserId, path } = parseDateId('date_r2_');
      const { r3 } = getDateRounds(lang);
      const r3entry = r3[path];
      return res.send({
        type: 7,
        data: {
          content: `${prev}${SEP}${r3entry.response}\n\n${r3entry.prompt}`,
          components: [buildDateButtons(r3entry.choices.map(c => ({ ...c, custom_id: `date_r3_${invokerUserId}_${path}${c.id}` })))],
        },
      });
    }

    if (componentId.startsWith('date_r3_')) {
      const { invokerUserId, path } = parseDateId('date_r3_');
      const { r3, verdicts } = getDateRounds(lang);
      const r3key = path.slice(0, 2);
      const reaction = r3[r3key].reactions[path.slice(-1)];
      const verdict = verdicts[path];
      const dateScore = DATE_SCORES[path] ?? 0;

      const invokerMem = loadUserMemory(invokerUserId);
      const invokerUsername = invokerMem.username || invokerUserId;
      const currentMood = invokerMem.currentMood ?? 'afwezig';
      saveUserMemory(invokerUserId, invokerUsername, `[date:${path}]`, currentMood, dateScore, nextMood(currentMood, dateScore));
      console.log(`[michael] dateer | ${invokerUsername} | path=${path} | +${dateScore}`);

      const dc = lang.date;
      const consequence = dateScore >= 3
        ? `\n\n*${dc.consequence3 ?? 'iets in het veld verschoof     permanent     Michael onthoudt dit'}*`
        : dateScore >= 2
        ? `\n\n*${dc.consequence2 ?? 'iets veranderde vanavond     klein     maar echt'}*`
        : dateScore >= 1
        ? `\n\n*${dc.consequence1 ?? 'een kleine trilling     niets dramatisch     toch iets'}*`
        : '';

      if (DATE_ROUND4_PATHS.has(path)) {
        return res.send({
          type: 7,
          data: {
            content: `${prev}${SEP}${reaction}\n\n${verdict}${consequence}${SEP}*${dc.morningIntro ?? 'de volgende ochtend     een bericht van Michael     hij heeft nog nooit eerder een bericht gestuurd'}*\n\n**${dc.morningPrompt ?? 'wat doe je'}**`,
            components: [buildDateButtons([
              { label: dc.r4ChoiceA ?? '🌅 Laat het zo', id: 'a', custom_id: `date_r4_${invokerUserId}_${path}_a` },
              { label: dc.r4ChoiceB ?? '💬 Stuur een bericht terug', id: 'b', custom_id: `date_r4_${invokerUserId}_${path}_b` },
              { label: dc.r4ChoiceC ?? '🫶 Vraag of hij het goed maakt', id: 'c', custom_id: `date_r4_${invokerUserId}_${path}_c` },
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
        const morningMsg = await generateMorningAfter(invokerUsername, datePath, morningChoice, langCode);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `${prev}${SEP}${morningMsg}`, components: [] },
        });
      } catch (err) {
        console.error('morning after error:', err);
        const fallback = lang.date.morningFallback ?? 'geen bericht van Michael     maar je voelt iets     vaag     aanwezig';
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `${prev}${SEP}*${fallback}*`, components: [] },
        });
      }
      return;
    }

    // ── Language selector buttons (guild) ──────────────────────────────────
    if (componentId.startsWith('michaeltaal_')) {
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;
      const member = req.body.member;
      const permissions = BigInt(member?.permissions ?? '0');
      const MANAGE_GUILD = BigInt(0x20);
      if (!(permissions & MANAGE_GUILD)) {
        const noPermLang = getLang(resolveLanguage(guildId, clickerId));
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: noPermLang.ui.michaeltaalNoPermission, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      const newLangCode = componentId.replace('michaeltaal_', '').split(':')[0]; // nl / en / ar
      const targetGuildId = componentId.split(':')[1] ?? guildId;
      setGuildLanguage(targetGuildId, newLangCode);
      const newLang = getLang(newLangCode);
      const confirmMsg = newLang.ui.michaeltaalSet[newLangCode] ?? newLang.ui.michaeltaalSet.nl;

      return res.send({
        type: 7, // UPDATE_MESSAGE
        data: { content: confirmMsg, components: [] },
      });
    }

    // ── Language selector buttons (DM / per-user) ──────────────────────────
    if (componentId.startsWith('michaeltaaldm_')) {
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;
      const newLangCode = componentId.replace('michaeltaaldm_', '').split(':')[0]; // nl / en / ar
      setUserLanguage(clickerId, newLangCode);
      const newLang = getLang(newLangCode);
      const confirmMsg = newLang.ui.michaeltaalSetDM?.[newLangCode]
        ?? newLang.ui.michaeltaalSet?.[newLangCode]
        ?? newLang.ui.michaeltaalSet.nl;

      return res.send({
        type: 7, // UPDATE_MESSAGE
        data: { content: confirmMsg, components: [] },
      });
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
      // Shadow replies use guild language where available, fallback to Dutch
      const shadowLangCode = pick.guildId ? getGuildLanguage(pick.guildId) : 'nl';
      const shadowLang = getLang(shadowLangCode);
      const shadowLine = shadowLang.ui.shadowReplyLines[Math.floor(Math.random() * shadowLang.ui.shadowReplyLines.length)];
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
    const consequenceLangCode = userShadow?.guildId ? getGuildLanguage(userShadow.guildId) : 'nl';
    const message = await generateDelayedConsequence(user.username || userId, item, mood, judgementLabel, consequenceLangCode);

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

    // Darken mood for lingering resentment, but don't touch judgement score —
    // score should only move from real interactions, not background timers
    patchUserState(userId, 0, nextMood(mood, -1));

    console.log(`[michael] delayed-consequence | ${user.username || userId} | ch=${targetChannel} | "${item.prompt.slice(0, 50)}"`);

    // Feature 5 — maybe append a post-revision edit to the consequence message
    if (sentMsg?.id) {
      schedulePostRevision(targetChannel, sentMsg.id, message, mood, 'consequence', consequenceLangCode);
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
    const cronLangCode = getGuildLanguage(guildId);
    const cronLang = getLang(cronLangCode);
    const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(guildId, cronLang);
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
