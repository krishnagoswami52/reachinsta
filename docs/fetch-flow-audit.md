# Fetch Flow Audit Report

**Date:** 2026-08-20
**Scope:** `POST /api/fetch` end-to-end — request → queue → worker → Apify → persistence → UI
**Method:** Read-only source review + read-only queries against the production database
**Status:** No code, config, schema, or data was modified.

---

## Executive Summary

ReachInsta's fetch pipeline uses a **database-backed job queue with an in-process poller**. `POST /api/fetch` validates, writes a `fetch_runs` row and a `jobs` row, decrements quota, and returns immediately — it never waits on Apify. A worker started inside the same Node process (`server/index.ts:141`) polls `jobs` every 5s, claims one atomically, and runs the Apify actors to completion. There are **no webhooks anywhere in the fetch path** (the only webhook in the codebase is Paddle's). The browser polls `/api/fetch/latest` every 3s.

The good news is real and structural: because the job is durably persisted *before* the HTTP response, the flow is **completely immune to the client disappearing**. Closing the tab, losing the network, or logging out mid-fetch changes nothing — the worker reads `job.userId` from the database and has no session dependency. Having no webhook also means there is no missed-callback failure mode to defend against. Foreign keys cascade correctly, so deleting an account leaves no orphans. These are the parts to keep.

The bad news is that **the pipeline has no crash recovery and no concurrency**, and both failures are already visible in production data. `getQueuedJobs()` selects only `status='queued'`, while `claimJob()` flips a job to `'running'` — so any job interrupted by a restart is stranded in `'running'` forever and is never retried. Three such jobs exist right now, the oldest from 2026-02-23. One of them belongs to `yulkakadran@gmail.com`, whose **only** fetch has been stuck at `'running'` since 2026-07-16: their dashboard has been polling every 3 seconds for five weeks, their fetch button is permanently disabled, and their single free-plan credit is spent. That is a first-time user permanently bricked by their first action. Separately, the worker processes jobs **strictly one at a time** (`for … await` in `server/worker.ts:84`), and the Apify call has **no timeout at all** — so one hung actor run blocks every other user in the system indefinitely.

**Overall reliability: 5/10 — not launch-ready as-is.** Three Critical items (no stuck-job recovery, no Apify timeout, no worker concurrency) are launch-day blockers: a Product Hunt spike is precisely the traffic shape that turns a sequential 63-second-average queue into a 30-minute wait. Two more are quietly expensive: **17 of 97 "completed" fetches (17.5%) contain zero reels** yet still consumed the user's quota, and the Apify key pool is **monotonically shrinking** — `is_exhausted` is set but never reset anywhere in the codebase, and 3 of 10 keys are already retired having spent under $0.50 of their $5.

---

## Current Architecture

```
Browser                    Express (single container)              Postgres              Apify
   |                                                                  |                    |
   |-- POST /api/fetch ----> isAuthenticated                          |                    |
   |                         fetchLimiter (2/min/user)                |                    |
   |                         zod validate body                        |                    |
   |                         load profile --------------------------> SELECT               |
   |                         check timeRangeDays vs plan              |                    |
   |                         check fetchesUsed < limit                |                    |
   |                         check competitors exist + ownership      |                    |
   |                         INSERT fetch_runs (queued) ------------> INSERT               |
   |                         INSERT jobs (queued) ------------------> INSERT               |
   |                         UPDATE profiles.fetches_used += 1 -----> UPDATE               |
   |<---- 200 {fetchRun} ----|   (returns here — nothing awaited)     |                    |
   |                                                                  |                    |
   |                       +- worker tick (every 5s, same process) ---|                    |
   |                       |  getQueuedJobs()  status='queued' LIMIT 10                    |
   |                       |  claimJob()       queued -> running (atomic CAS)              |
   |                       |  processApifyFetch():                    |                    |
   |                       |    UPDATE run -> running --------------> UPDATE               |
   |                       |    actor(instagram).call(input) ----------------------------> ### BLOCKS
   |                       |      getBestKey(): highest remaining budget                   |  (no timeout,
   |                       |      on budget error -> markExhausted -> retry next key       |   waits forever)
   |                       |    dataset.listItems() <--------------------------------------- ###
   |                       |    recordUsage(); INSERT raw_payloads --> INSERT              |
   |                       |    UPDATE run -> analyzing -------------> UPDATE              |
   |                       |    parse/filter/score in memory          |                    |
   |                       |    INSERT reels (bulk) -----------------> INSERT              |
   |                       |    actor(followers).call() ---------------------------------> ### (try/caught)
   |                       |    INSERT competitor_stats (bulk) ------> INSERT              |
   |                       |    UPDATE run -> completed -------------> UPDATE              |
   |                       +- next job (only now)                     |                    |
   |                                                                  |                    |
   |-- GET /api/fetch/latest (every 3s while non-terminal) ---------> SELECT x 3           |
   +-- stops polling when status in {completed, failed}               |                    |
```

