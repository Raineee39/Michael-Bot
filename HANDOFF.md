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
- Moons Grill: 11:00 Amsterdam (10:00 UK in BST). Guild + channel hardcoded as `183545688859213834`.

## Next
Deploy and restart so the 10:00 / 11:00 crons pick up office rotation and the Moons Grill hour. First day after deploy still uses older dossiers (`lastGuildId` + prompts) until people slash in that server.
