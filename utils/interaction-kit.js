// Shared toolkit for interaction handlers — moved verbatim from app.js.
// Everything here is stateless glue: mood mechanics, dossier builders,
// reply plumbing (defer/patch/typing/arrows), and self-memory recording.

import { InteractionResponseType, InteractionResponseFlags, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';
import {
  addDiscordReaction,
  appendEditWithinDiscordLimit,
  DiscordRequest,
} from '../utils.js';
import {
  addUnfinishedBusiness,
  findThemeNeighbours,
  getJudgementLabel,
  getOutstandingBusiness,
  getRecentConfessions,
  getRelationLandscape,
  loadAllMemory,
  loadUserMemory,
  resolveField,
} from './michael-memory.js';
import {
  addSelfEphemera,
  applySelfCondense,
  getSayingsForCondense,
  recordMichaelSaying,
  selfNeedsCondense,
} from './michael-self.js';
import { generatePostRevision, summariseMichaelSelf } from './openai.js';
import { scheduleBusinessResurface } from './unprompted-chat.js';
import { getCurrentAntichristUserId, getUitverkoreneUserId, isAntichristCleansed } from './cosmic-state.js';

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Read a slash-command string option by its registered (English) name. */
export function slashOptionValue(data, name) {
  const hit = data?.options?.find((o) => o.name === name);
  if (hit?.value != null && String(hit.value).trim()) return String(hit.value).trim();
  return '';
}

export function resolveSlashUser(req, fallbackUserId, fallbackUsername) {
  const opt = req.body.data?.options?.find((o) => o.name === 'user');
  const targetId = opt?.value ?? fallbackUserId;
  const resolved = req.body.data?.resolved?.users?.[targetId];
  const mem = loadUserMemory(targetId);
  const username = resolved?.username ?? (mem.username || fallbackUsername);
  return { targetId, username };
}

export function fileUnfinishedBusiness(userId, username, details, guildId) {
  const businessId = addUnfinishedBusiness(userId, details);
  if (businessId && details.channelId && guildId) {
    scheduleBusinessResurface({
      messageId: details.messageId ?? null,
      channelId: details.channelId,
      authorId: userId,
      username,
      guildId,
      businessId,
    });
  }
  return businessId;
}

/**
 * Record something Michael just said publicly, and condense his self-memory
 * with the cheapest model once the queue fills. Fire-and-forget, never throws.
 */
export function noteMichaelSaid(kind, text, { userId = null, username = null, guildId = null, ttlMs = null, ephemeraText = null } = {}) {
  try {
    recordMichaelSaying(text, { kind, userId, username, guildId });
    if (ttlMs) addSelfEphemera(ephemeraText ?? text, ttlMs);
    if (selfNeedsCondense()) {
      const { sayings, summary } = getSayingsForCondense();
      summariseMichaelSelf(sayings, summary)
        .then((s) => {
          applySelfCondense(s);
          console.log('[michael] self-memory condensed');
        })
        .catch((err) => console.error('[michael] self-condense failed:', err?.message ?? err));
    }
  } catch (err) {
    console.error('[michael] self-memory failed:', err?.message ?? err);
  }
}

/** PATCH the deferred original interaction reply. */
export function patchOriginal(token, body) {
  return DiscordRequest(`webhooks/${process.env.APP_ID}/${token}/messages/@original`, { method: 'PATCH', body });
}

/** Keep the typing indicator alive; returns a stop function. */
export function startTypingLoop(channelId) {
  if (!channelId) return () => {};
  const poke = () => DiscordRequest(`channels/${channelId}/typing`, { method: 'POST' }).catch(() => {});
  poke();
  const interval = setInterval(poke, 8000);
  return () => clearInterval(interval);
}

/**
 * Standard deferred-reply handler shape: defer, run work, patch the reply,
 * patch an error message if work throws. Kills the copy-pasted boilerplate.
 */
export async function withDeferredReply(req, res, { ephemeral = false, typing = false, errorContent = null }, work) {
  const channelId = req.body.channel_id ?? req.body.channel?.id;
  const token = req.body.token;
  res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    ...(ephemeral ? { data: { flags: InteractionResponseFlags.EPHEMERAL } } : {}),
  });
  const stopTyping = typing ? startTypingLoop(channelId) : () => {};
  try {
    await work({ channelId, token, patch: (body) => patchOriginal(token, body) });
  } catch (err) {
    console.error('[michael] handler failed:', err?.message ?? err);
    if (errorContent) {
      try { await patchOriginal(token, { content: errorContent }); } catch { /* token expired */ }
    }
  } finally {
    stopTyping();
  }
}