**Key files**

| Concern | Location |
|---|---|
| Fetch endpoint | `server/routes.ts:214` (`app.post("/api/fetch", …)`, inline handler) |
| Rate limit | `server/middleware/rate-limit.ts:71` (`fetchLimiter`) |
| Job worker | `server/worker.ts` (started at `server/index.ts:141`) |
| Apify orchestration | `server/services/apify.ts:101` (`processApifyFetch`) |
| Token rotation | `server/services/keyManager.ts` + `server/storage.ts:618` |
| Persistence | `server/storage.ts:480-613` |
| Schema | `shared/schema.ts:57-124` |
| UI | `client/src/pages/dashboard.tsx:37-72`, `client/src/components/dashboard/fetch-status-stepper.tsx` |

---

## Detailed Findings

### Part 1 — Endpoint Discovery

| Item | Value |
|---|---|
| Route | `POST /api/fetch` |
| Handler | Anonymous inline async handler, `server/routes.ts:214` (no named function) |
| Middleware chain | `isAuthenticated` → `fetchLimiter` → handler |
| Apify service | `server/services/apify.ts` → `processApifyFetch(fetchRun, usernames)` |
| Invoked by | `server/worker.ts:36`, never by the HTTP handler |
| Actors | `shu8hvrXbJbY3Eb9W` (Instagram scraper), `7RQ4RlfRihUhflQtJ` (followers) |
| Related routes | `GET /api/fetch/history`, `GET /api/fetch/latest`, `GET /api/fetch/:id`, `POST /api/fetch/:id/cancel` |

### Part 2 — Request Lifecycle

**Order of operations in the handler** (`server/routes.ts:214-291`), all before any external call:

1. `isAuthenticated` (session) → 401
2. `fetchLimiter` — 2 requests/min keyed by `req.user.claims.sub` (`rate-limit.ts:80-83`) → 429
3. `fetchDataSchema.safeParse(req.body)` → 400
4. Load profile → 404 if missing
5. `timeRangeDays > profile.timeRangeMaxDays` → 403
6. `fetchesUsed >= monthlyFetchLimit` → 403
7. Zero tracked competitors → 400
8. **Ownership check** — client-supplied usernames must be a subset of tracked competitors → 403 `COMPETITOR_NOT_OWNED` (`routes.ts:243-258`). This is a good guard; it prevents burning Apify budget on arbitrary handles.
9. `competitorUsernames.length > maxCompetitors` → 403 `PLAN_LIMIT_COMPETITORS`
10. `INSERT fetch_runs` status `queued`
11. `INSERT jobs` type `fetch_apify` status `queued`
12. `UPDATE profiles SET fetches_used = fetches_used + 1` (read-modify-write — see M1)
13. `res.json(fetchRun)`

**When is Apify called?** Not during the request. Earliest is the next worker tick (0–5s later), and only once every previously queued job ahead of it has fully finished.

**What is sent to Apify** (`apify.ts:132-140`): `directUrls` built from usernames, `resultsType: "posts"`, `resultsLimit` (11/21/36 by time range), `onlyPostsNewerThan` (8/15/29 days), `addParentData: false`. Notably **no `timeout`, no `waitSecs`, no `maxItems`, no `maxTotalChargeUsd`**.

**Token source:** yes, from the rotation pool — `getBestKey()` → `storage.getBestApifyKey()` (`storage.ts:618`) selects the single non-exhausted key with the **highest remaining budget**. This is failover-ordered, not round-robin (see H3 and Scenario 7).

