# Aangan Studio: AI call agent

Every phone enquiry answered within minutes, day or night. Qualified leads reach a designer with full context.
A dashboard shows results and running cost. **The agent never quotes a price.**

Built for MESA Case 03 (AI and its Application). Stack: Vaani AI, Next.js on Vercel, Neon (Postgres), Gemini Flash, Resend, HubSpot.

- Live app: https://aangan-call-agent-nine.vercel.app (login: user `aangan`, password shared separately)
- Component map: [docs/component-map.html](docs/component-map.html)
- Eval results: [docs/eval-results.md](docs/eval-results.md) (10 of 10 pass)
- Setup guide: [docs/SETUP.md](docs/SETUP.md) · Voice agent prompt: [vaani/agent-setup.md](vaani/agent-setup.md)

## Automation brief

**Pain.** Aangan Studio (Pune interior design, founder Nikhil Deshpande) gets about 200 enquiries a month. Around 48% get no
reply within 48 hours and a third arrive after hours. A reply within an hour converts about four times better, so the studio
loses its best leads to silence.

**User.** Callers (homeowners and small-office owners in Pune) who want an answer now. Behind them, 14 designers who need a
qualified lead with context, and Nikhil, who owns pricing and the relationship with the business.

**Outcome.** Every call is answered, qualified against Nikhil's five criteria, and, when it fits, booked into a consultation
during the call. The right designer gets an email with the whole story. Nikhil sees calls, after-hours calls, qualified, booked,
show-ups, wins and cost on one page.

**Journey today.** Caller rings, nobody picks up after hours, a missed call sits until someone remembers, and by the time anyone
replies the caller may have talked to another studio.

**Journey with the agent.**

1. Caller rings at 10pm. Vaani answers, asks seven short questions, books a slot.
2. The post-call webhook reaches the app, which stores the call and classifies it.
3. Qualified: the designer gets an email with Claim and Reschedule buttons, and a HubSpot deal appears.
4. Complaint: the front desk gets the email. Anything else is logged.
5. The dashboard counts the call, flags it as after-hours, and adds its cost.

## The Cut

Nikhil also asked for the agent to quote standard per-sq-ft pricing. **We cut that.** A price spoken in the studio's voice is
heard as a commitment and cannot be taken back. Pricing is Nikhil's call.

It is enforced in three places, not one:

1. The voice prompt forbids any price, rate, per-sq-ft figure, range or estimate, and gives the exact deflection line.
2. `pricing.md` is **never loaded** into any prompt: it is not in the repo (git-ignored), and `lib/knowledge.ts` reads only `qualified.md` and `services.md`.
3. `lib/guard.ts` strips price and estimate lines from everything the AI writes (handoff note, fit reason, scope, timeline). A caller's own budget passes through. `auditAgentTurns` flags any agent turn that quoted a figure, and the dashboard shows the count as "price slips".

Asking about price never disqualifies a caller. The classifier records `asked_pricing`, and the designer note says
"Asked about pricing; told designer will cover it."

## The Nine Checks

| # | Check | Answer | Why |
|---|---|---|---|
| 01 | Is the problem real? | Yes | About 48% of ~200 monthly enquiries get no reply in 48 hours; a third are after hours. |
| 02 | Is the workflow repeated? | Yes | ~200 calls a month and the first four steps are identical every time. |
| 03 | Is the input available? | Yes / partly | `services.md` and `qualified.md` are enough to answer and qualify. `pricing.md` exists but is never used for output. |
| 04 | Is the output valuable? | Yes | A consultation booked during the call, on an ₹8–14 lakh project. |
| 05 | Is the impact measurable? | Yes | Time to first response, consultations booked and show-up rate, from day one (dashboard). |
| 06 | Is the failure risk OK? | Yes, except pricing | Answering, qualifying and booking are low-risk. Pricing is not, so it is cut. |
| 07 | Is judgment protected? | Partly | Quoting, committing to site visits or dates, and complaints stay with humans. |
| 08 | Is the ROI worth it? | Yes | About 96 unanswered calls a month; a small lift covers the tool cost many times over. |
| 09 | Is the owner clear? | Yes | The agent qualifies and books, the designer owns the relationship, Nikhil owns the price. |

## Component map

Full picture: [docs/component-map.html](docs/component-map.html).