/**
 * Michael marks the verdict on his own reply: ⬆️ when the interaction raised
 * his opinion of the user, ⬇️ when it lowered it. Best effort, never throws.
 */
export async function reactScoreArrow(channelId, token, scoreDelta) {
  if (!scoreDelta || !channelId || !token) return;
  try {
    const res = await DiscordRequest(`webhooks/${process.env.APP_ID}/${token}/messages/@original`, { method: 'GET' });
    const msg = await res.json();
    if (msg?.id) await addDiscordReaction(channelId, msg.id, scoreDelta > 0 ? '⬆️' : '⬇️');
  } catch { /* reaction is decoration...  never block the reply */ }
}

/**
 * Cross-user context for /chat. Theme neighbours are included whenever they
 * genuinely exist (self-gating by relevance); the favourites/nuisances gossip
 * hint is rare...  always when Michael is fed up with this user, otherwise ~15%.
 */
export function buildRelationsBlock(userId, username, userInput, guildId, judgementScore) {
  const lines = [];
  const neighbours = findThemeNeighbours(userId, userInput, guildId);
  if (neighbours.length) {
    lines.push('Souls who recently spoke to you about similar matters (real tags — never invent IDs):');
    for (const n of neighbours) {
      lines.push(`- <@${n.userId}> (${n.username}) — shared themes: ${n.shared.join(', ')}`);
    }
    lines.push('You MAY note the coincidence or refer the current user to one of them — only if it genuinely fits the reply.');
  }
  const gossipGate = judgementScore <= -2 || Math.random() < 0.15;
  if (gossipGate) {
    const { favourites, nuisances } = getRelationLandscape(userId, guildId);
    if (favourites.length || nuisances.length) {
      lines.push('Other souls on file (real tags — never invent IDs):');
      for (const f of favourites) lines.push(`- favoured: <@${f.userId}> (${f.username})`);
      for (const n of nuisances) lines.push(`- tiresome: <@${n.userId}> (${n.username})`);
      lines.push(`If you are fed up with ${username}, you MAY once deflect them toward a favoured soul by tag; if fond of them, you may gossip mildly about a tiresome one. At most ONE tag, only when it lands naturally. Most replies should tag no one. Never tag ${username} themselves.`);
    }
  }
  return lines.length ? `OTHER SOULS (context, not an obligation):\n${lines.join('\n')}` : '';
}