**Response timing:** immediately after the DB writes. Fully async pattern. **Response body:** the complete `fetch_runs` row (`id`, `userId`, `timeRangeDays`, `competitorUsernames`, `status: "queued"`, `createdAt`, nulls for the rest). No Apify job ID is returned — none exists yet.

### Part 3 — Job Tracking

Two tables. `fetch_runs` is the user-facing record; `jobs` is the worker's work item.

`fetch_runs` (`shared/schema.ts:57-70`): `id`, `user_id` (FK → profiles, **cascade**), `time_range_days`, `competitor_usernames text[]`, `status`, `error_message`, `started_at`, `completed_at`, `created_at`. Indexed on `user_id` and `status`.

`jobs` (`shared/schema.ts:109-121`): `id`, `user_id` (FK, cascade), `fetch_run_id` (FK, cascade), `type`, `status`, `attempts`, `last_error`, `created_at`, `updated_at`. Indexed on `status`.

**Notably absent:** no `apify_run_id` / `apify_job_id` column anywhere. The Apify run ID exists only as a local variable inside `processApifyFetch`. **Once the worker loses it, the run is unrecoverable** — there is no way to reconnect to an in-flight Apify run or retrieve its dataset after a restart. This is the root enabler of C1.

**Also absent:** no `updated_at` on `fetch_runs`, so "how long has this been stuck" can only be derived from `started_at`.

**Creation timing:** both rows are created **before** Apify is contacted, in the HTTP request. This is the right choice and is what makes the flow tab-close-safe.

**Status vocabulary:** `fetchStatusTypes` declares `queued | running | merging | analyzing | completed | failed`. `merging` is **never written by any server code** (grep confirms only client-side references) — the stepper renders a "Merging" step that never activates.

### Part 4 — Webhook Handling

**There is no Apify webhook endpoint.** The only webhook route in the codebase is `POST /api/webhooks/paddle` (`server/routes/paddleWebhook.ts:72`), which is unrelated to fetching. `.call()` is invoked without the `webhooks` option.

The entire fetch pipeline is **pull-based**: the worker holds an open connection to Apify and polls the run to completion via `apify-client`. Consequently:

- There is no job_id → user_id linking problem to solve; the worker already holds the `fetchRun` in scope.
- There is no webhook idempotency concern.
- **There is no "missed webhook" failure mode.** This is a genuine architectural strength and removes an entire class of bugs.
- But it converts the problem into a different one: **the worker process itself is the single point of failure.** If it dies, the run is lost with no callback to resurrect it. There is no polling fallback, no reconciliation job, and no `apify_run_id` stored to reconcile *with*.

### Part 5 — Data Persistence

`reels` (`schema.ts:72-89`) keys on `fetch_run_id` (FK → fetch_runs, cascade), not on `user_id`. Ownership is transitive: `reels → fetch_runs.user_id → profiles.id`. `competitor_stats` and `raw_payloads` follow the same pattern. Every FK in the chain is `onDelete: "cascade"`.

**Write timing** (`apify.ts:261-352`), sequential and **not transactional**:

1. `INSERT raw_payloads` (full Apify JSON — the safety net; present even on the empty runs)
2. `UPDATE fetch_runs → analyzing`
3. `INSERT reels` — one bulk insert of all rows
4. followers actor call (wrapped in its own try/catch — failure here is non-fatal and logged)
5. `INSERT competitor_stats` — one bulk insert
6. `UPDATE fetch_runs → completed, completed_at`

There is no `db.transaction()` around steps 3–6. A crash between step 3 and step 6 leaves reels persisted, stats missing, and status stuck at `analyzing`.

**Account deleted mid-fetch:** cascade deletes handle this cleanly — `jobs`, `fetch_runs`, `reels`, `competitor_stats`, and `raw_payloads` all disappear with the profile. No orphaned rows. The in-flight worker would then fail at its next write (`updateFetchRun` returns undefined; inserts violate FK) and burn a retry, but no data corruption results. Low risk, acceptable.

**Duplicate protection:** `reels` has indexes on `fetch_run_id`, `username`, `views` but **no unique constraint** on `(fetch_run_id, reel_url)`. `createReels` is a plain `INSERT … RETURNING` with no `onConflict` (`storage.ts:517`). See H6.

