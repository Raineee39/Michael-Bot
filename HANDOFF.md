# Handoff — 1 Sep 2026

## Antichrist seat after /forgiveme
The named antichrist **stays on the card**. Successful repentance marks `antichristCleansed` on cosmic-state and today’s offices. The seat is filled; the office is inactive for the rest of the day (no “nee”, no antichrist role in chat/listen, no day-watch antichrist stamp).

`/horoscope` reprints the same card with:
- happier mood
- amendment that the seat still names them and the stain is lifted
- **So far today** cleanse line
- **Antichrist of the day:** … *cleansed. The seat remains.*

`/cosmicstatus` shows the same person as antichrist *(cleansed)*. Morning channel post is not edited.

Do **not** vacate or re-roll the seat just because they repented. `/horoscope` still must not re-roll offices when the seat is vacant for other reasons.

## Earlier bug (still fixed)
`/horoscope` used to re-roll both offices when antichrist was empty, which could make the chosen one the new antichrist. Chosen wins if someone somehow holds both. `/horoscope` is antichrist-exempt.

## Webhook / VPS
Push to `main` → `/github-webhook` → `git reset --hard origin/main && npm install && pm2 restart michael-bot --update-env`. Michael **does** restart after a pull.

## Self-memory & moods (`utils/michael-self.js`, `data/michael-self.json`)
Michael remembers what he himself says. Three layers: a verbatim queue of his last ~12 outgoing lines; a rolling first-person summary condensed by the cheapest model (`GEMINI_SUMMARY_MODEL`, default `gemini-2.5-flash-lite`) once the queue hits 10; and **ephemera** — time-boxed notes (today's law 36h, invoices 48h, appointments 24h) that expire on read and are never fed into the long-term summary. `buildSelfContextBlock()` goes into /chat, horoscope, and day-law prompts.

Moods are split: `currentMood` on user records stays "mood toward them"; Michael also has ONE **general mood** (self-healing daily roll, kinder distribution, includes general-only `genadig`). General mood modifies every dice roll (+3 genadig … −3 woedend) via `computeMichaelRoll`.

Per-user mood NEVER drifts on its own: `nextMood` is deterministic (delta 0 → unchanged; ±1 → one step; ≥2 → two steps kinder; ≤−2 → straight to woedend; escaping woedend needs a +2). Every user-initiated interaction with text feeds the tally: /chat, /babychat, /confess, /listentomichael, and /aurascan (its message option is now scored). When an interaction moved the tally, Michael reacts ⬆️/⬇️ on his own reply (`reactScoreArrow`).

/chat also gets cross-user context: theme-neighbours (souls whose `recentThemes` overlap the prompt — always included when a real overlap exists) and a favourites/nuisances gossip hint (only when he's fed up with the invoker, else ~15%; prompt says most replies tag no one).

## Removed (2026-09)
`/test`, `/aurascan` (canned lines), `/babychat` (+ its generators), old `/michaelmood` (canned humeur lines), `game.js`, `aura.js`, `examples/`. `/cosmicstatus` was renamed to `/michaelmood` (same handler: offices + mood toward you). The character sheet is now always in the /chat prompt (with Michael Points) instead of a 12% gate. Michael never says tally/score numbers in prose — arrows and /vibecheck do that. The quiet afterthought (reply to the last message once a channel goes silent 12 min, 25% draw, 3h cooldown, needs /switchoflife ON) is now actually wired — it previously had no caller.

## Decision box & AI denials (2026-09)
`/mycharacter` and `/imagine` in servers arrive EPHEMERAL with Share/Keep buttons (`stashLongReply`/`longReplyButtons` in interaction-kit, `longreply_*` component handler in app.js; stash expires ~14 min). Share posts the content/embeds/files to the channel; Keep leaves it private. DMs skip the ceremony. /chat is always public by design.

Antichrist denials are AI-first (`generateAntichristDenial`: personal, never echoes the command name), canned pool only as fallback — and the fallback prefers pool lines without `{command}`.

## Chat / listen
`/chat` and `/listentomichael` both load speaker + `@` / named subjects into THE REGISTER.

## Next
Push so the webhook restarts Michael with the inactive-but-named seat.