export function buildWitnessDossier(targetId, targetUsername, memory, guildId, lang, langCode) {
  const g = lang.getuigenis ?? lang.vibecheck;
  const label = getJudgementLabel(memory.judgementScore ?? 0);
  const mood = memory.currentMood ?? 'afwezig';
  const cosmic = getCosmicRole(targetId, guildId);
  const character = memory.michaelCharacter;
  const business = getOutstandingBusiness(targetId);
  const confessions = getRecentConfessions(targetId, 3);
  const realPrompts = memory.prompts.filter(p => !p.startsWith('[')).slice(-3);
  const none = g.none ?? 'none';

  const lines = [
    `${g.oordeelLabel?.replace(/\*\*/g, '') ?? 'Judgement'}: ${label} (${memory.judgementScore ?? 0})`,
    `${g.moodLabel?.replace(/\*\*/g, '') ?? 'Mood'}: ${moodName(lang, mood)}`,
    `Impression: ${memory.impression ?? none}`,
    `Recent messages: ${realPrompts.length ? realPrompts.join(' | ') : none}`,
    `Cosmic role: ${cosmic ?? none}`,
  ];

  if (character) {
    lines.push(`Character: ${resolveField(character.archetype, langCode)} / ${resolveField(character.lineage, langCode)} / ${resolveField(character.title, langCode)}`);
  }

  lines.push(`${g.businessLabel?.replace(/\*\*/g, '') ?? 'Grudges'}: ${business.length ? business.map(b => b.reason).join('; ') : none}`);

  if (confessions.length) {
    lines.push(`${g.confessionLabel?.replace(/\*\*/g, '') ?? 'Confessions'}:`);
    for (const c of confessions) {
      const who = c.aboutSelf ? 'self' : `by ${c.confessorName}`;
      lines.push(`- (${who}) ${c.text.slice(0, 120)}`);
    }
  } else {
    lines.push(`${g.confessionLabel?.replace(/\*\*/g, '') ?? 'Confessions'}: ${none}`);
  }

  return lines.join('\n');
}

export function mentionIdsFromText(text) {
  return [...String(text ?? '').matchAll(/<@!?(\d+)>/g)].map((m) => m[1]);
}

export function findMemoryUsersNamedInText(text, excludeIds = []) {
  const exclude = new Set(excludeIds.filter(Boolean));
  const hits = [];
  for (const [id, mem] of Object.entries(loadAllMemory())) {
    if (exclude.has(id)) continue;
    const name = String(mem.username || '').trim();
    if (name.length < 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      hits.push({ userId: id, username: mem.username });
    }
  }
  return hits;
}

/** Speaker file plus anyone @mentioned or named in the message. No extra slash field. */
export function collectRegisterSubjects(req, invokerId, invokerName, userInput) {
  const subjects = [];
  const seen = new Set([invokerId]);
  const add = (userId, username) => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    const mem = loadUserMemory(userId);
    const resolved = req.body.data?.resolved?.users?.[userId];
    subjects.push({
      userId,
      username: resolved?.username ?? username ?? mem.username ?? userId,
    });
  };

  for (const [id, user] of Object.entries(req.body.data?.resolved?.users ?? {})) {
    add(id, user?.username);
  }
  for (const id of mentionIdsFromText(userInput)) add(id);
  for (const hit of findMemoryUsersNamedInText(userInput, [...seen])) add(hit.userId, hit.username);

  if (
    !subjects.length
    && /\b(confess|confession|biecht|secret|register|dossier)\b/i.test(userInput)
  ) {
    for (const [id, mem] of Object.entries(loadAllMemory())) {
      const aboutThem = (mem.confessions ?? []).some(
        (c) => c.confessorId === invokerId && !c.aboutSelf,
      );
      if (aboutThem) add(id, mem.username);
    }
  }

  return subjects;
}

export function buildChatRegisterBlock({ invokerId, invokerName, subjects, guildId, lang, langCode }) {
  const people = [
    { userId: invokerId, username: invokerName, role: 'speaker' },
    ...subjects.map((s) => ({ ...s, role: 'subject' })),
  ];
  const seen = new Set();
  const parts = [];
  for (const p of people) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    const mem = loadUserMemory(p.userId);
    const dossier = buildWitnessDossier(p.userId, p.username || mem.username, mem, guildId, lang, langCode);
    parts.push(`REGISTER FILE — ${p.role} ${p.username} (<@${p.userId}>):\n${dossier}`);
  }
  return parts.join('\n\n');
}

/** Cosmic roles are per-guild and persisted in data/cosmic-state.json (see utils/cosmic-state.js). */
export function isAntichrist(userId, guildId) {
  if (!guildId) return false;
  if (isAntichristCleansed(guildId)) return false;
  return getCurrentAntichristUserId(guildId) === userId;
}