### Part 6 — Failure Scenarios

See the dedicated table below.

### Part 7 — UI Feedback

**Mechanism:** TanStack Query polling. No WebSocket, no SSE. `dashboard.tsx:37-45` sets `refetchInterval` to 3000ms while `fetchRun.status` is one of `{queued, running, merging, analyzing}` and `false` otherwise — so polling self-terminates on a terminal status. Sensible design.

**Display:** `FetchStatusStepper` renders a 5-step progress rail (Queued → Fetching → Merging → Analyzing → Completed) driven by a `statusOrder` map. On `failed` it swaps to a red panel reading *"Fetch Failed — Something went wrong. Please try again."* A "Stop Fetching" button is shown while processing (`dashboard.tsx:187`). The fetch button is disabled whenever `isProcessing` (`dashboard.tsx:146`).

**On completion:** the 3s poll picks up the new status and reels, and the UI updates automatically — no manual refresh needed. A toast fires on *start* ("Fetch started… may take a few minutes"), but **there is no toast or notification on completion**. A user who navigates away gets no signal; average run is 63s and the max observed is 746s, so this matters.

**Gaps:**
- The "Merging" step never lights up — the rail jumps Fetching → Analyzing.
- No elapsed-time or ETA display during a run that averages 63s and can reach 12+ minutes.
- The generic failure copy hides actionable causes ("all Apify keys exhausted" vs. "Instagram returned nothing" read identically).
- A stuck `running` run makes the UI poll **forever** at 3s intervals with no timeout, no staleness warning, and a permanently disabled fetch button.

---

## Failure Scenarios Table

| # | Scenario | Actual behavior (verified in code) | Verdict |
|---|---|---|---|
| 1 | **User closes tab right after clicking fetch** | The job is durably in Postgres before the response is written (`routes.ts:269-283`); Apify has not been called yet. The worker picks it up on its next tick regardless of the client. Data is saved in full and visible on next login. Nothing is lost. | **Safe** |
| 2 | **User logs out during processing** | The worker reads `job.userId` from the DB and never touches the session. Session destruction is irrelevant. Data lands on the correct user. No webhook is involved, so no auth-context problem exists. | **Safe** |
| 3 | **Server restarts mid-fetch** | **Data is lost.** The Apify run continues on Apify's side, but its run ID was only ever a local variable and is stored nowhere, so nothing can reconnect to it or read its dataset. The `jobs` row is stranded at `'running'`, and `getQueuedJobs()` filters on `status='queued'` (`storage.ts:569-577`) — it is never re-queued. The `fetch_runs` row is stranded at `running`/`analyzing`. The user's UI polls forever and their fetch button stays disabled. **Confirmed in production: 3 dangling jobs; one run stuck since 2026-07-16.** | **Fails** |
| 4 | **Apify run exceeds 30 minutes** | No `waitSecs` and no `timeout` are passed to `.call()` (`apify.ts:143`); `apify-client` documents this as *"waits indefinitely"*. There is no server-side timeout either. The only bound is whatever default run timeout the actor carries on Apify's platform — not configured in this repo. If the actor errors, the error propagates → up to 3 full re-runs → `failed`; the user sees generic failure text and their quota is **not** refunded. If the actor merely hangs, the worker hangs with it and **every other user's fetch is blocked behind it**. | **Fails** |
| 5 | **Apify webhook never received** | Not applicable — no webhooks are used in the fetch path. There is no callback to miss. The equivalent risk is Scenario 3 (worker death), which is unhandled. | **N/A by design** |
| 6 | **User clicks fetch 5x rapidly** | Click 1 disables the button via `isProcessing`, so in practice the UI stops it. Against the API directly: `fetchLimiter` allows 2/min/user, so calls 3–5 get 429. Calls 1–2 both succeed if quota allows — **there is no server-side in-flight guard**, so two concurrent runs for one user are possible, each consuming a quota credit. One user already has 2 runs inside the same minute (`a4eee431`, 2026-05-25). No duplicate detection exists. | **Partial** |
| 7 | **30 users fetch in the same second** | All 30 HTTP requests succeed quickly (writes only). Then the queue serialises completely: `getQueuedJobs()` returns at most 10 per tick, and `worker.ts:84-86` runs them in a `for … await` loop — **one job at a time, no parallelism**. Measured average completed-run duration is **63s** (max **746s**), so the 30th user waits roughly **30 minutes**, and longer if any run is slow. The 10-token pool does **not** help: `getBestApifyKey()` always returns the single highest-remaining-budget key, so tokens provide failover, not throughput. | **Fails** |
| 8 | **Network drops between Apify and server** | No webhook, so nothing is "in flight" to lose. `apify-client` retries its own HTTP calls (`maxRetries: 8`, exponential backoff from 500ms) which absorbs transient blips. A hard failure of `.call()` or `listItems()` throws → worker retries the **entire** job from scratch up to 3x → Apify is re-paid in full each time. Data eventually arrives if the network recovers within 3 attempts. | **Works, expensively** |

