# Setup, step by step

Do these in order. Each step says what you need, where to find it, and how to check it worked.
**Secrets only ever go into `.env.local` (on your laptop) or the Vercel environment settings. Never in chat, never in git.**

## 0. Prerequisites

- Node 20.6 or newer (`node -v`).
- A terminal in this project folder, then:

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` in an editor. You will fill it in as you go.

## 1. Two secrets you invent

| Name | What to do |
|---|---|
| `VAANI_WEBHOOK_SECRET` | Run `openssl rand -hex 32`, paste the output. |
| `LINK_SECRET` | Run it again for a different value. |
| `DASHBOARD_PASSWORD` | Any strong password. Username is `aangan`. |

## 2. Neon (database)

1. console.neon.tech > New project. Pick the region closest to India (Singapore, `ap-southeast-1`, or Mumbai if offered) and the same region as your Vercel functions if you can.
2. Left menu > **SQL Editor**. Paste all of `db/migrations/001_init.sql` and Run. Safe to run twice.
3. Add designers: at the bottom of that file is a commented `insert into designers ...`. Edit the names and emails,
   uncomment, run. While you are on Resend's free test sender, every designer email must be **your own** Resend signup email.
4. On the project **Dashboard**, click **Connect**, keep the **pooled** connection on, and copy the connection string.
   It looks like `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
   Put it in `.env.local` as `DATABASE_URL=...` yourself. It contains your database password, so never paste it into a chat.

Check: `npm run doctor`, then `npm run smoke:store`.

## 3. Gemini (AI)

1. aistudio.google.com/apikey > Create API key. That is `GEMINI_API_KEY`.
2. Run `npm run models`. Copy one name that is a plain `flash` model (no `preview`/`exp`) into `GEMINI_MODEL`.
3. The free tier allows only a small number of requests per day. If `npm run eval` starts returning 429, wait a day or
   enable billing on the key.

## 4. Resend (email)

1. resend.com > sign up > **API Keys** > Create, permission **Sending access**. That is `RESEND_API_KEY`.
2. `EMAIL_FROM` = `Aangan Studio <onboarding@resend.dev>` to start. This sender only delivers to **the email you signed up with**.
3. `FRONT_DESK_EMAIL` = that same signup email for now. To email real designers later, verify a domain in Resend and change `EMAIL_FROM`.

Check: `npm run doctor -- --send-test` should land an email in your inbox (check spam).

## 5. HubSpot (optional but worth doing for the demo)

1. HubSpot (a free account is fine) > Settings > Integrations > **Private Apps** > Create.
2. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`.
3. Create it and copy the token into `HUBSPOT_PRIVATE_APP_TOKEN`. If left empty the app simply skips deals.
4. If deals fail with a stage error, set `HUBSPOT_PIPELINE` / `HUBSPOT_DEAL_STAGE` to ids from Settings > Objects > Deals > Pipelines.

## 6. Booking link (optional)

Make a free Calendly or Cal.com event type and put its public URL in `CALCOM_BOOKING_URL`. Designers get it on the Reschedule page.

## 7. Run it locally

Set `APP_URL=http://localhost:3000`, then:

```bash
npm run doctor      # every line should say ok
npm test            # 47 tests, no keys needed
npm run dev         # leave running in one terminal
npm run test:webhook                       # in a second terminal: a fake qualified call
npm run test:webhook -- --scenario pricing # a caller who asks about price
```

Open http://localhost:3000 (user `aangan`, your dashboard password). You should see the call, and your inbox should
have the designer email with Claim and Reschedule buttons.

## 8. Put the 10 transcripts in

Copy T01, T02, T03, T04, T07, T09, T10, T11, T14 and T19 from the case pack's `enquiries/` folder into
`eval/transcripts/` (see the README there). **Also diff the two knowledge files** against your case pack copies:
`knowledge/qualified.md` and `knowledge/services.md`. Do **not** add `pricing.md`; the app must never load it.

```bash
npm run eval
```

This calls the dry-run `/api/eval` route (nothing saved, emailed or pushed to HubSpot) and writes `docs/eval-results.md`.
All ten should say pass. Include that table in your submission.

## 9. GitHub and Vercel

1. Create a new **private** repo on GitHub, then in this folder: `git init`, `git add .`, `git commit`, add the remote, push.
   Before the first commit run `git status` and make sure `.env.local` and `eval/transcripts/T*.txt` are **not** listed.
2. vercel.com > Add New > Project > import the repo. Framework: Next.js (auto).
3. Settings > Environment Variables: add every name from `.env.example` with your real values.
   Set `APP_URL` to the Vercel URL (`https://your-app.vercel.app`, no trailing slash). Redeploy after changing env vars.
4. Check the live app:

```bash
npm run doctor                                   # with APP_URL set to the Vercel URL
npm run eval -- --url https://your-app.vercel.app
npm run test:webhook -- --url https://your-app.vercel.app
```

## 10. Connect Vaani

Follow `vaani/agent-setup.md`: greeting, system prompt, webhook URL with `?token=`, events Call Started + Call Post-Processing.
Then make a real test call.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Dashboard is empty but calls happened | `DATABASE_URL` points at the wrong database, the migration was not run, or the webhook token does not match. |
| Webhook returns 401 | `?token=` differs from `VAANI_WEBHOOK_SECRET` in Vercel (redeploy after editing). |
| Webhook returns 500 | Vercel > Logs. Vaani will retry; the app is idempotent so a retry is safe. |
| No designer email | Designer rows empty, Resend sender restriction, or spam folder. The front desk gets the lead instead. |
| `eval` shows 429 | Gemini free-tier quota. Wait or enable billing. |
| A classification looks wrong | Fix the wording in `knowledge/qualified.md` / `services.md`, re-run `npm run eval`. |
