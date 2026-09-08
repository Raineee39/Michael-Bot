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

export async function handleChat(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userInput = slashOptionValue(data, 'message');
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const safeInput = userInput.trim().replace(/\n+/g, ' ').replace(/`/g, "'");
      // Load persisted mood...  first-time users get a random starting point
      const preMemory = loadUserMemory(userId);
      const currentScore = preMemory.judgementScore ?? 0;
      const storedMood = preMemory.currentMood ?? MICHAEL_MOODS[Math.floor(Math.random() * MICHAEL_MOODS.length)];
      // Insults trigger immediate woedend...  no waiting for next message
      const mood = INSULT_RE.test(userInput) ? 'woedend' : storedMood;
      const channelId = req.body.channel_id ?? req.body.channel?.id;

      // Respond immediately with a chaotic placeholder...  avoids Discord's "X is thinking…" entirely
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelPlaceholders)}` },
      });

      // Feature 3...  Bait / forcing-Michael trap: respond coldly and queue unfinished business
      if (BAIT_RE.test(userInput)) {
        console.log(`[michael] chat | bait-dismissal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -1, nextMood(mood, -1), channelId, guildId ?? null);
        fileUnfinishedBusiness(userId, username, {
          prompt:   userInput,
          reason:   'De gebruiker probeerde Michael te commanderen of te dwingen te reageren',
          severity: 2,
          channelId,
        }, guildId ?? null);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.baitDismissals)}` },
        });
        return;
      }

      // Code / technical request...  refuse in-character, queue unfinished business
      if (CODE_REQUEST_RE.test(userInput)) {
        console.log(`[michael] chat | code-refusal | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, -2, nextMood(mood, -2), channelId, guildId ?? null);
        fileUnfinishedBusiness(userId, username, {
          prompt:   userInput,
          reason:   'De gebruiker vroeg om technische hulp...  buiten Michaels domein maar hij vergeet het niet',
          severity: 1,
          channelId,
        }, guildId ?? null);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.codeRefusals)}` },
        });
        return;
      }

      // ~6% chance Michael refuses outright...  no OpenAI call. Rare enough to
      // stay a surprise instead of a coin-flip, but the flip-out stays possible.
      if (Math.random() < 0.06) {
        console.log(`[michael] chat | random-refusal (6%) | ${username} (${userId})`);
        saveUserMemory(userId, username, userInput, mood, 0, nextMood(mood, 0), channelId, guildId ?? null);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelRefusals)}` },
        });
        return;
      }

      // Show typing indicator while OpenAI processes; refresh every 8s so it doesn't expire
      const stopTyping = startTypingLoop(channelId);

      try {
        // Reuse already-loaded memory...  avoid a second file read
        const judgementLabel = getJudgementLabel(preMemory.judgementScore ?? 0);
        // Filter out internal system entries ([vergeefmij], [date:…], etc.) from the summary
        const realPrompts = preMemory.prompts.filter(p => !p.startsWith('['));
        const memorySummary = realPrompts.length ? realPrompts.slice(-3).join(' / ') : null;
        const cosmicRole = getCosmicRole(userId, guildId);

        // Rollenspel...  the sheet is always on Michael's desk; the prompt decides
        // when a nod fits (title, weakest stat, campaign standing), not a dice gate
        const existingCharacter = preMemory.michaelCharacter ?? null;
        const characterBlock = existingCharacter
          ? formatCharacterForPrompt(existingCharacter, langCode, preMemory.michaelPoints ?? 0)
          : '';

        // After 2 explicit requests, unlock; full target-language replies only when they write in that language (or ask again)
        const unlocked = recordLanguageRequest(userId, username, userInput) ?? preMemory.languagePermission ?? null;
        const asksAgain = unlocked && getRequestedLanguageCode(userInput) === unlocked.code;
        const speaksIt = unlocked && userSpeaksUnlockedLanguage(unlocked, userInput);
        const languagePermission = unlocked && (speaksIt || asksAgain) ? unlocked : null;
          console.log(`[michael] chat | lang=${languagePermission?.code ?? 'nl+mix'} | unlocked=${unlocked?.code ?? '...  '} | speaks=${speaksIt} | asksAgain=${asksAgain} | char=${existingCharacter ? resolveField(existingCharacter.archetype, langCode) : 'nieuw'} | ${username}`);

        // Feature 2...  Contradiction engine: detect if user is revisiting a theme
        const contradictionHint = detectThemeOverlap(userId, userInput);

        const registerSubjects = collectRegisterSubjects(req, userId, username, userInput);
        const registerBlock = buildChatRegisterBlock({
          invokerId: userId,
          invokerName: username,
          subjects: registerSubjects,
          guildId,
          lang,
          langCode,
        });
        if (registerSubjects.length) {
          console.log(`[michael] chat | register subjects | ${registerSubjects.map((s) => `${s.username}(${s.userId})`).join(', ')}`);
        }

        // Passive dice roll...  selective, returns true if buttons should be shown
        const passiveTriggered = maybePassiveRollBlock(userId, userInput);

        // Michael's own memory + cross-user context
        const selfBlock = buildSelfContextBlock();
        const relationsBlock = buildRelationsBlock(userId, username, userInput, guildId, preMemory.judgementScore ?? 0);
        if (relationsBlock) console.log(`[michael] chat | relations block | ${relationsBlock.length} bytes`);

        // Run message generation and AI scoring in parallel...  no extra wait time
        const [michaelMessage, scoreDelta] = await Promise.all([
          generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, preMemory.impression ?? null, cosmicRole, contradictionHint, languagePermission, characterBlock, langCode, registerBlock, selfBlock, relationsBlock),
          scoreMichaelMessage(userInput),
        ]);

        const oldScore = preMemory.judgementScore ?? 0;
        console.log(`[michael] score | ${username} | mood=${mood} | Δ=${scoreDelta} | ${oldScore}→${oldScore + scoreDelta} | contradiction=${contradictionHint} | "${userInput.slice(0, 60)}"`);

        // Save first so the user record exists before addUnfinishedBusiness / addTheme write to it
        saveUserMemory(userId, username, userInput, mood, scoreDelta, nextMood(mood, scoreDelta), channelId, guildId ?? null);

        // Feature 1...  Create unfinished business for negative interactions
        if (scoreDelta <= -2 || INSULT_RE.test(userInput)) {
          fileUnfinishedBusiness(userId, username, {
            prompt:   userInput,
            reason:   scoreDelta <= -2 ? 'Belediging of agressief bericht' : 'Negatieve trilling in het veld',
            severity: 3,
            channelId,
          }, guildId ?? null);
        } else if (scoreDelta === -1) {
          fileUnfinishedBusiness(userId, username, {
            prompt:   userInput,
            reason:   'Respectloos of provocerend bericht',
            severity: 2,
            channelId,
          }, guildId ?? null);
        }

        // Feature 2...  Store theme snapshot for future contradiction detection
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

        const messageBase = `> ${safeInput}\n\n${michaelMessage}`;
        const patchBody = { content: messageBase, embeds: [] };
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

        noteMichaelSaid('chat', michaelMessage, { userId, username, guildId: guildId ?? null });
        reactScoreArrow(channelId, req.body.token, scoreDelta);

        // Feature 5...  Post-message revision: fetch the sent message ID then maybe append an edit
        if (channelId) {
          try {
            const getMsgRes = await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, { method: 'GET' });
            const sentMsg = await getMsgRes.json();
            if (sentMsg?.id) {
              schedulePostRevision(channelId, sentMsg.id, messageBase, mood, 'chat', langCode);
            }
          } catch {
            // non-critical...  skip revision if we can't fetch the message ID
          }
        }

        // Rollenspel...  generate character in background after reply so it never blocks the response
        if (!existingCharacter) {
          ensureMichaelCharacter(userId, username, langCode).catch(err =>
            console.error(`[michael] background character generation failed | ${username}:`, err.message)
          );
        }
      } catch (err) {
        console.error('chat error:', err);
        // If the token expired (10015) the fallback PATCH will also fail...  swallow it silently
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `> ${safeInput}\n\n${lang.ui.praatError}` },
          });
        } catch { /* token already gone */ }
      } finally {
        stopTyping();
      }
      return;
}

export async function handleImagine(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userInput = slashOptionValue(data, 'image');
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const safeInput = userInput.trim().replace(/\n+/g, ' ').replace(/`/g, "'").slice(0, 400);
      const preMemory = loadUserMemory(userId);
      const mood = INSULT_RE.test(userInput) ? 'woedend' : (preMemory.currentMood ?? MICHAEL_MOODS[Math.floor(Math.random() * MICHAEL_MOODS.length)]);
      const judgementLabel = getJudgementLabel(preMemory.judgementScore ?? 0);
      const channelId = req.body.channel_id ?? req.body.channel?.id;

      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelPlaceholders)}` },
      });

      const stopTyping = startTypingLoop(channelId);

      try {
        const { buffer, mimeType, flavor } = await generateMichaelImage(userInput, {
          username,
          mood,
          judgementLabel,
          score: preMemory.judgementScore ?? 0,
        });
        const ext = (mimeType || '').includes('jpeg') ? 'jpg' : 'png';
        const caption = lang.ui.imagineCaption?.[flavor] ?? lang.ui.imagineCaption?.snide ?? '';
        saveUserMemory(userId, username, userInput, mood, 0, nextMood(mood, 0), channelId, guildId ?? null);
        await DiscordMultipart(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          payload: { content: `> ${safeInput}\n\n${caption}` },
          files: [{ buffer, filename: `michael-imagine.${ext}`, contentType: mimeType || 'image/png' }],
        });
        console.log(`[michael] imagine | ${username} | flavor=${flavor}`);
      } catch (err) {
        console.error('imagine error:', err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `> ${safeInput}\n\n${lang.ui.imagineError}` },
          });
        } catch { /* token expired */ }
      } finally {
        stopTyping();
      }
      return;
}

export async function handleListentomichael(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userInput = slashOptionValue(data, 'advice');
      const userId = req.body.member?.user?.id ?? req.body.user?.id;
      const username = req.body.member?.user?.username ?? req.body.user?.username;
      const safeInput = userInput.trim().replace(/\n+/g, ' ').replace(/`/g, "'").slice(0, 400);
      const preMemory = loadUserMemory(userId);
      const mood = INSULT_RE.test(userInput) ? 'woedend' : (preMemory.currentMood ?? MICHAEL_MOODS[Math.floor(Math.random() * MICHAEL_MOODS.length)]);
      const judgementLabel = getJudgementLabel(preMemory.judgementScore ?? 0);
      const channelId = req.body.channel_id ?? req.body.channel?.id;

      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `> ${safeInput}\n\n${pick(lang.ui.michaelPlaceholders)}` },
      });

      const stopTyping = startTypingLoop(channelId);

      try {
        const registerSubjects = collectRegisterSubjects(req, userId, username, userInput);
        const registerBlock = buildChatRegisterBlock({
          invokerId: userId,
          invokerName: username,
          subjects: registerSubjects,
          guildId,
          lang,
          langCode,
        });
        console.log(`[michael] listentomichael | register | subjects=${registerSubjects.length} | bytes=${registerBlock.length} | ${username}`);
        const [{ wavBuffer, script, flavor }, scoreDelta] = await Promise.all([
          generateMichaelVoiceAdvice(userInput, {
            username,
            mood,
            judgementLabel,
            score: preMemory.judgementScore ?? 0,
            langCode,
            registerBlock,
            impression: preMemory.impression ?? null,
          }),
          scoreMichaelMessage(userInput),
        ]);
        noteMichaelSaid('voice', script, { userId, username, guildId: guildId ?? null });
        saveUserMemory(userId, username, userInput, mood, scoreDelta, nextMood(mood, scoreDelta), channelId, guildId ?? null);
        await DiscordMultipart(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          payload: { content: `> ${safeInput}\n\n*${script}*` },
          files: [{ buffer: wavBuffer, filename: 'michael.wav', contentType: 'audio/wav' }],
        });
        reactScoreArrow(channelId, req.body.token, scoreDelta);
        console.log(`[michael] listentomichael | ${username} | flavor=${flavor}`);
      } catch (err) {
        console.error('listentomichael error:', err);
        try {
          await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `> ${safeInput}\n\n${lang.ui.listenError}` },
          });
        } catch { /* token expired */ }
      } finally {
        stopTyping();
      }
      return;
}