---

## Reliability Assessment

| Aspect | Grade | Notes |
|---|---|---|
| Tab close resilience | **A** | Job persisted before response; worker is fully client-independent. Nothing to improve. |
| Logout resilience | **A** | Worker keys off `job.userId` in the DB, zero session coupling. Correct by construction. |
| Server restart resilience | **F** | No stuck-job recovery. `getQueuedJobs()` ignores `running`. No `apify_run_id` stored, so in-flight runs are unrecoverable even in principle. 3 orphans in production today. |
| Concurrent fetch handling | **D** | Strictly sequential worker, `LIMIT 10` per tick, single instance, single token in use at a time. 63s average serialises into ~30min for 30 users. `claimJob` is correctly atomic — the only thing keeping this above F. |
| Data loss prevention | **C** | `raw_payloads` preserves the full Apify response (excellent), cascades are correct, and no duplicates exist today. But writes are non-transactional, `reels` has no unique constraint, and restart-orphaned runs lose everything. |
| User feedback | **C** | 3s polling with self-termination and a clear stepper is solid. Undercut by a dead "Merging" step, no completion notification, no ETA, generic error copy, and infinite polling on stuck runs. |

**Overall grade: 5/10.** The foundations — durable queue, atomic claim, cascade integrity, raw payload retention, no webhook dependency — are genuinely well built. The operational layer around them (recovery, timeouts, concurrency, quota fairness) is missing, and production data shows it has already cost real users.

---

## Recommendations for Launch

### Critical — must fix before launch

**C1. Recover jobs stranded in `running`.** *Severity: Critical · Frequency: every deploy/restart with an active fetch · Impact: user permanently locked out, quota spent, UI spins forever · Effort: 2–3h · Priority: 10*
`getQueuedJobs()` (`storage.ts:569`) must also return jobs where `status='running'` and `updated_at < now() - interval '15 minutes'`, re-queueing them through the existing attempts/retry path. Add a startup sweep that requeues or fails any `running` job older than the threshold. Without this, every single production deploy can brick a user.
Existing orphans need a one-off reconciliation: 3 `jobs` rows and 1 `fetch_runs` row (`700e0341-6742-45c6-b1b3-71a339f304cc`, user `yulkakadran@gmail.com`) — mark the run failed and refund the credit. *(Not performed — this audit was read-only.)*

**C2. Bound the Apify call.** *Severity: Critical · Frequency: any slow/hung actor run · Impact: one user's hung run blocks the entire platform · Effort: 30min · Priority: 10*
Pass `waitSecs` **and** `timeout` to both `.call()` sites (`apify.ts:143, 278`). Measured max is 746s, so ~900–1200s is a defensible ceiling. This single change also prevents most of C1's causes.

**C3. Process jobs concurrently.** *Severity: Critical · Frequency: guaranteed on launch day · Impact: ~30min wait for the 30th concurrent user; they will assume it's broken and leave · Effort: 4–6h · Priority: 9*
Replace the `for … await` in `worker.ts:84-86` with a bounded pool (`Promise.all` over N claimed jobs, N≈3–5, tuned to the key pool). `claimJob()` is already an atomic CAS, so concurrent claiming is safe today — the change is contained. Consider round-robining `getBestApifyKey()` among healthy keys so parallel runs actually spread across tokens instead of hammering one.

### High — fix within 2 weeks

