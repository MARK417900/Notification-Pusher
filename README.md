# Dispatch (push)

Scheduled notifications that reach your device via real browser Push —
they arrive even if the tab and browser are fully closed, as long as the
device is online.

This needs a small server running continuously, because something has to
send the push at the scheduled time. A page by itself can never do that —
it isn't running when it's closed.

## How it works

- `server.js` — Express server. Stores your schedule and push subscriptions
  in `data.json`. Every minute, a cron job checks which items are due and
  sends a real Web Push message to your device(s) via the `web-push` library.
- `public/service-worker.js` — registered by your browser once. It receives
  push events from the server and shows the OS-level notification, even with
  no tab open.
- `public/index.html` — the page you open once to subscribe and manage your
  schedule.

## Local setup

```bash
npm install
npm run gen-vapid          # prints a VAPID key pair
cp .env.example .env       # paste the keys in, set an ACCESS_CODE
npm start
```

Open `http://localhost:3000`, enter your access code, click **Enable push
notifications**, allow the browser prompt, then add a dispatch and try
**Send test push**. Close the tab entirely and it should still arrive.

## Deploying so it runs 24/7

This needs a host that keeps a Node process running continuously (not a
serverless function that only wakes on request) — the minute-by-minute
cron check has to keep ticking in the background.

- **Fly.io** — free allowance covers a small always-on machine; good default choice.
- **Railway** — simple git-push deploy, free trial credit then low monthly cost.
- **A small VPS** (DigitalOcean, Hetzner, etc., ~$4–6/mo) — run with `pm2` or
  a systemd service so it restarts on crash/reboot.

Whichever you pick:
1. Push this folder to a GitHub repo (data.json and .env are git-ignored on purpose).
2. Set the environment variables from your `.env` in the host's dashboard
   (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ACCESS_CODE`).
3. Set the start command to `npm start`.
4. Once deployed, open the live URL and subscribe again from there (a
   subscription is tied to the domain you opened it from).

Note: `data.json` is written to local disk — most hosts wipe that on
redeploy unless you attach a persistent volume (Fly.io and Railway both
support this). For a single-user setup this rarely matters day to day.
