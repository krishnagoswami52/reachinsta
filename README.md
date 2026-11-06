# ReachInsta

**Instagram Reels competitor analytics for creators.** Add the accounts you compete with, and ReachInsta pulls their recent Reels, scores what went viral, and shows you when and how they post: posting-time heatmaps, duration analysis, engagement rates and a viral-reels leaderboard.

Live at **[reachinsta.com](https://reachinsta.com)**. This repository is the full source of the hosted app.

---

## Features

- **Competitor tracking** – add accounts one by one or in bulk
- **Viral reel detection** – a log-weighted viral score (views, likes, comments) plus filtering of broken scrape data, so outliers don't skew the averages
- **Analytics dashboard** – engagement rate by hour and weekday, posting heatmap, reel duration vs. performance, creator leaderboard, scatter and distribution charts
- **Insights panel** – plain-language takeaways generated from the fetched data
- **CSV export** – reels and competitor stats
- **Plans and billing** – Free / Plus / Pro, with Paddle (international, USD) and Razorpay (India, INR)
- **Admin panel** – user management, plan changes, usage and revenue metrics

## How it works

```
Browser (React) ──► Express API ──► PostgreSQL ◄── Background worker ──► Apify (Instagram scrapers)
                                       (job queue)
```

Fetching Instagram data is slow and can fail, so the API never scrapes inline. A request creates a job row; a separate worker loop picks jobs up and runs them. The parts worth a look:

| Piece | Where | What it does |
|---|---|---|
| Priority job queue | `server/worker.ts`, `shared/queue.ts` | 5 concurrent slots. Pro → Plus → Free priority with FIFO inside a tier, per-user concurrency caps, and one slot always reserved for free users so they're never starved. |
| Stuck-job recovery | `server/worker.ts` | Running jobs heartbeat every 60s. A sweep requeues any job silent for 15 minutes (e.g. after a container restart). |
| Apify key rotation | `server/services/keyManager.ts` | Pool of Apify tokens with per-key budget tracking; picks the healthiest key, marks exhausted ones, and resets them monthly via cron. |
| Friendly errors | `server/utils/errorMessages.ts` | Translates raw scraper/API failures into messages a user can act on. |
| Webhook idempotency | `server/routes/paddleWebhook.ts`, `server/routes/razorpayWebhook.ts` | Payment webhooks are verified and de-duplicated before touching a subscription. |
| Database security | `SECURITY.md`, `supabase/migrations/` | Row Level Security on every table so the Supabase REST API can't leak data. |

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts, Wouter
- **Backend:** Express, TypeScript, Drizzle ORM, PostgreSQL (Supabase), session auth with bcrypt, node-cron
- **Services:** Apify (Instagram scraping), Resend (email), Paddle + Razorpay (payments), Cloudflare Turnstile (bot protection on signup)
- **Deploy:** Docker image built by GitHub Actions, pushed to GHCR, deployed to a VPS over SSH

## Running it locally

**Requirements:** Node.js 20+, a PostgreSQL database, and at least one [Apify](https://apify.com) API token.

```bash
git clone https://github.com/krishnagoswami52/reachinsta.git
cd reachinsta
npm install --legacy-peer-deps

cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, SUPER_ADMIN_EMAIL, etc.
```

Put your Apify token(s) in a file called `apify_api.txt` in the project root, one per line. It is git-ignored, and the key manager seeds the rotation pool from it on startup.

```bash
npm run db:push             # create tables
npm run dev                 # http://localhost:5000
```

Notes:
- Payments, email and Turnstile are optional for local development. Leave `TURNSTILE_SECRET_KEY` blank to skip the signup bot check locally.
- If you use Supabase, also apply the SQL in `supabase/migrations/` to enable Row Level Security.
- The app expects the process timezone to be **UTC** (see `docs/analytics-timezone-diagnostic.md`).

### Production build / Docker

```bash
npm run build && npm start
# or
docker build -t reachinsta .
```

`VITE_*` variables are inlined at build time, so pass them as Docker build args (see `Dockerfile` and `.github/workflows/deploy.yml`).

## Plans (hosted version)

| | Free | Plus | Pro |
|---|---|---|---|
| Competitors | 5 | 50 | 100 |
| Fetches / month | 1 | 2 | 4 |
| Time range | 7 days | 14 days | 28 days |
| CSV export | – | – | ✓ |

Limits live in `shared/schema.ts` (`planLimits`). If you self-host, you control them.

## Project structure

```
client/src/        React app (pages, dashboard charts, hooks)
server/            Express API, worker, services, payment webhooks, cron jobs
shared/            Types, DB schema, plan limits, queue config (used by client + server)
supabase/          SQL migrations (RLS, queue priority, key resets)
scripts/           One-off maintenance and verification scripts
tests/             API, end-to-end and load tests
docs/              Audit notes and diagnostics written during development
```

## Contributing

Issues and pull requests are welcome. For anything larger than a small fix, please open an issue first so we can agree on the approach.

## Security

Please don't open public issues for security problems. Report them privately through GitHub's **Security → Report a vulnerability** on this repo. See `SECURITY.md` for how data access is locked down.

## License

[MIT](LICENSE) © Krishna Goswami