export function isUitverkorene(userId, guildId) {
  if (!guildId) return false;
  return getUitverkoreneUserId(guildId) === userId;
}

/** Chosen one wins if someone holds both (same-person assignment used to lock them out). */
export function getCosmicRole(userId, guildId) {
  if (!guildId) return null;
  if (isUitverkorene(userId, guildId)) return 'uitverkorene';
  if (isAntichrist(userId, guildId)) return 'antichrist';
  return null;
}

/** Antichrist gets "nee" on almost everything; only these stay open. */
export const ANTICHRIST_EXEMPT_COMMANDS = new Set(['antichrist', 'chosenone', 'chat', 'cosmicstatus', 'feedback', 'forgiveme', 'horoscope']);

/** Snowflake to receive /feedback DMs (override with FEEDBACK_DM_USER_ID). */
export const FEEDBACK_OWNER_ID = process.env.FEEDBACK_DM_USER_ID || '49627618751811584';

// NEE array is now per-lang: lang.ui.nee

// Mood spectrum: index 0 = calmest, index 6 = angriest
// Michael drifts along this based on how each conversation goes
// ─── Long-reply decision box ─────────────────────────────────────────────────
//
// A long prompted reply is first delivered privately (ephemeral, with Share /
// Keep buttons); the public channel sees only a teaser. The full text is
// stashed here until the user decides — entries expire with the interaction
// token (~15 min), after which the buttons politely die.

const LONG_REPLY_TTL_MS = 14 * 60 * 1000;
const pendingLongReplies = new Map(); // id → { userId, channelId, langCode, content, embeds, files, expiresAt }

export function stashLongReply({ userId, channelId, langCode, content, embeds = null, files = null }) {
  const id = Math.random().toString(36).slice(2, 10);
  pendingLongReplies.set(id, { userId, channelId, langCode, content, embeds, files, expiresAt: Date.now() + LONG_REPLY_TTL_MS });
  // opportunistic cleanup
  for (const [k, v] of pendingLongReplies) {
    if (v.expiresAt < Date.now()) pendingLongReplies.delete(k);
  }
  return id;
}

/** The Share / Keep button row for a stashed long reply. */
export function longReplyButtons(stashId, langCode) {
  return [{
    type: MessageComponentTypes.ACTION_ROW,
    components: [
      { type: MessageComponentTypes.BUTTON, custom_id: `longreply_share:${stashId}`, label: langCode === 'nl' ? 'Deel met de groep' : 'Share with the group', style: ButtonStyleTypes.PRIMARY },
      { type: MessageComponentTypes.BUTTON, custom_id: `longreply_keep:${stashId}`, label: langCode === 'nl' ? 'Houd privé' : 'Keep private', style: ButtonStyleTypes.SECONDARY },
    ],
  }];
}