| Stage | Component | What it does |
|---|---|---|
| Trigger | Vaani AI voice agent | Answers, qualifies, books. Sends `call_started` and `call_postprocessing`. |
| Input | `app/api/vaani/webhook/route.ts` | `?token=` auth (constant-time), parse, hand to the pipeline. 500 on failure so Vaani retries. |
| Context | `knowledge/qualified.md`, `knowledge/services.md` | The only knowledge the AI sees. |
| Processing | `lib/pipeline.ts`, `lib/store.ts` | Idempotent upsert, atomic claim, duration and after-hours, designer routing. |
| AI | `lib/classify.ts`, `lib/guard.ts` | Gemini Flash JSON classification, then the price filter. |
| Output | `lib/email.ts`, `lib/hubspot.ts`, `app/page.tsx` | Designer or front-desk email, HubSpot deal, dashboard. |

## Telegram or email for the designer handoff?

**Email.** The email carries the whole structured record plus Claim and Reschedule buttons. It needs no app or bot setup for
14 designers, leaves an audit trail, and works on any phone. The trade-off is slower attention than a chat ping. A Telegram
notification that links to the same email is a cheap later add-on and changes only the output stage.

## Engineering rules, and where they live

| Rule | Where |
|---|---|
| Webhook auth with `?token=` | `lib/vaani.ts` `tokenOk`, constant-time compare |
| Idempotent | `upsertCall` returns "duplicate" once classified; `claimForProcessing` is atomic and expires after 5 minutes |
| Never lose a lead | AI or DB failure emails the raw transcript to the front desk (`lib/pipeline.ts`) |
| Outputs independent and best-effort | Designer email and HubSpot run in parallel; each failure is recorded in `output_errors` |
| Signed links, GET confirm then POST | `lib/links.ts` (HMAC-SHA256), `lib/lead-action.ts` |
| Dry-run eval | `app/api/eval/route.ts`: no database row, email or CRM |
| No secrets in git | `.gitignore` excludes `.env*`; the dashboard and server read secrets from env only |
| Transcript is untrusted | Prompt tells the model to treat it as data; output is coerced and validated; the guard runs last |

## Dashboard

Password protected (user `aangan`, password from `DASHBOARD_PASSWORD`; the app refuses to serve it if unset in production).
Thirty-day tiles: calls, after-hours calls, qualified, booked, showed up, won (with value), cost, cost per booking and price
slips. Then a by-day table and the recent calls, where the team marks a lead as showed up or won. Cost includes voice minutes
(`VAANI_RATE_INR_PER_MIN`) and AI tokens (`GEMINI_INR_PER_M_INPUT/OUTPUT`).

## Run it

Full steps with where to find every key: [docs/SETUP.md](docs/SETUP.md).

```bash
npm install
cp .env.example .env.local      # fill it in
npm run doctor                  # checks every key and service
npm test                        # 51 tests, no keys needed
npm run dev
npm run test:webhook            # fake Vaani call into your local app
npm run eval                    # 10 real transcripts through the dry-run route
```

| Script | What it does |
|---|---|
| `npm run doctor` | Checks env values and pings Neon, Gemini, Resend, HubSpot and the app. Never prints keys. `-- --send-test` sends one email. |
| `npm run models` | Lists the Gemini models your key can use, for `GEMINI_MODEL`. |
| `npm run smoke:store` | Exercises the real database store and removes its test row. |
| `npm run test:webhook` | Sends a fake `call_started` + `call_postprocessing`. `--scenario qualified\|pricing\|complaint\|notfit`, `--url`. |
| `npm run eval` | Runs `eval/transcripts/T*.txt` through `/api/eval` and writes `docs/eval-results.md`. |

## Eval

Ten real September enquiries (T01, T02, T03, T04, T07, T09, T10, T11, T14, T19) are run through the same classifier as the live
webhook, in dry-run mode. The expected answers are in `eval/expected.json`. The table is in `docs/eval-results.md`.
Transcripts are git-ignored because they contain real callers' details.

## Gotchas we hit

- Older Gemini Flash models return 404 "no longer available to new users". Pick a current one with `npm run models`.
- Vaani webhooks are unsigned, so the secret is in the URL. `call_duration` is milliseconds and sometimes missing; we derive it from start to end.
- Resend's test sender only delivers to your own signup email.
- Neon's free plan pauses idle databases; the first request after a pause is a little slow. `DATABASE_URL` is a secret: keep it in `.env.local` and Vercel only.
- Email scanners auto-click links, hence GET to confirm, POST to record.
- Inbound phone calls cost money. Keep test calls short.

## Extending

WhatsApp and the web form reuse everything except the trigger: add a route that produces the same `CallRecord` (transcript text,
phone number, timestamps) and call `handleEvent`. The classifier, guard, routing, outputs and dashboard are channel-agnostic.
