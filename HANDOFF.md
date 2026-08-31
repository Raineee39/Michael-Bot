# Handoff — 31 Aug 2026

## Status
Daily horoscope / uitverkorene was repeating the same people and, in servers like Moons Grill, naming lurkers who never use Michael.

## What changed
- Offices (chosen + antichrist) **re-roll every new Amsterdam day**. They are no longer reused from `cosmic-state.json`.
- The pick pool prefers people who **used a Michael command in that guild** (`lastSeenByGuild`), not the full member list or “last channel they spoke in”.
- Horoscope subjects are a **weighted rotation** (recency + dossier), and recent featured IDs (last ~3 days) are excluded when the pool is large enough.
- Slash / button / modal use stamps `lastSeenByGuild` so future dailies stay on actual interactors.

## Daily times
- Default board: 10:00 Europe/Amsterdam (`DAILY_GUILD_ID` / `DAILY_CHANNEL_ID`). Skips if that target is Moons Grill.
- Moons Grill: 11:00 Amsterdam (10:00 UK in BST). Guild + `#general` are the same snowflake `183545688859213834` (pre-2017 default channel). Do not "fix" that.

## 31 Aug 11:00 post
The cropped bit was **YESTERDAY'S BOOKS** in a markdown code block, so `<@userid>` stayed literal (Discord never resolves mentions inside `code`). Strip fences / inline backticks / 4-space indent before posting. Today's card was fine.

Omen/prophecy lines were hard-sliced (180/140 chars) so a sentence could die and stats still printed. Caps are higher now and trim at a sentence stop.

## Next
Deploy/restart for the format fix. Today's Moons Grill card is already saved if `generateDayLaw` ran; `/horoscope` in that server reprints it.
