import './utils/load-env.js';
import express from 'express';
import cron from 'node-cron';
import { registerDeployWebhook } from './utils/deploy-webhook.js';
import {
  ANTICHRIST_EXEMPT_COMMANDS,
  BAIT_RE,
  CODE_REQUEST_RE,
  FEEDBACK_OWNER_ID,
  INSULT_RE,
  MICHAEL_MOODS,
  buildChatRegisterBlock,
  buildRelationsBlock,
  buildWitnessDossier,
  collectRegisterSubjects,
  fileUnfinishedBusiness,
  getCosmicRole,
  isAntichrist,
  isUitverkorene,
  moodName,
  nextMood,
  noteMichaelSaid,
  parseCosmicComponentId,
  patchOriginal,
  pick,
  reactScoreArrow,
  resolveSlashUser,
  peekLongReply,
  schedulePostRevision,
  slashOptionValue,
  startTypingLoop,
  takeLongReply,
  withDeferredReply,
} from './utils/interaction-kit.js';
import { handleFeedback, handleDrawcard, handleAuracheck, handleSoulinvoice, handleMichaelmood, handleVibecheck, handleWitness, handleConfess } from './handlers/register-commands.js';
import { handleChat, handleImagine, handleListentomichael, handleForgiveme, handleMycharacter } from './handlers/chat-commands.js';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  TextStyleTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  addDiscordReaction,
  appendEditWithinDiscordLimit,
  DiscordRequest,
  DiscordMultipart,
  DISCORD_MESSAGE_CONTENT_MAX,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
  sendDmToUser,
} from './utils.js';
import { getRandomWisdom } from './wisdom.js';
import { getHoroscopeGifQuery } from './uitverkorene.js';
import { ROUND_1, ROUND_2, ROUND_3, VERDICTS, DATE_SCORES, DATE_ROUND4_PATHS } from './date.js';
import { generateMichaelMessage, summariseUserHistory, generateVibecheckComment, scoreMichaelMessage, generateMorningAfter, generatePostRevision, generateMijnRolComment, generateMichaelImage, generateMichaelVoiceAdvice, generateWitnessStatement, generateConfessionAck, generateAuraCheck, generateCosmicAppointment, generateSoulInvoice, summariseMichaelSelf, generateDayChaosBulletin, generateAntichristDenial } from './utils/openai.js';
import { addSelfEphemera, applySelfCondense, buildSelfContextBlock, getSayingsForCondense, recordMichaelSaying, selfNeedsCondense } from './utils/michael-self.js';
import { loadUserMemory, saveUserMemory, getJudgementLabel, needsSummarisation, updateImpression, loadAllMemory, addUnfinishedBusiness, maybeAgeBusiness, addTheme, detectThemeOverlap, patchUserState, updateLastChannel, recordLanguageRequest, getRequestedLanguageCode, userSpeaksUnlockedLanguage, formatCharacterForPrompt, resolveField, ensureUserRecord, addConfession, getRecentConfessions, getOutstandingBusiness, noteGuildInteraction, interactorIdsForGuild, getRelationLandscape, findThemeNeighbours } from './utils/michael-memory.js';
import { ensureMichaelCharacter, runForgivenessRoll, runOnderhandelen, maybePassiveRollBlock, executePassiveRoll } from './utils/michael-rollenspel.js';
import { startGateway } from './utils/gateway.js';
import { getGuildLanguage, setGuildLanguage, resolveLanguage } from './utils/guild-settings.js';
import {
  clearAntichristForGuild,
  getCurrentAntichristUserId,
  getUitverkoreneUserId,
  isAntichristCleansed,
  markAntichristCleansedForGuild,
  setAntichristForGuild,
  setUitverkoreneForGuild,
} from './utils/cosmic-state.js';
import { getUserLanguage, setUserLanguage } from './utils/user-settings.js';
import { getLang } from './utils/lang/index.js';
import {
  getLifeSwitchStatus,
  isMichaelLifeActive,
  toggleChannelLife,
  toggleGuildLife,
} from './utils/life-switch.js';
import { scheduleBusinessResurface } from './utils/unprompted-chat.js';
import {
  amsterdamDateLabel,
  buildDayLawForGuild,
  buildPersonalHoroscopeText,
  buildSubjectDossier,
  formatPersonalHoroscope,
  pickDailyDeliveryMode,
  summarizeCardForChaos,
} from './utils/horoscope.js';
import { applyForgivenessToTodayCard, getTodayCard, getTodayOffices, healChosenOneIfTurnedAntichrist, markDayPosted, recentFeaturedUserIds, wasChannelPostedToday } from './utils/day-ledger.js';

const MANAGE_GUILD = BigInt(0x20);
const MANAGE_CHANNELS = BigInt(0x10);

function memberCanToggleGuild(member) {
  const permissions = BigInt(member?.permissions ?? '0');
  return (permissions & MANAGE_GUILD) !== 0n;
}

function memberCanToggleChannel(member) {
  const permissions = BigInt(member?.permissions ?? '0');
  return (permissions & MANAGE_GUILD) !== 0n || (permissions & MANAGE_CHANNELS) !== 0n;
}

function buildLifeSwitchPayload(lang, guildId, channelId, { forUpdate = false } = {}) {
  const status = getLifeSwitchStatus(guildId, channelId);
  const onOff = (v) => (v ? lang.ui.lifeSwitchOn : lang.ui.lifeSwitchOff);
  const channelLine = status.channelExplicit
    ? onOff(status.channelOn)
    : `${onOff(status.guildOn)} (${lang.ui.lifeSwitchInherit})`;

  const payload = {
    content: lang.ui.lifeSwitchStatus({
      guild: onOff(status.guildOn),
      channel: channelLine,
      effective: onOff(status.effective),
    }),
    components: [{
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `life_channel:${guildId}:${channelId}`,
          label: status.effective ? lang.ui.lifeSwitchBtnChannelOff : lang.ui.lifeSwitchBtnChannelOn,
          style: status.effective ? ButtonStyleTypes.DANGER : ButtonStyleTypes.SUCCESS,
        },
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `life_guild:${guildId}:${channelId}`,
          label: status.guildOn ? lang.ui.lifeSwitchBtnGuildOff : lang.ui.lifeSwitchBtnGuildOn,
          style: status.guildOn ? ButtonStyleTypes.DANGER : ButtonStyleTypes.SUCCESS,
        },
      ],
    }],
  };
  // Ephemeral only on the initial slash response — not on UPDATE_MESSAGE (type 7).
  if (!forUpdate) payload.flags = InteractionResponseFlags.EPHEMERAL;
  return payload;
}

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

