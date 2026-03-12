# $YOP Ponyta King

Phase 3 adds voting, XP, and a leaderboard on top of the existing upload and gallery flow.

## Local Development Workflow

- Use `npm run dev` for normal feature work. Dev output now lives in `.next-dev`.
- Use `npm run build` only when you want a production verification. Production output lives in `.next`.
- If you switch contexts or hit stale chunk issues, run `npm run clean` and then start again.
- Do not keep an old `next dev` process running on another port while starting a new one.
