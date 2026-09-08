// Slash-command handlers moved verbatim from app.js.
// ctx = { req, res, data, lang, langCode, guildId }.

import { InteractionResponseType, InteractionResponseFlags, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import {
  addDiscordReaction,
  appendEditWithinDiscordLimit,
  DiscordRequest,
  DiscordMultipart,
  DISCORD_MESSAGE_CONTENT_MAX,
  isDutchQuietHoursForUnpromptedSends,
  MESSAGE_FLAG_SUPPRESS_NOTIFICATIONS,
  sendDmToUser,
} from '../utils.js';
import {
  BAIT_RE, CODE_REQUEST_RE, FEEDBACK_OWNER_ID, INSULT_RE, MICHAEL_MOODS,
  buildChatRegisterBlock, buildRelationsBlock, buildWitnessDossier, collectRegisterSubjects,
  fileUnfinishedBusiness, getCosmicRole, isAntichrist, isUitverkorene, moodName, nextMood,
  noteMichaelSaid, patchOriginal, pick, reactScoreArrow, resolveSlashUser,
  schedulePostRevision, slashOptionValue, startTypingLoop, withDeferredReply,
} from '../utils/interaction-kit.js';
import { generateMichaelMessage, summariseUserHistory, generateVibecheckComment, scoreMichaelMessage, generateMijnRolComment, generateMichaelImage, generateMichaelVoiceAdvice, generateWitnessStatement, generateConfessionAck, generateAuraCheck, generateSoulInvoice } from '../utils/openai.js';
import { loadUserMemory, saveUserMemory, getJudgementLabel, needsSummarisation, updateImpression, loadAllMemory, addTheme, detectThemeOverlap, patchUserState, recordLanguageRequest, getRequestedLanguageCode, userSpeaksUnlockedLanguage, formatCharacterForPrompt, resolveField, ensureUserRecord, addConfession, getRecentConfessions, getOutstandingBusiness, michaelRollTier } from '../utils/michael-memory.js';
import { addSelfEphemera, buildSelfContextBlock, recordMichaelSaying } from '../utils/michael-self.js';
import { ensureMichaelCharacter, maybePassiveRollBlock } from '../utils/michael-rollenspel.js';
import { getCurrentAntichristUserId, getUitverkoreneUserId, isAntichristCleansed } from '../utils/cosmic-state.js';
import { buildSubjectDossier } from '../utils/horoscope.js';
import { getTodayCard } from '../utils/day-ledger.js';

export async function handleFeedback(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const soort = slashOptionValue(data, 'kind') || 'other';
      const rawBericht = slashOptionValue(data, 'message');
      const bericht = String(rawBericht).trim().replace(/`/g, "'");
      if (!bericht) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.feedbackEmpty, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username ?? 'unknown';
      const channelId = req.body.channel_id ?? req.body.channel?.id ?? '?';
      const kindLabel = { bug: 'Bug', feature: 'Feature', other: 'Other' }[soort] ?? soort;
      const loc = guildId
        ? `Server: ${guildId}\nKanaal: ${channelId}`
        : 'Locatie: DM';
      const header =
        `**Michael feedback**\nSoort: ${kindLabel}\nVan: ${username} (<@${userId}>)\nUser-ID: ${userId}\n${loc}\n\nBericht:\n`;
      const maxUser = Math.max(0, DISCORD_MESSAGE_CONTENT_MAX - header.length);
      const dmBody = header + bericht.slice(0, maxUser);

      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: InteractionResponseFlags.EPHEMERAL },
      });

      try {
        await sendDmToUser(FEEDBACK_OWNER_ID, dmBody);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: lang.ui.feedbackThanks, flags: InteractionResponseFlags.EPHEMERAL },
        });
      } catch (err) {
        console.error('feedback DM error:', err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.feedbackError, flags: InteractionResponseFlags.EPHEMERAL },
          });
        } catch { /* token expired */ }
      }
      return;
}

export async function handleDrawcard(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
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

export async function handleAuracheck(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const scannerId = req.body.member?.user?.id ?? req.body.user?.id;
      const scannerName = req.body.member?.user?.username ?? req.body.user?.username;
      const { targetId, username: targetUsername } = resolveSlashUser(req, scannerId, scannerName);
      ensureUserRecord(targetId, targetUsername);
      const memory = loadUserMemory(targetId);
      const dossier = buildWitnessDossier(targetId, targetUsername, memory, guildId, lang, langCode);
      const header = (lang.auracheck ?? lang.aurascan).header?.(targetUsername)
        ?? `🔮 **AURA: ${targetUsername}**`;

      await withDeferredReply(req, res, { errorContent: lang.ui.auracheckError ?? lang.ui.vibecheckError }, async ({ patch }) => {
        const reading = await generateAuraCheck(targetUsername, dossier, {
          scannerName,
          langCode,
        });
        await patch({ content: `${header}\n\n${reading}`.slice(0, DISCORD_MESSAGE_CONTENT_MAX) });
        noteMichaelSaid('aura', reading, { userId: targetId, username: targetUsername, guildId: guildId ?? null });
        console.log(`[michael] auracheck | subject=${targetUsername} (${targetId}) | by=${scannerName}`);
      });
      return;
}

export async function handleSoulinvoice(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const requesterId = req.body.member?.user?.id ?? req.body.user?.id;
      const requesterName = req.body.member?.user?.username ?? req.body.user?.username;
      const { targetId, username: targetUsername } = resolveSlashUser(req, requesterId, requesterName);
      ensureUserRecord(targetId, targetUsername);
      const memory = loadUserMemory(targetId);
      const dossier = buildWitnessDossier(targetId, targetUsername, memory, guildId, lang, langCode);
      const header = langCode === 'nl'
        ? `🧾 **HEMELSE FACTUUR — ${targetUsername}**`
        : `🧾 **CELESTIAL INVOICE — ${targetUsername}**`;

      await withDeferredReply(req, res, { errorContent: lang.ui.auracheckError ?? lang.ui.vibecheckError }, async ({ patch }) => {
        const invoice = await generateSoulInvoice(targetUsername, dossier, {
          requesterName,
          langCode,
        });
        await patch({ content: `${header}\n\n${invoice}`.slice(0, DISCORD_MESSAGE_CONTENT_MAX) });
        noteMichaelSaid('invoice', invoice, {
          userId: targetId,
          username: targetUsername,
          guildId: guildId ?? null,
          ttlMs: 48 * 60 * 60 * 1000,
          ephemeraText: `I billed ${targetUsername} (<@${targetId}>). Payment is outstanding.`,
        });
        console.log(`[michael] soulinvoice | billed=${targetUsername} (${targetId}) | by=${requesterName}`);
      });
      return;
}

export async function handleMichaelmood(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const invokerId    = req.body.member?.user?.id ?? req.body.user?.id;
      const antichristId = guildId ? getCurrentAntichristUserId(guildId) : null;
      const uitId        = guildId ? getUitverkoreneUserId(guildId) : null;
      const antichristInactive = Boolean(guildId && antichristId && isAntichristCleansed(guildId));

      const fireRow  = '👹🔥👹🔥👹🔥👹🔥👹🔥';
      const eyeRow   = '⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️⚡🌩️👁️';
      const calmRow  = '✨👁️✨';

      const cs = lang.cosmicStatus;
      const antichristLine = antichristId
        ? (antichristInactive
          ? (cs.antichristCleansedSeat?.(antichristId, calmRow) ?? cs.antichristActive(antichristId, fireRow))
          : cs.antichristActive(antichristId, fireRow))
        : cs.antichristNone(calmRow);
      const uitLine = uitId ? cs.uitverkoreneActive(uitId, eyeRow) : cs.uitverkoreneNone(eyeRow);

      const invokerMood  = loadUserMemory(invokerId).currentMood ?? 'afwezig';
      const humeurLines  = lang.humeurLines[invokerMood] ?? lang.humeurLines['afwezig'];
      const moodBlock    = `\n\n──────────────────\n${cs.moodTowardYou}\n${pick(humeurLines)}\n${cs.moodLabel(moodName(lang, invokerMood))}`;

      const header = cs.header(eyeRow);
      const card = guildId ? getTodayCard(guildId) : null;
      const lawBlock = card
        ? `\n\n${lang.horoscope.divider}\n**${lang.horoscope.moodLabel}:** ${card.mood}${card.amendment ? `\n${card.amendment}` : ''}\n**${lang.dayLaw.forbiddenLabel}:** ${card.forbiddenWord}`
        : '';

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `${header}\n${antichristLine}\n\n${uitLine}${moodBlock}${lawBlock}` },
      });
}

export async function handleVibecheck(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
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
          getCosmicRole(userId, guildId),
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
          lines.push(`${vc.kosmischeRolLabel}    ${resolveField(character.archetype, langCode)} • ${resolveField(character.lineage, langCode)}...  *${resolveField(character.title, langCode).slice(0, 60)}*`);
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

export async function handleWitness(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const { targetId, username: targetUsername } = resolveSlashUser(req, userId, username);
      ensureUserRecord(targetId, targetUsername);
      const memory = loadUserMemory(targetId);
      const g = lang.getuigenis ?? lang.vibecheck;
      const label = getJudgementLabel(memory.judgementScore ?? 0);
      const dossier = buildWitnessDossier(targetId, targetUsername, memory, guildId, lang, langCode);

      await withDeferredReply(req, res, { errorContent: lang.ui.getuigenisError }, async ({ patch }) => {
        const sermon = await generateWitnessStatement(targetUsername, dossier, langCode);
        const lines = [
          g.header(targetUsername),
          '',
          `${g.oordeelLabel}  ${label}  *(${memory.judgementScore ?? 0})*`,
          '',
          sermon,
        ];
        await patch({ content: lines.join('\n') });
        noteMichaelSaid('witness', sermon, { userId: targetId, username: targetUsername, guildId: guildId ?? null });
        console.log(`[michael] getuigenis | subject=${targetUsername} (${targetId}) | by=${username}`);
      });
      return;
}

export async function handleConfess(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const confession = slashOptionValue(data, 'confession');
      const channelId = req.body.channel_id ?? req.body.channel?.id;

      if (!confession) {
        console.warn('[michael] confess empty | options=', (data.options ?? []).map((o) => o.name).join(','));
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: lang.ui.biechtEmpty, flags: InteractionResponseFlags.EPHEMERAL },
        });
      }

      const { targetId, username: targetUsername } = resolveSlashUser(req, userId, username);
      const aboutSelf = targetId === userId;
      const safeConfession = confession.replace(/\n+/g, ' ').replace(/`/g, "'").slice(0, 500);

      ensureUserRecord(targetId, targetUsername);
      ensureUserRecord(userId, username);

      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: InteractionResponseFlags.EPHEMERAL },
      });

      try {
        const scoreDelta = await scoreMichaelMessage(safeConfession);
        const appliedDelta = aboutSelf
          ? scoreDelta
          : (scoreDelta <= 0 ? scoreDelta : -1);

        addConfession(targetId, targetUsername, {
          confessorId: userId,
          confessorName: username,
          text: safeConfession,
          aboutSelf,
        });

        patchUserState(targetId, appliedDelta, null);

        if (!aboutSelf && scoreDelta <= -1) {
          fileUnfinishedBusiness(targetId, targetUsername, {
            prompt: safeConfession,
            reason: `Biecht over hen door ${username}`,
            severity: scoreDelta <= -2 ? 3 : 2,
            channelId,
          }, guildId ?? null);
        } else if (aboutSelf && scoreDelta <= -2) {
          fileUnfinishedBusiness(userId, username, {
            prompt: safeConfession,
            reason: 'Zware biecht — Michael vergeet het niet',
            severity: 3,
            channelId,
          }, guildId ?? null);
        }

        const ack = await generateConfessionAck({
          confessorName: username,
          targetName: targetUsername,
          confession: safeConfession,
          aboutSelf,
          langCode,
        });
        const reply = String(ack || lang.ui.biechtError).slice(0, DISCORD_MESSAGE_CONTENT_MAX);

        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: reply },
        });
        console.log(`[michael] confess | target=${targetUsername} (${targetId}) | by=${username} | aboutSelf=${aboutSelf}`);
      } catch (err) {
        console.error('confess error:', err?.message ?? err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: lang.ui.biechtError },
          });
        } catch { /* token expired */ }
      }
      return;
}