export async function handleForgiveme(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
      const userId   = req.body.member?.user?.id ?? req.body.user?.id;
      const memory   = loadUserMemory(userId);
      const currentMood = memory.currentMood ?? 'afwezig';
      const moodIdx  = MICHAEL_MOODS.indexOf(currentMood);
      const stained = isAntichrist(userId, guildId);

      // Already calm...  apology is unnecessary unless they still carry the antichrist stain
      if (moodIdx <= 2 && !stained) {
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

export async function handleMycharacter(ctx) {
  const { req, res, data, lang, langCode, guildId } = ctx;
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
        const embedColor = 0x7c3aed;
        const embedTitle = mr.title.replace(/^#+\s*/, ''); // strip markdown heading prefix

        // Build stat list: pad names to the same width for monospace alignment
        const statEntries = [
          [mr.statNames.aura,       stats.aura],
          [mr.statNames.discipline, stats.discipline],
          [mr.statNames.chaos,      stats.chaos],
          [mr.statNames.inzicht,    stats.inzicht],
          [mr.statNames.volharding, stats.volharding],
        ];
        const maxNameLen = Math.max(...statEntries.map(([n]) => n.length));
        const statsBlock = statEntries
          .map(([name, v]) => `${name.padEnd(maxNameLen)}  ${statBar(v ?? 0)}  ${String(v ?? '?').padStart(2)}`)
          .join('\n');

        const displayArchetype = resolveField(character.archetype, langCode);
        const displayLineage   = resolveField(character.lineage, langCode);
        const displayTitle     = resolveField(character.title, langCode);
        console.log(`[michael] mijnrol | ${username} (${userId}) | archetype=${displayArchetype}`);
        await DiscordRequest(`webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`, {
          method: 'PATCH',
          body: {
            content: mr.header,
            embeds: [{
              color: embedColor,
              title: embedTitle,
              description: `${mr.subtitle}\n\n*${safeComment}*`,
              fields: [
                { name: mr.archetypeLabel.replace(/\*\*/g, ''), value: displayArchetype,       inline: false },
                { name: mr.lineageLabel.replace(/\*\*/g, ''),   value: displayLineage,         inline: false },
                { name: mr.titleLabel.replace(/\*\*/g, ''),     value: `*${displayTitle}*`,    inline: false },
                { name: '\u200b', value: `\`\`\`\n${statsBlock}\n\`\`\``,                      inline: false },
              ],
            }],
          },
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