// Pending /onderhandelen verzoek texts...  keyed by userId, cleared after use or 10 min
const pendingNegotiations = new Map();

function readNegotiateModalValue(modalData) {
  for (const row of modalData?.components ?? []) {
    for (const c of row.components ?? []) {
      if (c.custom_id === 'negotiate_text') return String(c.value ?? '').trim();
    }
  }
  return '';
}

// All flee/pardon/apology/refusal strings are now in lang packs (utils/lang/{nl,en,ar}.js)
// and accessed via lang.ui.*  throughout the handler.

function giphyStillUrl(pick) {
  const candidates = [
    pick?.images?.downsized_medium?.url,
    pick?.images?.downsized?.url,
    pick?.images?.fixed_height?.url,
    pick?.images?.original?.url,
  ];
  for (const u of candidates) {
    if (typeof u === 'string' && /^https:\/\//i.test(u) && !/\.mp4(\?|$)/i.test(u)) return u;
  }
  return null;
}

const GIPHY_REJECT_RE = /hammer|sledge|construction|demolition|workout|gym|repair|tool|nail|diy|boxing|golf|tennis|baseball|soccer|football|cooking|recipe|car crash|accident|power.?tool/i;

function giphyTitleOk(item) {
  const blob = [item?.title, item?.slug, item?.username].filter(Boolean).join(' ');
  return !GIPHY_REJECT_RE.test(blob);
}

async function fetchGiphyGif(query) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=20&rating=g`;
    const res = await fetch(url);
    const data = await res.json();
    const results = (data.data ?? []).filter((item) => giphyTitleOk(item) && giphyStillUrl(item));
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return giphyStillUrl(pick);
  } catch (err) {
    console.error('Giphy fetch failed:', err);
    return null;
  }
}

function memoryMemberIdsForGuild(guildId) {
  return Object.entries(loadAllMemory())
    .filter(([, mem]) => mem?.lastGuildId === guildId)
    .map(([id]) => id);
}

function shuffleIds(ids) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function fetchGuildHumanMemberIds(guildId, { fallbackIds = [] } = {}) {
  const extras = [...fallbackIds, ...memoryMemberIdsForGuild(guildId)].filter(Boolean);
  try {
    const membersRes = await DiscordRequest(`guilds/${guildId}/members?limit=1000`, { method: 'GET' });
    const members = await membersRes.json();
    if (!Array.isArray(members)) {
      throw new Error(`unexpected members payload: ${JSON.stringify(members).slice(0, 120)}`);
    }
    const ids = members.filter((m) => m.user && !m.user.bot).map((m) => m.user.id);
    return ids.length ? ids : [...new Set(extras)];
  } catch (err) {
    console.error(`[michael] guild members fetch failed | guild=${guildId}:`, err?.message ?? err);
    return [...new Set(extras)];
  }
}

/**
 * Daily / horoscope pool: people who used Michael in this guild.
 * Falls back to members with any dossier, then the full member list.
 */
async function resolveDailyMemberPool(guildId, { fallbackIds = [] } = {}) {
  const members = await fetchGuildHumanMemberIds(guildId, { fallbackIds });
  const memberSet = new Set(members);
  const interactors = interactorIdsForGuild(guildId).filter((id) => !memberSet.size || memberSet.has(id));
  const extras = (fallbackIds ?? []).filter(Boolean);
  let pool;
  let source;
  if (interactors.length >= 2) {
    pool = [...new Set([...interactors, ...extras])];
    source = 'interactors';
  } else {
    const known = members.filter((id) => loadAllMemory()[id]);
    if (known.length >= 2) {
      pool = [...new Set([...known, ...extras])];
      source = 'known-members';
    } else if (members.length) {
      pool = [...new Set([...members, ...extras])];
      source = 'all-members';
    } else {
      pool = [...new Set([...interactors, ...extras])];
      source = 'interactors-fallback';
    }
  }
  console.log(`[michael] daily pool | guild=${guildId} | source=${source} | n=${pool.length} | interactors=${interactors.length}`);
  return pool;
}

async function fetchRandomHumanUserId(guildId, fallbackIds = []) {
  const ids = await resolveDailyMemberPool(guildId, { fallbackIds });
  if (!ids.length) throw new Error('no human members in guild');
  return ids[Math.floor(Math.random() * ids.length)];
}

/** Two different humans when possible (chosen one + antichrist). Rotates away from exclude when the pool allows. */
function pickTwoDistinctIds(ids, { exclude = [] } = {}) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!unique.length) return { first: null, second: null };
  const banned = new Set((exclude ?? []).filter(Boolean));
  const fresh = unique.filter((id) => !banned.has(id));
  const pool = fresh.length >= 2 ? fresh : unique;
  const shuffled = shuffleIds(pool);
  return { first: shuffled[0], second: shuffled[1] ?? shuffled[0] };
}

function assignFreshDailyOffices(guildId, memberIds) {
  const avoid = [
    getUitverkoreneUserId(guildId),
    getCurrentAntichristUserId(guildId),
    ...recentFeaturedUserIds(guildId, 3),
  ];
  const picked = pickTwoDistinctIds(memberIds, { exclude: avoid });
  if (!picked.first) throw new Error('no human members in guild');
  const chosenUserId = picked.first;
  let antichristUserId = picked.second && picked.second !== chosenUserId
    ? picked.second
    : (memberIds.find((id) => id !== chosenUserId) ?? null);
  if (antichristUserId === chosenUserId) antichristUserId = null;
  setUitverkoreneForGuild(guildId, chosenUserId);
  if (antichristUserId) {
    setAntichristForGuild(guildId, antichristUserId, Date.now() + 24 * 60 * 60 * 1000);
  } else {
    clearAntichristForGuild(guildId);
  }
  return { chosenUserId, antichristUserId };
}

/** Put cosmic offices back to today's card. Undoes a /horoscope re-roll after a vacant antichrist seat. */
function syncCosmicOfficesFromTodayCard(guildId) {
  healChosenOneIfTurnedAntichrist(guildId);
  const offices = getTodayOffices(guildId);
  if (!offices || !getTodayCard(guildId)) return null;
  if (offices.chosenUserId) setUitverkoreneForGuild(guildId, offices.chosenUserId);
  const ant = offices.antichristUserId && offices.antichristUserId !== offices.chosenUserId
    ? offices.antichristUserId
    : null;
  if (ant) {
    setAntichristForGuild(guildId, ant, Date.now() + 24 * 60 * 60 * 1000);
    if (offices.antichristCleansed) markAntichristCleansedForGuild(guildId);
  } else {
    clearAntichristForGuild(guildId);
  }
  return {
    chosenUserId: offices.chosenUserId,
    antichristUserId: ant,
    antichristCleansed: Boolean(ant && offices.antichristCleansed),
  };
}

async function buildCosmicAppointmentMessage(guildId, lang, role) {
  const userId = await fetchRandomHumanUserId(guildId);
  const mem = loadUserMemory(userId);
  const username = mem.username || userId;
  const sermon = await generateCosmicAppointment({
    role,
    userId,
    username,
    dossier: buildSubjectDossier(userId, mem, () => role),
    langCode: lang.code ?? 'nl',
  });
  const header = role === 'antichrist' ? lang.antichrist.header : lang.uitverkorene.header;
  const title = role === 'antichrist' ? lang.antichrist.title : lang.uitverkorene.title;
  const content = [header, title, header, '', `<@${userId}>`, '', sermon].join('\n');
  noteMichaelSaid('appointment', sermon, {
    userId,
    username,
    guildId,
    ttlMs: 24 * 60 * 60 * 1000,
    ephemeraText: `I appointed ${username} (<@${userId}>) as ${role} for today.`,
  });
  return { content, embeds: [], userId };
}

async function buildUitverkoreneMessage(guildId, lang) {
  const { content, embeds, userId } = await buildCosmicAppointmentMessage(guildId, lang, 'uitverkorene');
  return { content, embeds, chosenUserId: userId };
}

async function buildAntichristMessage(guildId, lang) {
  const { content, embeds, userId } = await buildCosmicAppointmentMessage(guildId, lang, 'antichrist');
  return { content, embeds, antichristUserId: userId };
}

async function buildDailyBulletin(guildId, lang) {
  const langCode = getGuildLanguage(guildId);
  const memberIds = await resolveDailyMemberPool(guildId);
  const existingCard = getTodayCard(guildId);
  let chosenUserId = getUitverkoreneUserId(guildId);
  let antichristUserId = getCurrentAntichristUserId(guildId);

  if (existingCard) {
    const restored = syncCosmicOfficesFromTodayCard(guildId);
    if (restored) {
      chosenUserId = restored.chosenUserId;
      antichristUserId = restored.antichristUserId;
    }
  } else {
    ({ chosenUserId, antichristUserId } = assignFreshDailyOffices(guildId, memberIds));
  }

  const { card, content, offices: cardOffices } = await buildDayLawForGuild({
    guildId,
    memberIds,
    langCode,
    lang,
    offices: { chosenUserId, antichristUserId },
    getCosmicRole: (uid) => getCosmicRole(uid, guildId),
    title: lang.horoscope.dailyTitle,
  });

  // Chaos delivery: the card and its mechanics stay law (stamps, prophecies,
  // /horoscope reprints the tidy version) — only the morning POST goes feral.
  let finalContent = content;
  const mode = pickDailyDeliveryMode();
  if (mode !== 'normal') {
    try {
      const h = lang.horoscope;
      const chaosText = await generateDayChaosBulletin({
        mode,
        langCode,
        lang,
        dateLabel: amsterdamDateLabel(langCode),
        cardDigest: summarizeCardForChaos(card, cardOffices ?? { chosenUserId, antichristUserId }),
        selfBlock: buildSelfContextBlock(),
      });
      const foot = mode === 'terse' ? '\n....Michael' : ''; // a rant never signs
      finalContent = [h.header, h.dailyTitle, h.dateLine(amsterdamDateLabel(langCode)), '', chaosText]
        .join('\n').slice(0, 1980) + foot;
      recordMichaelSaying(
        mode === 'rant'
          ? "I lost the thread of today's bulletin and never finished it."
          : "I could not be bothered with today's bulletin.",
        { kind: 'day-chaos', guildId },
      );
      console.log(`[michael] daily bulletin | chaos mode=${mode} | guild=${guildId}`);
    } catch (err) {
      console.error('[michael] chaos bulletin failed, using normal card:', err?.message ?? err);
    }
  }

  const gif = await fetchGiphyGif(getHoroscopeGifQuery());
  const embeds = gif ? [{ image: { url: gif } }] : [];
  return { content: finalContent, embeds, chosenUserId, antichristUserId };
}

const app = express();
const PORT = process.env.PORT || 3000;

// Tiny helper...  saves repeating Math.floor(Math.random()…) everywhere
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
  if (guildId && invokingUserId) {
    noteGuildInteraction(
      invokingUserId,
      guildId,
      req.body.member?.user?.username ?? req.body.user?.username ?? '',
    );
  }
  const langCode = resolveLanguage(guildId, invokingUserId);
  const lang = getLang(langCode);
  if (
    type === InteractionType.APPLICATION_COMMAND &&
    isAntichrist(invokingUserId, guildId) &&
    !isUitverkorene(invokingUserId, guildId) &&
    !ANTICHRIST_EXEMPT_COMMANDS.has(data?.name)
  ) {
    // AI-first denial: fresh, personal, never echoes the command. Canned pool
    // only as fallback when generation fails.
    const lawNote = lang.dayLaw?.antichristLaw?.(getTodayCard(guildId)?.forbiddenWord) ?? '';
    res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
    const username = req.body.member?.user?.username ?? req.body.user?.username ?? 'the beast';
    try {
      const mem = loadUserMemory(invokingUserId);
      const denial = await generateAntichristDenial({
        username,
        commandName: data?.name || 'that',
        impression: mem.impression ?? null,
        judgementLabel: getJudgementLabel(mem.judgementScore ?? 0),
        langCode,
      });
      await patchOriginal(req.body.token, { content: `${denial}${lawNote}` });
      noteMichaelSaid('denial', denial, { userId: invokingUserId, username, guildId: guildId ?? null });
    } catch (err) {
      console.error('[michael] antichrist denial AI failed, using pool:', err?.message ?? err);
      const refusalPool = (lang.ui.antichristRefusals ?? lang.ui.nee).filter((r) => !r.includes('{command}'));
      const fallbackPool = refusalPool.length ? refusalPool : (lang.ui.antichristRefusals ?? lang.ui.nee);
      const refusal = pick(fallbackPool).replace(/\{command\}/g, data?.name || 'that');
      try {
        await patchOriginal(req.body.token, { content: `${refusal}${lawNote}` });
      } catch { /* token expired */ }
    }
    return;
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    const interactionCtx = { req, res, data, lang, langCode, guildId };

    // "test" command
    // "feedback"...  DM the bot owner with bug / feature / other reports
    if (name === 'feedback') return handleFeedback(interactionCtx);

    // "trekkaart" command
    if (name === 'drawcard') return handleDrawcard(interactionCtx);

    if (name === 'auracheck') return handleAuracheck(interactionCtx);

    if (name === 'soulinvoice') return handleSoulinvoice(interactionCtx);

    // "uitverkorene" / chosenone (EN localization)
    if (name === 'chosenone') {
      if (!guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.cosmicGuildOnly, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const currentUit = getUitverkoreneUserId(guildId);
      if (currentUit) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: lang.ui.cosmicOccupiedChosen(currentUit),
            components: [{
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                { type: MessageComponentTypes.BUTTON, custom_id: `cosmic_uit_roll:${guildId}`, label: lang.ui.cosmicRollNewChosen, style: ButtonStyleTypes.PRIMARY },
                { type: MessageComponentTypes.BUTTON, custom_id: `cosmic_uit_flee:${guildId}`, label: lang.ui.cosmicFleeCosmic, style: ButtonStyleTypes.SECONDARY },
              ],
            }],
          },
        });
      }
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      try {
        const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(guildId, lang);
        setUitverkoreneForGuild(guildId, chosenUserId);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content, embeds },
        });
      } catch (err) {
        console.error('chosenone error:', err?.message ?? err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.cosmicRollError },
          });
        } catch { /* token expired */ }
      }
      return;
    }

    // "antichrist" command
    if (name === 'antichrist') {
      if (!guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.cosmicGuildOnly, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const currentAnt = getCurrentAntichristUserId(guildId);
      if (currentAnt) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: lang.ui.cosmicOccupiedAnt(currentAnt),
            components: [{
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                { type: MessageComponentTypes.BUTTON, custom_id: `cosmic_ant_roll:${guildId}`, label: lang.ui.cosmicRollNewAnt, style: ButtonStyleTypes.PRIMARY },
                { type: MessageComponentTypes.BUTTON, custom_id: `cosmic_ant_flee:${guildId}`, label: lang.ui.cosmicFleeCosmic, style: ButtonStyleTypes.SECONDARY },
              ],
            }],
          },
        });
      }
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      try {
        const { content, embeds, antichristUserId } = await buildAntichristMessage(guildId, lang);
        setAntichristForGuild(guildId, antichristUserId, Date.now() + 24 * 60 * 60 * 1000);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content, embeds },
        });
      } catch (err) {
        console.error('antichrist error:', err?.message ?? err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.cosmicRollError },
          });
        } catch { /* token expired */ }
      }
      return;
    }

    // "dateer" command
    if (name === 'dateangel') {
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

    // "cosmischestatus"...  who holds antichrist / uitverkorene, + Michael's mood toward you
    if (name === 'michaelmood') return handleMichaelmood(interactionCtx);

    // "vergeefmij"...  roll-based forgiveness (user must click to roll)
    if (name === 'forgiveme') return handleForgiveme(interactionCtx);

    // "mijnrol"...  shows the user their Michael-assigned character sheet
    if (name === 'mycharacter') return handleMycharacter(interactionCtx);

    // "onderhandelen"...  wizard: pick field → modal for wish text → roll buttons
    if (name === 'negotiate') {
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const w        = lang.ui.negotiateWizard;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: w.intro,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [{
              type: MessageComponentTypes.STRING_SELECT,
              custom_id: `negotiate_kind:${userId}`,
              placeholder: w.selectPlaceholder,
              min_values: 1,
              max_values: 1,
              options: [
                { label: w.kindArchetype.label, value: 'archetype', description: w.kindArchetype.description },
                { label: w.kindLineage.label, value: 'lineage', description: w.kindLineage.description },
                { label: w.kindTitle.label, value: 'title', description: w.kindTitle.description },
              ],
            }],
          }],
        },
      });
    }

    // "michaelhumeur"...  shows Michael's current persistent mood toward this user
    // "vibecheck" command...  full points dashboard + improvement tips
    if (name === 'vibecheck') return handleVibecheck(interactionCtx);

    // "chat" command (was praatmetmichael)
    if (name === 'chat') return handleChat(interactionCtx);

    if (name === 'imagine') return handleImagine(interactionCtx);

    if (name === 'listentomichael') return handleListentomichael(interactionCtx);

    if (name === 'witness') return handleWitness(interactionCtx);

    if (name === 'confess') return handleConfess(interactionCtx);

    if (name === 'horoscope') {
      res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

      try {
        const invokerId = req.body.member?.user?.id ?? req.body.user?.id;
        let content;

        if (guildId) {
          const memberIds = await resolveDailyMemberPool(guildId, { fallbackIds: [invokerId] });
          let currentChosen = getUitverkoreneUserId(guildId);
          let currentAntichrist = getCurrentAntichristUserId(guildId);
          const todayCard = getTodayCard(guildId);
          if (todayCard) {
            const restored = syncCosmicOfficesFromTodayCard(guildId);
            if (restored) {
              currentChosen = restored.chosenUserId;
              currentAntichrist = restored.antichristUserId;
            }
          } else if (!currentChosen && !currentAntichrist) {
            ({ chosenUserId: currentChosen, antichristUserId: currentAntichrist } =
              assignFreshDailyOffices(guildId, memberIds));
          }
          const law = await buildDayLawForGuild({
            guildId,
            memberIds,
            langCode,
            lang,
            offices: { chosenUserId: currentChosen, antichristUserId: currentAntichrist },
            getCosmicRole: (uid) => getCosmicRole(uid, guildId),
            title: lang.horoscope.commandTitle,
          });
          content = law.content;
        } else {
          const horoscopeBody = await buildPersonalHoroscopeText(invokerId, langCode, lang);
          content = formatPersonalHoroscope(lang, {
            dateLabel: amsterdamDateLabel(langCode),
            horoscopeBody,
          });
        }

        if (!content?.trim()) throw new Error('horoscope content empty after formatting');

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: content.slice(0, DISCORD_MESSAGE_CONTENT_MAX), embeds: [] },
        });
        console.log(`[michael] horoscope | guild=${guildId ?? 'dm'} | user=${invokerId}`);
      } catch (err) {
        console.error('horoscope error:', err?.message ?? err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.horoscopeError },
          });
        } catch { /* token expired */ }
      }
      return;
    }

    // "switchoflife"...  toggle Michael's proactive presence per channel or server
    if (name === 'switchoflife') {
      if (!guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.lifeSwitchGuildOnly, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const channelId = req.body.channel_id ?? req.body.channel?.id;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: buildLifeSwitchPayload(lang, guildId, channelId),
      });
    }

    if (name === 'setlanguage') {
      // DM context...  no guild, so set per-user language instead
      if (!guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: lang.ui.michaeltaalPromptDM ?? lang.ui.michaeltaalPrompt,
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [{
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaaldm_nl:${invokingUserId}`, label: lang.ui.michaeltaalBtnNl, style: ButtonStyleTypes.SECONDARY },
                { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaaldm_en:${invokingUserId}`, label: lang.ui.michaeltaalBtnEn, style: ButtonStyleTypes.SECONDARY },
              ],
            }],
          },
        });
      }

      // Guild context...  requires Manage Guild permission
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
              { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaal_nl:${guildId}`, label: lang.ui.michaeltaalBtnNl, style: ButtonStyleTypes.SECONDARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `michaeltaal_en:${guildId}`, label: lang.ui.michaeltaalBtnEn, style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  // ── Negotiation wizard: modal submit (text for chosen field) ─────────────
  if (type === InteractionType.MODAL_SUBMIT) {
    const mid = data.custom_id ?? '';
    if (mid.startsWith('negotiate_modal:')) {
      const parts   = mid.split(':');
      const kind    = parts[1];
      const ownerId = parts[2];
      const uid = req.body.member?.user?.id ?? req.body.user?.id;
      if (uid !== ownerId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      if (!['archetype', 'lineage', 'title'].includes(kind)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.negotiateWizard.invalidKind, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const verzoek = readNegotiateModalValue(data);
      if (!verzoek) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.negotiateWizard.emptyWish, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      pendingNegotiations.set(ownerId, {
        verzoek,
        negotiationKind: kind,
        username: req.body.member?.user?.username ?? req.body.user?.username,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      const w = lang.ui.negotiateWizard;
      const ui = lang.ui;
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `${ui.onderhandelenRegisterHeader}\n${w.confirm(kind, verzoek)}${w.confirmFooter}`,
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_roll:${ownerId}`, label: ui.onderhandelenRollButton, style: ButtonStyleTypes.PRIMARY },
              { type: MessageComponentTypes.BUTTON, custom_id: `onderhandelen_flee:${ownerId}`, label: ui.onderhandelenFleeButton, style: ButtonStyleTypes.SECONDARY },
            ],
          }],
        },
      });
    }
    return res.status(400).json({ error: 'unknown modal' });
  }

  // Handle date button interactions
  // custom_id format: date_rN_{invokerUserId}_{path}
  // Each handler reads the current message content and APPENDS to it, building the full story.
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id != null ? String(data.custom_id) : '';
    const prev = req.body.message?.content ?? '';
    const SEP = '\n\n                    ·  ·  ·\n\n';

    // ── Long-reply decision box: share with the group or keep private ─────
    if (componentId.startsWith('longreply_share:') || componentId.startsWith('longreply_keep:')) {
      const stashId = componentId.split(':')[1];
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;
      const entry = peekLongReply(stashId);
      if (entry && clickerId !== entry.userId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      if (!entry) {
        return res.send({
          type: InteractionResponseType.UPDATE_MESSAGE,
          data: {
            content: `${prev}\n\n*${langCode === 'nl' ? 'Het zegel is verlopen.' : 'The seal has expired.'}*`.slice(0, DISCORD_MESSAGE_CONTENT_MAX),
            components: [],
          },
        });
      }
      takeLongReply(stashId);
      const share = componentId.startsWith('longreply_share:');
      const note = share
        ? (langCode === 'nl' ? 'Gedeeld met de groep.' : 'Shared with the group.')
        : (langCode === 'nl' ? 'Verzegeld. Alleen jij hebt dit gezien.' : 'Sealed. Only you have seen this.');
      res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: { content: `${prev}\n\n*${note}*`.slice(0, DISCORD_MESSAGE_CONTENT_MAX), components: [] },
      });
      if (share && entry.channelId) {
        try {
          const payload = {
            content: String(entry.content ?? '').slice(0, DISCORD_MESSAGE_CONTENT_MAX),
            ...(entry.embeds ? { embeds: entry.embeds } : {}),
          };
          if (entry.files?.length) {
            await DiscordMultipart(`channels/${entry.channelId}/messages`, { method: 'POST', payload, files: entry.files });
          } else {
            await DiscordRequest(`channels/${entry.channelId}/messages`, { method: 'POST', body: payload });
          }
        } catch (err) {
          console.error('[michael] longreply share failed:', err?.message ?? err);
        }
      }
      console.log(`[michael] longreply | ${share ? 'shared' : 'kept'} | user=${clickerId}`);
      return;
    }

    // ── Negotiation wizard: string select → open modal for text ───────────
    if (componentId.startsWith('negotiate_kind:')) {
      const ownerId   = componentId.split(':')[1];
      const clickerId = req.body.member?.user?.id ?? req.body.user?.id;
      if (clickerId !== ownerId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.notYourRite, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const kind = data.values?.[0];
      if (!['archetype', 'lineage', 'title'].includes(kind)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.negotiateWizard.invalidKind, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const w = lang.ui.negotiateWizard;
      return res.send({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `negotiate_modal:${kind}:${ownerId}`,
          title: w.modalTitle[kind].slice(0, 45),
          components: [{
            type: MessageComponentTypes.ACTION_ROW,
            components: [{
              type: MessageComponentTypes.INPUT_TEXT,
              custom_id: 'negotiate_text',
              label: w.modalLabel.slice(0, 45),
              style: TextStyleTypes.PARAGRAPH,
              min_length: 1,
              max_length: 300,
              placeholder: w.modalPlaceholder.slice(0, 100),
              required: true,
            }],
          }],
        },
      });
    }

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

      // Roll path...  immediately update message with loading state + disabled buttons, then patch result
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

        const { forgiven, narrative, roll, need, newMood, oordeelDelta, antichristCleansed } =
          await runForgivenessRoll(ownerId, username, currentMood, moodIdx, langCode, req.body.guild_id ?? null);

        const rl = lang.rollUI;
        const sign = roll.modifier >= 0 ? '+' : '−';
        const oordeelSign = oordeelDelta > 0 ? '+' : '';
        const header = forgiven ? '🕊️✨🕊️✨🕊️' : '🔥💢🔥💢🔥';
        const moodValue = forgiven
          ? `${moodName(lang, currentMood)} → ${moodName(lang, newMood)}`
          : `${moodName(lang, currentMood)} *(${rl.moodUnchanged})*`;
        console.log(`[michael] vergeefmij | ${username} | roll=${roll.total} need=${need} forgiven=${forgiven}`);

        if (forgiven && req.body.guild_id) {
          applyForgivenessToTodayCard(req.body.guild_id, {
            userId: ownerId,
            antichristCleansed,
            langCode,
          });
        }

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: header,
            embeds: [{
              color: forgiven ? 0x22c55e : 0xef4444,
              title: rl.registerLabel,
              description: narrative,
              fields: [
                { name: rl.rollLabel,      value: `${roll.raw} ${sign}${Math.abs(roll.modifier)} = **${roll.total}**`, inline: true },
                { name: rl.thresholdLabel, value: `${need}`,                                                            inline: true },
                { name: rl.outcomeLabel,   value: forgiven ? `✅ ${rl.succeededLabel}` : `❌ ${rl.failedLabel}`,        inline: true },
                { name: rl.moodLabel,      value: moodValue,                                                             inline: false },
                { name: rl.judgementLabel, value: `${oordeelSign}${oordeelDelta}`,                                       inline: true },
                ...(antichristCleansed
                  ? [{ name: rl.stainLabel ?? 'Stain', value: lang.ui.antichristCleansed ?? 'The seat remains; the office is inactive.', inline: false }]
                  : []),
              ],
            }],
            components: [],
          },
        });

        // Divine pardon...  scheduled AFTER successful send so it only fires if the user saw the result
        if (
          isMichaelLifeActive(req.body.guild_id, req.body.channel_id) &&
          !forgiven &&
          roll.tier.key === 'poor' &&
          Math.random() < 0.5
        ) {
          const channelId = req.body.channel_id;
          const delayMs = (2 + Math.floor(Math.random() * 4)) * 60 * 1000; // 2 to 5 min
          setTimeout(async () => {
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
        console.error('[michael] vergeefmij button error:', err.message);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: pick(lang.ui.apologyRejected), components: [] },
          });
        } catch { /* token expired...  nothing to patch */ }
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
        const { verzoek, username, negotiationKind } = pending;
        const { narrative, roll, dc, success, mechanical, oordeelDelta } =
          await runOnderhandelen(ownerId, username, verzoek, langCode, negotiationKind ?? null);

        const rl = lang.rollUI;
        const sign = roll.modifier >= 0 ? '+' : '−';
        const oordeelSign = oordeelDelta > 0 ? '+' : '';
        const header = success ? '📜✨📜✨📜' : '🔥📜🔥📜🔥';
        console.log(`[michael] onderhandelen | ${username} | roll=${roll.total} dc=${dc} success=${success} | ${verzoek.slice(0, 50)}`);

        // Build a human-readable one-liner for what the negotiation changed
        const mechanicalSummary = (() => {
          if (!mechanical) return null;
          const mr = lang.mijnrol ?? {};
          const sn = mr.statNames ?? {};
          const rv = (v) => typeof v === 'object' ? resolveField(v, langCode) : (v ?? '');
          if (mechanical.kind === 'stat') {
            const label = sn[mechanical.field] ?? mechanical.field;
            const d = mechanical.delta ?? 1;
            return `${label} ${d > 0 ? '+' : ''}${d}`;
          }
          if (mechanical.kind === 'title_worse') return rv(mechanical.newValue).slice(0, 80) || null;
          if (mechanical.kind === 'title')       return rv(mechanical.newValue).slice(0, 80) || null;
          if (mechanical.kind === 'archetype')   return rv(mechanical.newValue) || null;
          if (mechanical.kind === 'lineage')     return rv(mechanical.newValue) || null;
          return null;
        })();
        const statPenaltySummary = mechanical?.statPenalty
          ? ` / ${(lang.mijnrol?.statNames ?? {})[mechanical.statPenalty] ?? mechanical.statPenalty} −1`
          : '';
        const changeValue = mechanicalSummary
          ? `${mechanicalSummary}${statPenaltySummary}`
          : '...  ';

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: header,
            embeds: [{
              color: success ? 0x22c55e : 0xef4444,
              title: rl.registerLabel,
              description: `*"${verzoek.slice(0, 200)}"*\n\n${narrative}`,
              fields: [
                { name: rl.rollLabel,      value: `${roll.raw} ${sign}${Math.abs(roll.modifier)} = **${roll.total}**`, inline: true },
                { name: rl.thresholdLabel, value: `${dc}`,                                                              inline: true },
                { name: rl.outcomeLabel,   value: success ? `✅ ${rl.succeededLabel}` : `❌ ${rl.failedLabel}`,         inline: true },
                { name: rl.judgementLabel, value: `${oordeelSign}${oordeelDelta}`,                                       inline: true },
                { name: rl.changeLabel,    value: changeValue,                                                           inline: true },
              ],
            }],
            components: [],
          },
        });

        // Divine pardon...  scheduled AFTER successful send so it only fires if the user saw the result
        if (
          isMichaelLifeActive(req.body.guild_id, req.body.channel_id) &&
          !success &&
          roll.tier.key === 'poor' &&
          Math.random() < 0.5
        ) {
          const channelId = req.body.channel_id;
          const delayMs = (2 + Math.floor(Math.random() * 4)) * 60 * 1000; // 2 to 5 min
          setTimeout(async () => {
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
        console.error('[michael] onderhandelen button error:', err.message);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.onderhandelenError, components: [] },
          });
        } catch { /* token expired...  nothing to patch */ }
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

      // Roll path...  disable buttons immediately, then patch with result
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
        const { roll, oordeelDelta } = executePassiveRoll(ownerId);
        const rl = lang.rollUI;
        const sign = roll.modifier >= 0 ? '+' : '−';
        const tierLabel = (lang.rollTierLabels ?? {})[roll.tier.key] ?? roll.tier.label;
        const oordeelSign = oordeelDelta > 0 ? '+' : '';
        const color = (roll.tier.key === 'poor' || roll.tier.key === 'weak')
          ? 0xef4444
          : (roll.tier.key === 'acceptable' ? 0xf59e0b : 0x22c55e);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: prev,
            embeds: [{
              color,
              title: rl.registerLabel,
              fields: [
                { name: rl.rollLabel, value: `${roll.raw} ${sign}${Math.abs(roll.modifier)} = **${roll.total}**`, inline: true },
                { name: rl.outcomeLabel, value: tierLabel, inline: true },
                { name: rl.judgementLabel, value: `${oordeelSign}${oordeelDelta}`, inline: true },
              ],
            }],
            components: [],
          },
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

    // ── Cosmic: replace chosen one / antichrist (roll or flee) ───────────────
    const cosmic = parseCosmicComponentId(componentId);
    if (cosmic) {
      if (cosmic.action === 'flee') {
        return res.send({
          type: 7,
          data: { content: lang.ui.cosmicFledReplace, components: [] },
        });
      }

      const { guildId: gid, kind } = cosmic;
      res.send({ type: 6 });
      try {
        const rollLang = getLang(getGuildLanguage(gid));
        if (kind === 'uit') {
          const { content, embeds, chosenUserId } = await buildUitverkoreneMessage(gid, rollLang);
          setUitverkoreneForGuild(gid, chosenUserId);
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content, embeds, components: [] },
          });
        } else {
          const { content, embeds, antichristUserId } = await buildAntichristMessage(gid, rollLang);
          setAntichristForGuild(gid, antichristUserId, Date.now() + 24 * 60 * 60 * 1000);
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content, embeds, components: [] },
          });
        }
      } catch (err) {
        console.error(`[michael] cosmic_${kind}_roll:`, err.message);
        try {
          const errLang = getLang(getGuildLanguage(gid));
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: errLang.ui.cosmicRollError, components: [] },
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
        const morningMsg = await generateMorningAfter(invokerUsername, datePath, morningChoice, langCode, invokerMem.impression ?? null);
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

    // ── Life switch buttons (/switchoflife) ─────────────────────────────────
    if (componentId.startsWith('life_channel:') || componentId.startsWith('life_guild:')) {
      const parts = componentId.split(':');
      const scope = parts[0];
      const targetGuildId = parts[1];
      const targetChannelId = parts[2];
      const member = req.body.member;
      const isChannel = scope === 'life_channel';

      if (!targetGuildId || !targetChannelId) {
        return res.status(400).json({ error: 'invalid life switch id' });
      }
      if (targetGuildId !== guildId) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.lifeSwitchGuildOnly, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      if (isChannel && !memberCanToggleChannel(member)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.lifeSwitchNoPermissionChannel, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      if (!isChannel && !memberCanToggleGuild(member)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.lifeSwitchNoPermissionGuild, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      const toggleLang = getLang(resolveLanguage(targetGuildId, req.body.member?.user?.id ?? req.body.user?.id));
      const turnedOn = isChannel
        ? toggleChannelLife(targetGuildId, targetChannelId)
        : toggleGuildLife(targetGuildId);
      const note = isChannel
        ? toggleLang.ui.lifeSwitchToggledChannel(turnedOn)
        : toggleLang.ui.lifeSwitchToggledGuild(turnedOn);
      const payload = buildLifeSwitchPayload(toggleLang, targetGuildId, targetChannelId, { forUpdate: true });
      payload.content = `${note}\n\n${payload.content}`;

      return res.send({ type: 7, data: payload });
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

      const newLangCode = componentId.replace('michaeltaal_', '').split(':')[0]; // nl / en
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
      const newLangCode = componentId.replace('michaeltaaldm_', '').split(':')[0]; // nl / en
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

// ─── Unfinished-business housekeeping ─────────────────────────────────────────
// Unprompted snark (life-switch) + business resurfacing live in utils/unprompted-chat.js.
cron.schedule('*/15 * * * *', () => {
  const allMem = loadAllMemory();
  Object.keys(allMem).forEach((uid) => maybeAgeBusiness(uid));
});

async function postDailyBulletin(guildId, channelId, label) {
  if (!guildId || !channelId) return;
  if (isDutchQuietHoursForUnpromptedSends()) {
    console.log(`[michael] daily bulletin skipped | ${label} | Dutch quiet hours`);
    return;
  }
  if (wasChannelPostedToday(guildId, channelId)) {
    console.log(`[michael] daily bulletin skipped | ${label} | already posted to ${channelId}`);
    return;
  }
  const cronLangCode = getGuildLanguage(guildId);
  const cronLang = getLang(cronLangCode);
  const { content, embeds, chosenUserId, antichristUserId } = await buildDailyBulletin(guildId, cronLang);
  await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content,
      embeds,
      flags: MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
    },
  });
  markDayPosted(guildId, channelId);
  console.log(`[michael] daily bulletin posted | ${label} | ch=${channelId} | chosen=${chosenUserId} | antichrist=${antichristUserId}`);
}

// Moons Grill (UK): 11:00 Amsterdam = 10:00 UK while BST is in effect.
// Guilds created before Aug 2017 have a default #general whose channel id equals the guild id.
const MOONS_GRILL_GUILD_ID = '183545688859213834';
const MOONS_GRILL_CHANNEL_ID = '183545688859213834';

function isMoonsGrillDailyTarget(guildId, channelId) {
  return String(guildId ?? '') === MOONS_GRILL_GUILD_ID
    || String(channelId ?? '') === MOONS_GRILL_CHANNEL_ID;
}

/** Channel snowflake for the post; guild id for the card (lookup if the two constants match). */
async function moonsGrillTargets() {
  const channelId = MOONS_GRILL_CHANNEL_ID;
  let guildId = MOONS_GRILL_GUILD_ID;
  try {
    const res = await DiscordRequest(`channels/${channelId}`, { method: 'GET' });
    const ch = await res.json();
    if (ch.guild_id) guildId = ch.guild_id;
  } catch (err) {
    console.warn(`[michael] Moons Grill channel lookup failed | using guild=${guildId}:`, err?.message ?? err);
  }
  return { guildId, channelId };
}

// Default daily card...  10:00 Amsterdam, DAILY_GUILD_ID + DAILY_CHANNEL_ID
// Moons Grill is excluded here so it only fires at 11:00 (UK morning).
cron.schedule('0 10 * * *', async () => {
  try {
    const guildId = process.env.DAILY_GUILD_ID;
    const channelId = process.env.DAILY_CHANNEL_ID;
    if (isMoonsGrillDailyTarget(guildId, channelId)) {
      console.log('[michael] daily bulletin 10:00 skipped | Moons Grill posts at 11:00 Amsterdam');
      return;
    }
    await postDailyBulletin(guildId, channelId, '10:00');
  } catch (err) {
    console.error('Daily bulletin failed (10:00):', err);
  }
}, { timezone: 'Europe/Amsterdam' });

cron.schedule('0 11 * * *', async () => {
  try {
    const { guildId, channelId } = await moonsGrillTargets();
    await postDailyBulletin(guildId, channelId, '11:00-moons-grill');
  } catch (err) {
    console.error('Daily bulletin failed (11:00 Moons Grill):', err);
  }
}, { timezone: 'Europe/Amsterdam' });

registerDeployWebhook(app);

// ── Global crash guards ────────────────────────────────────────────────────────
// Prevent PM2 restarts from uncaught async errors...  log and stay up instead.
process.on('uncaughtException', (err) => {
  console.error('[michael] uncaughtException...  staying alive:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[michael] unhandledRejection...  staying alive:', msg);
});

async function logDiscordIdentity() {
  try {
    const meRes = await DiscordRequest('users/@me', { method: 'GET' });
    const me = await meRes.json();
    const appRes = await DiscordRequest('oauth2/applications/@me', { method: 'GET' });
    const app = await appRes.json();
    const envApp = process.env.APP_ID;
    console.log(`[michael] discord identity | bot=${me.username} (${me.id}) | tokenApp=${app.id} (${app.name}) | env APP_ID=${envApp} | match=${app.id === envApp}`);
  } catch (err) {
    console.error('[michael] discord identity check failed:', err?.message ?? err);
  }
}

function amsterdamHour() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
}

async function catchUpElevenAmBulletin() {
  const hour = amsterdamHour();
  if (hour < 11 || hour >= 22) return;
  try {
    const { guildId, channelId } = await moonsGrillTargets();
    if (wasChannelPostedToday(guildId, channelId)) return;
    console.log('[michael] daily bulletin 11:00 catch-up | Moons Grill');
    await postDailyBulletin(guildId, channelId, '11:00-moons-grill-catchup');
  } catch (err) {
    console.error('Daily bulletin catch-up failed (11:00 Moons Grill):', err);
  }
}

function restoreKnownGuildOffices() {
  const ids = new Set([process.env.DAILY_GUILD_ID, MOONS_GRILL_GUILD_ID].filter(Boolean));
  for (const gid of ids) {
    if (!getTodayCard(gid)) continue;
    const restored = syncCosmicOfficesFromTodayCard(gid);
    if (restored) {
      console.log(`[michael] restored offices from today's card | guild=${gid} | chosen=${restored.chosenUserId} | antichrist=${restored.antichristUserId}`);
    }
  }
}

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  logDiscordIdentity();
  startGateway();
  restoreKnownGuildOffices();
  catchUpElevenAmBulletin();
});