export function peekLongReply(id) {
  const entry = pendingLongReplies.get(id);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

export function takeLongReply(id) {
  const entry = peekLongReply(id);
  pendingLongReplies.delete(id);
  return entry;
}

export const MICHAEL_MOODS = [
  'kosmisch',        // 0...  peak benevolence
  'afwezig',         // 1...  pleasantly checked out
  'loom',            // 2...  slow and unbothered
  'verward',         // 3...  neutral chaos
  'passief-agressief', // 4...  starting to sour
  'streng',          // 5...  openly displeased
  'woedend',         // 6...  full archangel rage
];

// Shifts Michael's mood after each interaction based on how it went
export function nextMood(currentMood, scoreDelta) {
  // An insult always jumps straight to woedend...  no gradual path
  if (scoreDelta <= -2) return 'woedend';

  // No random drift...  a neutral interaction leaves the mood exactly where it was.
  // The mood toward a user only moves when the user themselves moves it.
  if (scoreDelta === 0) return currentMood ?? 'afwezig';

  // Escaping woedend requires sustained good behaviour
  if (currentMood === 'woedend') {
    return scoreDelta >= 2 ? MICHAEL_MOODS[5] : 'woedend'; // streng...  one step back
  }

  const idx = MICHAEL_MOODS.indexOf(currentMood);
  const base = idx === -1 ? 3 : idx;
  const shift = scoreDelta >= 2 ? -2 : scoreDelta === 1 ? -1 : 1; // deterministic tally
  return MICHAEL_MOODS[Math.max(0, Math.min(6, base + shift))];
}

// DATE_MOOD_INTROS and DATE_ROUND1_WOEDEND are now in lang packs: lang.date.moodIntros / lang.date.round1WoedendChoices

// MICHAEL_HUMEUR, APOLOGY_*, MICHAEL_REFUSALS, BAIT_DISMISSALS, SHADOW_REPLY_LINES are now in lang packs.
// Access via lang.humeur[mood], lang.ui.apologyAccepted, lang.ui.apologyRejected, lang.ui.apologyAlreadyCalm,
// lang.ui.refusals, lang.ui.baitDismissals, lang.ui.shadowReplyLines.

// Detects technical / code requests that Michael refuses to handle
export const CODE_REQUEST_RE = /\b(code|codeer|programm|react|javascript|html|css|node\.?js|python|script|config|debug|bouw|build|compileer|deploy|functie schrijven|api|database)\b/i;

export const INSULT_RE = /\b(kut|fuck|shit|klootzak|lul|eikel|idioot|sukkel|kanker|godverdomme|hoer|bitch|asshole|bastard|stom|dom)\b/i;

// Feature 3...  Detects baiting / attempts to force Michael to respond
export const BAIT_RE = /\b(antwoord\s*(dan|nu|toch|me)?|reageer\s*(dan|nu|toch)?|durf\s+je\s+niet|durf\s+niet|zeg\s+iets|waarom\s+reageer|coward|lafaard|bange\s+engel|kom\s+op\s+dan|wees\s+geen\s+lafaard|reageer\s+op\s+mij|zeg\s+dan\s+iets|ben\s+je\s+er\s+wel)\b/i;

/** Returns the localised display name for a mood key, falling back to the raw key. */
export function moodName(lang, key) {
  return lang.moodNames?.[key] ?? key;
}

/**
 * Cosmic reroll buttons: cosmic_{uit|ant}_{roll|flee}:{snowflake}
 * Parsed with a single regex so "flee" can never be mistaken for "roll".
 */
export function parseCosmicComponentId(id) {
  if (id == null || typeof id !== 'string') return null;
  const m = /^cosmic_(uit|ant)_(roll|flee):(\d+)$/.exec(id.trim());
  if (!m) return null;
  return { kind: m[1], action: m[2], guildId: m[3] };
}

// ─── Feature 5...  Post-message revision ────────────────────────────────────────
//
// After sending a message, Michael may quietly append a second thought.
// The original content is always preserved...  only an "Edit: …" line is added.

export async function schedulePostRevision(channelId, messageId, originalContent, mood, label = 'message', langCode = 'nl') {
  if (Math.random() > 0.10) return; // 10% chance
  const delay = 7000 + Math.floor(Math.random() * 13000); // 7 to 20 s
  console.log(`[michael] revision scheduled | ${label} | ${messageId} | ~${Math.round(delay / 1000)}s`);
  setTimeout(async () => {
    try {
      const editLine = await generatePostRevision(originalContent, mood, langCode);
      const revised = appendEditWithinDiscordLimit(originalContent, editLine);
      await DiscordRequest(`channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: { content: revised, embeds: [] },
      });
      console.log(`[michael] revision applied | ${label} | ${messageId} | "${editLine.slice(0, 60)}"`);
    } catch (err) {
      console.error(`[michael] revision failed | ${label} | ${messageId}:`, err.message);
    }
  }, delay);
}


// CODE_REFUSALS is now in lang packs: lang.ui.codeRefusals
