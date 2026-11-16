# Handoff — 1 Sep 2026

## Models and voice (2026-11)
**Why this happened:** Google reroutes `gemini-2.5-flash` to `gemini-3.5-flash-lite` on 1 Dec 2026 and shuts `gemini-2.5-flash-preview-tts` on 18 Dec. The old code sent `thinkingBudget: 0` on every text call, which Flash-Lite 3.5 rejects with a bare 400, so the reroute would have failed every text generation.

**Defaults now** (all in `utils/openai.js`, all overridable by env): voice `gemini-4-hydrogen`, bookkeeping `gemini-3.5-flash-lite`, image `gemini-nano-banana-2.1`, TTS `gemini-3.8-flash-tts`. If the VPS `.env` still sets `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL` / `GEMINI_TTS_MODEL` to 2.5 ids, those win over the new defaults: delete them.

**Two tiers.** `tier: 'utility'` (message scoring, user impressions, self-summary, sheet translation) runs on Flash-Lite; everything in character runs on the voice model. Each tier falls back to a rolling `-latest` alias when the primary is missing, rate-limited or overloaded.

**Thinking is negotiated, not configured.** Each model generation wants a different thinking setting and rejects the others. `generateOnModel` tries budget 0, then `minimal`, then `low`, then the model default, and caches what the model accepted. Thought tokens count against `maxOutputTokens` and Gemini 4 thinks a few hundred tokens regardless, so every call gets 2048 tokens of headroom and the caller's limit is enforced on the text afterwards (`clipToTokenBudget`). Do not remove the headroom: short replies come back empty with `MAX_TOKENS`.

**TTS goes through the Interactions API.** Gemini 3.8 TTS treats text as a verbatim transcript; the old inline delivery prompt was spoken aloud ("Deep elderly male archangel voice..."). Style now travels as a `speech_metadata` annotation. It also returns a finished WAV, so `pcmToWav` only runs on raw PCM. The legacy `generateContent` path remains for 2.5/3.1 TTS ids.