**H1. Refund quota on failure and cancellation.** *Severity: High · Frequency: ~10% of runs (7 failed + 3 cancelled of 105) · Impact: a free user's single monthly credit is destroyed by a system-side failure · Effort: 1–2h · Priority: 9*
`fetches_used` is incremented at `routes.ts:284-287` and never decremented — not in the permanent-failure branch (`worker.ts:63-76`), not on cancel (`routes.ts:371-374`). With `monthlyFetchLimit: 1` on free, one infrastructure hiccup ends that user's month. This is the highest-leverage trust fix on the list.

**H2. Investigate the 17.5% empty-result rate.** *Severity: High · Frequency: 17 of 97 completed runs · Impact: "Completed" with an empty dashboard and a spent credit — reads as a broken product · Effort: 3–4h · Priority: 8*
All 17 have a `raw_payloads` row, so Apify responded — the parser filtered everything out (error items, `isPinned`, missing `ownerUsername`, or the `postedAt < cutoffDate` filter at `apify.ts:209`). 13 of the 17 cluster in June 2026, suggesting a scraper output change. The payloads are retained, so this is diagnosable offline without spending credits. At minimum, surface a distinct "no posts found in this time range" state instead of a silent empty success, and consider not charging quota for a zero-yield run.

**H3. Stop permanently retiring Apify keys.** *Severity: High · Frequency: continuous, irreversible · Impact: pool shrinks to zero over time; total fetch outage · Effort: 2h · Priority: 8*
`markApifyKeyExhausted` sets `is_exhausted = true` (`storage.ts:641`) and **nothing anywhere resets it** (grep-confirmed). Apify free credit renews monthly, so a key exhausted once is dead forever. Three of ten are already retired having used **$0.29, $0.32 and $0.49 of $5** — under 10%. Effective pool is 7 and falling. Add a monthly reset (cron, alongside the existing downgrade job) and/or clear the flag when `used_budget` is well under `total_budget`.

**H4. Tighten `isBudgetError`.** *Severity: High · Frequency: unknown, but likely the cause of H3's premature retirements · Impact: healthy keys destroyed by unrelated errors · Effort: 1h · Priority: 8*
`keyManager.ts:87-111` substring-matches a joined error blob against phrases as loose as `"insufficient"`, `"no credit"`, `"reached the limit"`. Any Apify error containing those substrings permanently retires a working key. The `statusCode === 402` check is the reliable signal; the phrase list should be narrowed to unambiguous full phrases.

**H5. Make cancel actually cancel.** *Severity: High · Frequency: whenever a user cancels a run that has already started — the common case · Impact: Apify cost still incurred; cancelled run can resurrect as "completed" · Effort: 2–3h · Priority: 7*
`routes.ts:359-360` searches only `getQueuedJobs()` — `status='queued'`, `LIMIT 10`. A job already `running` is never found, so the worker keeps going and later overwrites the run's status back to `completed` (`apify.ts:349`). The `LIMIT 10` also means a queued job outside the first 10 is silently missed. Cancel should set a `cancelled` flag the worker checks at each stage, and `.abort()` the Apify run.

**H6. Add idempotency before retrying.** *Severity: High (cost) / Medium (data) · Frequency: every retry · Impact: Apify billed 2–3x for one user request; duplicate reels possible · Effort: 2–3h · Priority: 7*
`worker.ts:50-62` re-runs `processApifyFetch` from scratch — including both paid actor calls. There is no dedupe: `createReels` is a plain insert (`storage.ts:517`) and `reels` has no unique constraint on `(fetch_run_id, reel_url)`. A failure *after* the reels insert (e.g. the `numeric field overflow` path in `createCompetitorStats`) duplicates every reel on retry. Zero duplicates exist today — the hazard simply hasn't been triggered yet. Add the unique index plus `onConflictDoNothing`, and delete prior rows for the run before re-inserting.

### Medium — fix within 1 month

**M1. Make the quota decrement atomic.** *Severity: Medium · Frequency: rare but already observed · Impact: free fetch granted · Effort: 30min · Priority: 6*
`routes.ts:224` reads `profile.fetchesUsed` and `routes.ts:285` writes `+ 1`. Two concurrent requests both read N and both write N+1, granting a free fetch. The rate limiter permits 2/min. Use `SET fetches_used = fetches_used + 1 WHERE fetches_used < monthly_fetch_limit RETURNING` and treat zero rows as the quota rejection — this fixes the race and M2 together.

