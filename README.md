# $YOP Ponyta King

Telegram Mini App MVP with cards, voting, XP, leaderboard, daily check-in, streaks, and referrals.

## Required Environment Variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_APP_URL`
  Preview or production URL for the deployed app.
- `NEXT_PUBLIC_DEV_FALLBACK_AUTH`
  Keep `true` locally. Set `false` for a real Telegram-only preview if you want to force WebApp auth.
- `TELEGRAM_BOT_TOKEN`
  Bot token from BotFather.
- `TELEGRAM_WEBAPP_BOT_TOKEN`
  Usually the same bot token. Used to validate Telegram WebApp `initData`.
- `TELEGRAM_BOT_USERNAME`
  Your bot username, for example `yop_ponyta_bot`.
- `TELEGRAM_WEBHOOK_SECRET`
  Shared secret for the webhook route.
- `DATABASE_URL`
  Postgres connection string.
- `LOCAL_UPLOAD_DIR`
  Local card image upload directory.
- `LOCAL_DATA_DIR`
  Local fallback store directory.

## Local Run Steps

1. Install dependencies:
```bash
npm install
```
2. Create local envs:
```bash
cp .env.example .env.local
```
3. Start the app:
```bash
npm run dev
```
4. Open the app locally.

## Local Development Workflow

- Use `npm run dev` for normal feature work. Dev output now lives in `.next-dev`.
- Use `npm run build` only when you want a production verification. Production output lives in `.next`.
- If you switch contexts or hit stale chunk issues, run `npm run clean` and then start again.
- Do not keep an old `next dev` process running on another port while starting a new one.

## Telegram Bot Setup

1. Open BotFather in Telegram.
2. Create a bot with `/newbot`.
3. Copy the bot token into:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBAPP_BOT_TOKEN`
4. Pick a public URL for the app and set:
```bash
NEXT_PUBLIC_APP_URL=https://your-preview-url.vercel.app
```
5. Set a webhook for the bot to your deployed route:
```text
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```
Use this URL:
```text
https://your-preview-url.vercel.app/api/bot/webhook
```
Pass the secret token you set in `TELEGRAM_WEBHOOK_SECRET`.

## Mini App Setup

The webhook in this repo handles `/start` and responds with an inline `Open Mini App` button.

The button opens:
- `NEXT_PUBLIC_APP_URL`
- and forwards a `/start <payload>` value into `?ref=<payload>` so referral launches can work

If you want to test a referral flow from Telegram later:
- send `/start <referral_code>` to the bot
- tap `Open Mini App`

## Preview Deployment Steps

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add the environment variables from `.env.example`.
4. Deploy.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed preview URL.
6. Redeploy once after changing `NEXT_PUBLIC_APP_URL`.
7. Point your Telegram bot webhook to:
```text
https://your-preview-url.vercel.app/api/bot/webhook
```

## Testing Locally

- For normal local testing outside Telegram:
  - use `?devUser=alice` or `?devUser=bob`
- For Telegram WebApp testing:
  - deploy the app to a public HTTPS URL
  - wire the bot webhook
  - open the app from the bot’s `Open Mini App` button

## Production Auth Behavior

- If Telegram WebApp is available, the app uses real `window.Telegram.WebApp.initData`
- If Telegram WebApp is not available, the app falls back to the existing local dev user flow when `NEXT_PUBLIC_DEV_FALLBACK_AUTH=true`