**The voice was rewritten to be funny instead of loud.** Before, nearly every reply was "you trouble the Higher with trivialities, seek your Inner Light" whatever was asked. Now:
- `archangelBaseline` (both languages): deadpan celestial clerk by default; open wrath belongs to the `woedend` mood only, which is what makes it land.
- `comedyRules` (new lang key, in the /chat prompt): answer the actual question with a real ruling; never make "this is trivial" the point; one specific concrete detail; one idea per reply; spiritual vocabulary is seasoning.
- `detailNudge()`: the SOURCE of that concrete detail is drawn in code per call (a measurement, a saint with an opinion, a fee, a rule nobody remembers...) and rides in `personaIntro`, so every generator gets it. Without it the model found one joke ("filed under Form 12-C") and used it in every reply.
- Style rules cap the tics: at most one ALL-CAPS word, one quoted word and one wide gap per reply outside `woedend`.
- User impressions are written by the utility model with an explicit no-invention rule and in the server's language (`summariseUserHistory` was called without `langCode`, so English servers got Dutch impressions).
- /chat sentence clamp is 3 (was 2) and no longer treats "St." / "nr." as a sentence end. The card gives one reading per soul.

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
Michael remembers what he himself says. Three layers: a verbatim queue of his last ~12 outgoing lines; a rolling first-person summary condensed by the cheapest model (`GEMINI_SUMMARY_MODEL`, the utility tier) once the queue hits 10; and **ephemera** — time-boxed notes (today's law 36h, invoices 48h, appointments 24h) that expire on read and are never fed into the long-term summary. `buildSelfContextBlock()` goes into /chat, horoscope, and day-law prompts.

Moods are split: `currentMood` on user records stays "mood toward them"; Michael also has ONE **general mood** (self-healing daily roll, kinder distribution, includes general-only `genadig`). General mood modifies every dice roll (+3 genadig … −3 woedend) via `computeMichaelRoll`.

Per-user mood NEVER drifts on its own: `nextMood` is deterministic (delta 0 → unchanged; ±1 → one step; ≥2 → two steps kinder; ≤−2 → straight to woedend; escaping woedend needs a +2). Every user-initiated interaction with text feeds the tally: /chat, /babychat, /confess, /listentomichael, and /aurascan (its message option is now scored). When an interaction moved the tally, Michael reacts ⬆️/⬇️ on his own reply (`reactScoreArrow`).

/chat also gets cross-user context: theme-neighbours (souls whose `recentThemes` overlap the prompt — always included when a real overlap exists) and a favourites/nuisances gossip hint (only when he's fed up with the invoker, else ~15%; prompt says most replies tag no one).

## Removed (2026-09)
`/test`, `/aurascan` (canned lines), `/babychat` (+ its generators), old `/michaelmood` (canned humeur lines), `game.js`, `aura.js`, `examples/`. `/cosmicstatus` was renamed to `/michaelmood` (same handler: offices + mood toward you). The character sheet is now always in the /chat prompt (with Michael Points) instead of a 12% gate. Michael never says tally/score numbers in prose — arrows and /vibecheck do that. The quiet afterthought (reply to the last message once a channel goes silent 12 min, 25% draw, 3h cooldown, needs /switchoflife ON) is now actually wired — it previously had no caller.

## Mentions on the card: never doubled, never invented (2026-10)
`buildCardBody` prefixes every reading and prophecy with `<@id>`, and the model opened its own text with the same tag, so cards showed `@user — @user, Chosen One...`. `stripSelfMention` (openai.js) removes the subject's own tag from text the renderer is about to prefix, including the `<@!id>` nickname form and any leading `—`/`,` left behind. Mentions of OTHER souls are kept.

Separately, the model sometimes invented ids, which Discord renders as a broken ping (`@°°°°°`). `dropUnknownMentions` removes any mention whose id is not a known participant — it matches malformed, non-numeric mentions too. Applied to readings, claims, the forecast and segment bodies (against the day's allowed ids), and to the books-closed epilogue and chaos bulletin (against the ids that actually appear in their own digest). The books-closed prompt is also handed the exact legal tags, so the strip is only a backstop.

## The daily card is a horoscope, not a form (2026-10)
The card used to be a fixed JSON schema — mood, omen, prophecy, forbidden word, least favourite, rule, stats — so it rendered the same sections in the same order every day and read like a form.

`generateDayLaw` now has liberty. Three things create the variety:
1. **A random ANGLE** picked in code each day (one soul dominates / the whole field / warnings / an audit / off-world weather / the archive resurfaces / suspiciously fortunate / sparse and ominous / assignments / a reckoning). It shapes the whole card.
2. **Optional sections are diced in code**: rule 50%, least favourite 40%, stats 45%. Most days some of them are absent entirely, and the prompt is told they do not exist today.
3. **`segments`**: 1-2 sections whose HEADINGS Michael invents himself, plus `recentCardLabels(guildId)` from the ledger's new `shapeHistory`, which lists the headings he used in the last 5 days and forbids reusing them.

`readings` (1-3 per-soul predictions drawn from dossiers) are now the heart of the card, with `forecast` as the server-wide reading. The mechanical core that day-watch stamps depend on — `forbiddenWord`, `prophecies[].watch`, and `ruleWatch`/`leastFavouriteUserId` when present — is unchanged, so the stamp game still works; it just fires less on days those sections are absent.

## Name mentions are AI replies now (2026-10)
Saying Michael's name in chat used to draw a random canned line from `lang.ui.nameReplies`, regardless of what the message said. The gateway now calls `generateNameMentionReply` (openai.js), which answers the actual message using the speaker's mood, verdict and impression. The canned pool survives only as the failure fallback.

The reply knows how it was summoned: an **@-ping** means he was addressed and answers the content directly; a **name drop** means he overheard himself being discussed and is interjecting uninvited, which reads differently on purpose. Replies are recorded into self-memory (`mention-reply` / `name-drop-reply`) with their langCode. The gating from the talkativeness pass is unchanged: pings always answer, name drops are 20% and spend unprompted budget.

## Unprompted speech budget (2026-10)
All the ways Michael speaks without being addressed — snark, quiet afterthoughts, resurfaced grudges, absence inquiries, and replies to his name being dropped — now share ONE budget per guild: `utils/speech-budget.js`, **max 2 per day, never within 3 hours**, persisted in `data/speech-budget.json` so a deploy restart does not refill it. Individual rates were lowered too (snark 0.5%→0.15%, afterthought 25%→12% with a 6h cooldown), but the shared budget is the guarantee: no combination can make him chatty.

A real **@-ping always gets an answer** and costs no budget — he was addressed. Merely saying "michael" in a message is being talked *about*: 20% chance, and it spends budget. That was the main source of constant chatter (previously every single mention got a reply).

Day-law stamps keep their own budget (now 2/day, 90 min apart) since they are the card mechanic, not chatter. Ambient reacts: 2% with a 15-minute cooldown.

## Language: self-memory is PER LANGUAGE (2026-09)
Michael serves a Dutch server and an English one, but his self-memory is one global file. Handing an English prompt his Dutch sayings, Dutch rolling summary and Dutch ephemera dragged the model into Dutch — and it got worse over time as the memory filled with Dutch from his busier server.

Every saying and ephemera now carries a `langCode`, `selfSummary` became `selfSummaries` keyed by language (legacy value migrates to `nl`), and `buildSelfContextBlock(langCode)` only ever returns that language's memory. The sayings cap is applied PER language so a busy Dutch server cannot evict the English memory. Every write site passes langCode; `summariseMichaelSelf` is told which language to write. Day-law and chaos prompts also carry an explicit rule that usernames, dossier excerpts and quoted memory may be in other languages and must not pull the output out of the required one.

Untagged memory that predates this defaults to `nl`, so the English server starts from a clean slate.

## Language: Dutch keys must never reach a prompt (2026-09)
Moods (`woedend`, `afwezig`, `genadig`, …) and judgement verdicts (`vermoeiend`, `onbeslist`, …) are stored as **Dutch keys**. They are lookup keys for `lang.moodDescriptions` / `lang.judgementDescriptions`, NOT display text. Injecting them raw into an English prompt makes the model code-switch — that is why English servers got half-Dutch daily cards ("WOEDEND WRATH!").

Rule: translate at every boundary where stored state enters a prompt, using `displayMood(langCode, key)` / `displayJudgement(langCode, key)` from `utils/lang/index.js`. Keep the raw key for map lookups and comparisons. Same applies to `formatCharacterForPrompt` (has an English branch) and `buildSubjectDossier`/`buildSelfContextBlock`/`buildWitnessDossier` (all take langCode). `generateDayLaw` also carries an explicit one-language rule for its JSON strings.

## Inner life (2026-09)
**The eternal labour** (`getLabour` in michael-self.js): one long-term work (Census of Souls, overdue Quarterly Report, Archive of Unanswered Prayers, inventory of lost objects) that creeps forward ~daily then collapses. Capped at 97%, setback odds rise sharply past 80%, and a total collapse switches him to a different work. Surfaced in `buildSelfContextBlock` so it leaks into chat, horoscopes, day-law and rants — he blames his mood on it, never announces progress, never finishes.

**The reorganisation** (`REORGANISATION_BLOCK` in openai.js): the unexplained reason an archangel does data entry. He may almost mention it (~1 in 10) and stop himself; pushing makes him colder. Never resolved by design.

**Absence inquiries**: when a soul with a real file (|score| ≥ 3 or an impression) goes quiet in a guild for 3–21 days, Michael asks the ROOM where they went, disguised as administration. Cron at 13/17/20 Amsterdam, 25% per check, and hard persistent cooldowns in michael-self.js (one per guild per 4 days, one per soul per 14 days). Chat activity is tracked separately from Michael-usage via `lastChattedByGuild` (throttled to one write/user/hour).

**Register corrections**: 12% of days with a ledger, the books-closed epilogue audits Michael's own filing and issues a grudging correction. He never apologises.

**Silence as a weapon**: an insult aimed at Michael in chat has a 50% chance of getting one 🧿, −1 judgement, and no words at all. Ambient reacts dropped 10% → 2% so a reaction means something.

## Decision box & AI denials (2026-09)
`/mycharacter` and `/imagine` in servers arrive EPHEMERAL with Share/Keep buttons (`stashLongReply`/`longReplyButtons` in interaction-kit, `longreply_*` component handler in app.js; stash expires ~14 min). Share posts the content/embeds/files to the channel; Keep leaves it private. DMs skip the ceremony. /chat is always public by design.

Antichrist denials are AI-first (`generateAntichristDenial`: personal, never echoes the command name), canned pool only as fallback — and the fallback prefers pool lines without `{command}`.

## Chat / listen
`/chat` and `/listentomichael` both load speaker + `@` / named subjects into THE REGISTER.

## Next
Push so the webhook restarts Michael with the inactive-but-named seat.
