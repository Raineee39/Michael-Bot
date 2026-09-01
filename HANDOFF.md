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

## Chat / listen
`/chat` and `/listentomichael` both load speaker + `@` / named subjects into THE REGISTER.

## Next
Push so the webhook restarts Michael with the inactive-but-named seat.
