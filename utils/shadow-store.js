/**
 * Shadow reply candidate store — in-memory only, resets on bot restart.
 *
 * Tracks recent non-bot Discord messages so Michael can circle back
 * and reply directly to one long after it was sent.  Because this is
 * opportunistic behaviour (nice when it happens, fine when it doesn't)
 * losing the queue on restart is acceptable.
 *
 * Each candidate:
 *   { messageId, channelId, authorId, content, timestamp, shadowReplied, guildId? }
 */

const MAX_CANDIDATES = 120;
const MIN_AGE_MS = 5 * 60 * 1000;   // at least 5 min old before shadow reply
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // up to 2 hours — keeps more candidates eligible

const candidates = [];

/** Store a new message as a potential shadow reply target. Deduplicates by messageId. */
export function addShadowCandidate({ messageId, channelId, authorId, content, timestamp, guildId = null }) {
  if (candidates.some(c => c.messageId === messageId)) return;
  candidates.push({ messageId, channelId, authorId, content, timestamp, shadowReplied: false, guildId });
  // Keep array bounded — drop oldest entries first
  if (candidates.length > MAX_CANDIDATES) {
    candidates.splice(0, candidates.length - MAX_CANDIDATES);
  }
}

/**
 * Returns candidates eligible for a shadow reply:
 * - between MIN_AGE_MS and MAX_AGE_MS old
 * - not yet shadow-replied
 */
export function getShadowCandidates() {
  const now = Date.now();
  return candidates.filter(
    c => !c.shadowReplied
      && now - c.timestamp >= MIN_AGE_MS
      && now - c.timestamp <= MAX_AGE_MS,
  );
}

/** Mark a message as already shadow-replied so it isn't targeted again. */
export function markShadowReplied(messageId) {
  const c = candidates.find(c => c.messageId === messageId);
  if (c) c.shadowReplied = true;
}

/** Prune candidates older than MAX_AGE_MS. Called each cron cycle. */
export function pruneOldCandidates() {
  const now = Date.now();
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (now - candidates[i].timestamp > MAX_AGE_MS) candidates.splice(i, 1);
  }
}