**M2. Reject a new fetch while one is in flight.** *Severity: Medium · Frequency: two tabs / direct API use · Impact: double quota spend, double Apify cost · Effort: 1h · Priority: 6*
Only the UI enforces this (`dashboard.tsx:105`). Two tabs or a direct API call bypass it.

**M3. Cap per-run Apify spend.** *Severity: Medium · Frequency: pathological accounts · Impact: one run can drain a $5 key · Effort: 1h · Priority: 5*
Neither `maxItems` nor `maxTotalChargeUsd` is passed (`apify.ts:142`).

**M4. Wrap the persistence steps in a transaction.** *Severity: Medium · Frequency: crash during write window · Impact: reels without stats, non-terminal status · Effort: 2h · Priority: 5*
Steps 3–6 of the write sequence are independent statements.

**M5. Reset quota inside the fetch path.** *Severity: Medium · Frequency: clients that skip `/api/profile` · Impact: user wrongly blocked past reset date · Effort: 30min · Priority: 4*
The monthly reset only runs in `GET /api/profile` (`routes.ts:86-90`). Note `yulkakadran@gmail.com`'s `fetches_reset_at` (2026-07-31) has already passed, yet they remain locked out — because `isProcessing` blocks them independently of quota.

### Low — nice to have

**L1. Remove or implement the `merging` status** (`schema.ts:19`, `fetch-status-stepper.tsx:13`). The step never activates. *Effort: 15min · Priority: 3*

**L2. Notify on completion.** A toast fires on start but not on finish, for a job averaging 63s. *Effort: 1h · Priority: 3*

**L3. Show elapsed time / ETA during a run**, and warn when a run exceeds a staleness threshold rather than polling silently forever. *Effort: 2h · Priority: 3*

**L4. Surface actionable error copy.** "All Apify keys exhausted" and "Instagram returned nothing" both render as *"Something went wrong. Please try again."* *Effort: 1h · Priority: 3*

**L5. Store `apify_run_id` on `fetch_runs`.** Not needed once C1/C2 land, but it is the only thing that would make a genuinely interrupted run *recoverable* rather than merely *cleanable*. *Effort: 1h · Priority: 2*

**L6. Swap the rate-limit store if you ever scale horizontally.** In-memory is correct for one container and is already documented at `rate-limit.ts:12-14`. *Effort: 1h · Priority: 2*

---

## Appendix — Production Evidence (read-only queries, 2026-08-20)

```
fetch_runs by status          completed 97 | failed 7 | running 1 (since 2026-07-16)
jobs by status                completed 97 | failed 5 | running 3   <- orphans, attempts=0
total                         105 runs across 79 distinct users
completed run duration        avg 63s | max 746s (n=97)
completed runs, zero reels    17 of 97 (17.5%) — all have a raw_payloads row
duplicate (run, reel_url)     0
failed run reasons            Cancelled by user x3 | Monthly usage hard limit x3 | APIFY_TOKEN not configured x1
apify keys                    10 total | 3 flagged exhausted at $0.2863 / $0.3217 / $0.4940 of $5.00
multiple runs in one minute   1 user (a4eee431, 2026-05-25) — 2 runs
```

**Orphaned jobs (`status='running'`, never recoverable):**

| job id | fetch_run_id | run status | stranded since |
|---|---|---|---|
| `37ea88bb-c09d-4267-bbe6-386e948dff94` | `700e0341-…f304cc` | **running** | 2026-07-16 |
| `4c9ecd09-f60d-47dd-ac76-6ea8450500ec` | `5bdcc5f0-…561e3170` | failed (user cancelled) | 2026-07-01 |
| `27b59f0d-da32-44c8-8451-c5f0ad5feb74` | `5b989142-…81a1763cbe` | failed | 2026-02-23 |

The first is live user harm: `yulkakadran@gmail.com` (free plan, `fetches_used 1/1`) has exactly one fetch run in their history, and it has been stuck at `running` for five weeks. The other two show the same worker-death pattern; those users escaped only by pressing "Stop Fetching", which marks the run failed while leaving the job row dangling — the escape hatch works, but it costs them their credit.
