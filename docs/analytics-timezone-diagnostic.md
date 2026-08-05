# Timezone Diagnostic — `reels.posted_at` Integrity

> **Date:** 2026-08-05
> **Trigger:** VPS host runs Asia/Kolkata (IST +05:30), not UTC — is stored data IST-shifted?
> **Method:** read-only. No code, VPS, or DB modifications.
> **Script:** `scripts/audit-tz-check.mjs` (reusable)

---

## 1. Verdict

**SAFE: Stored data is UTC.** Proceed with Phase 2 as planned.

All **2,717 of 2,717** reels were cross-checked against their original Apify payloads (kept verbatim in the `raw_payloads` table — Instagram's own UTC timestamps). The stored `posted_at` wall-clock matches Apify's UTC instant with an offset of **exactly `00:00:00` for every single row**, across the full data range (2026-02-17 → 2026-08-04), spanning both the Replit era and the VPS era. There is no IST shift and no mixed era.

The reason storage is safe *regardless of server timezone* is structural, not lucky: Drizzle serializes `Date` values with `toISOString()` (`node_modules/drizzle-orm/pg-core/columns/timestamp.js:33-34`), which always emits UTC. Postgres then drops the `Z` when casting into `timestamp without time zone`, so the stored wall-clock is the UTC wall-clock no matter what TZ the writing process runs in.

**One caveat found (new):** the *read* path is timezone-sensitive even though the write path isn't — see §4. It doesn't corrupt anything, but it makes correct display depend on the app container's TZ being UTC, which should be confirmed and pinned.

---

## 2. Evidence

### 2.1 Write path (code)

Single insertion point for `posted_at`:

- `server/services/apify.ts:206` — `postedAt = new Date(item.timestamp)` where `item.timestamp` is Apify's ISO-8601 UTC string with `Z` suffix (format category "safe"). Sample from production payloads: `"2026-08-04T13:53:48.000Z"`.
- Inserted via Drizzle → `mapToDriverValue = (value) => value.toISOString()` → literal like `'2026-08-04T13:53:48.000Z'` → `timestamp without time zone` column stores the UTC wall time. **TZ-independent by construction.**
- No other writers; no raw string storage; CSV export (`server/routes.ts:547`) re-serializes with `.toISOString()`.

### 2.2 Ground truth (SQL, decisive)

`raw_payloads.payload` retains the exact Apify items. Joining each reel to its payload item by URL + fetch run:

```
stored_minus_utc | reels | offset_seconds
-----------------+-------+---------------
00:00:00         | 2717  | 0.000000
```

One offset group. Zero. 100% row coverage (2,717 matched / 2,717 with `posted_at`). Per-fetch-run breakdown (70 runs, Feb 23 → Aug 4) shows min_offset = max_offset = 0 in every run — no era boundary from the Replit → VPS migration.

Side-by-side sample:

| Apify (UTC) | Stored `posted_at::text` | Diff |
|---|---|---|
| 2026-08-04T13:53:48.000Z | 2026-08-04 13:53:48 | 0 |
| 2026-08-02T16:39:56.000Z | 2026-08-02 16:39:56 | 0 |
| 2026-08-02T12:30:07.000Z | 2026-08-02 12:30:07 | 0 |

### 2.3 Hour-of-day distribution (sanity check)

Stored-hour distribution peaks at **11:00–16:00** with a trough at **20:00–01:00**. The tracked competitor set is India-heavy (thevarunmayya, techcm_, v.i.s.h.ai, reload_casual_store…). Interpreted as UTC, the peak = **16:30–21:30 IST** (evening prime time in India) and the trough = **01:30–07:00 IST** (overnight) — exactly the expected pattern. Interpreted as IST, the same numbers would imply creators posting mid-day and dead evenings, which contradicts known Instagram behavior. Consistent with UTC storage.

### 2.4 Instagram cross-check (step 5 of the mission)

Superseded by something stronger: the `raw_payloads` comparison in §2.2 *is* Instagram's displayed timestamp (Apify scrapes it from the post itself), captured at fetch time and compared row-by-row rather than eyeballed for 2-3 reels. Verified for all 2,717 reels instead.

---

## 3. Container check (step 3) — partially blocked, low residual risk

Direct execution on the VPS wasn't possible from this machine: SSH to `root@srv1518093.hstgr.cloud` is denied (`publickey,password` — no key configured here), the founder test password is empty in local `.env`, and the Chrome extension was disconnected, so neither `docker compose exec` nor an authenticated live-API probe could run.

What could be established without it:

- **Dockerfile** (`node:20-alpine`): no `TZ` env, no tzdata install, no localtime mount. Docker containers **do not inherit the host's timezone** — an Alpine Node container defaults to UTC unless the (VPS-only, unversioned) `docker-compose.yml` deliberately sets `TZ` or mounts `/etc/localtime`. The host being Asia/Kolkata is therefore *expected to be irrelevant* to the app.
- Local simulation on an IST machine (same TZ as the VPS host) confirmed the write path emits UTC regardless (§2.1), and the DB evidence (§2.2) proves no shift ever reached storage from any environment.

**To close the gap, run this yourself** (read-only; type `! ` before it in this session to run it here):

```bash
ssh root@srv1518093.hstgr.cloud 'docker ps --format "{{.Names}}"; docker exec $(docker ps -q --filter name=reachinsta | head -1) node -e "console.log(new Date().toString()); console.log(Intl.DateTimeFormat().resolvedOptions().timeZone); console.log(process.env.TZ || \"TZ not set\")"'
```

Expected (and near-certain) output: `UTC` / `TZ not set`. If it instead prints Asia/Kolkata, see §4 — display would be shifted, data still fine.

---

## 4. New finding: the read path is TZ-sensitive (storage isn't)

Empirical test with the app's actual driver (`pg` 8.16.3) on an IST machine:

```
raw stored text          : 2026-08-04 16:14:16       (UTC wall clock)
driver Date .toString()  : Tue Aug 04 2026 16:14:16 GMT+0530   ← parsed as READER-local
driver Date .toISOString(): 2026-08-04T10:44:16.000Z  ← instant shifted -5:30
```

`pg` parses `timestamp without time zone` as the **reading process's local time**. Consequences:

- **Production app:** correct *if and only if* the container TZ is UTC (per §3, it almost certainly is). Then `2026-08-04 16:14:16` → `2026-08-04T16:14:16Z` over JSON → browsers show correct local times.
- **If the container were ever IST** (e.g., someone adds `TZ=Asia/Kolkata` to compose): every timestamp served to users and every CSV export would shift −5:30. Data at rest would remain correct; fix would be config-only, no backfill.
- **Local tooling hazard (confirmed):** any script reading this DB from an IST workstation gets shifted instants. The `posted_at` values displayed in yesterday's Phase 1 ER audit output were −5:30 off for this reason (display only — the SQL aggregates were computed server-side in Postgres and were correct).

---

## 5. Impact Analysis

| Question | Answer |
|---|---|
| Days of data affected | **0** — all 2,717 rows verified UTC |
| Widgets showing wrong data due to TZ storage | **None** |
| Widgets with TZ *labeling* problems | Unchanged from Phase 1 audit §6 (charts bucket in browser-local time but say "UTC") — that's a Phase 2 label fix, not corruption |
| Backfill needed | **No** |
| User-facing severity | None today; latent display risk only if container TZ ever changes |

---

## 6. Recommendations (in order)

1. **No data fix needed.** Do not backfill; do not change the VPS host timezone (harmless where it is).
2. **Pin `TZ=UTC` in `docker-compose.yml`** (VPS) as one-line insurance so the read path can never silently shift if the compose file is edited or the stack is rebuilt elsewhere. Cost: one line. Benefit: eliminates the only TZ failure mode left.
3. **Commit `docker-compose.yml` to the repo** (already flagged as N13 in the full audit — this diagnostic is exactly the kind of question it would have answered instantly).
4. **Longer-term (optional, post-Phase 2):** migrate `posted_at` (and other `timestamp` columns) to `timestamptz`. Postgres then stores/returns absolute instants and the reader's TZ stops mattering entirely. Straightforward migration since current values are known-UTC (`ALTER ... TYPE timestamptz USING posted_at AT TIME ZONE 'UTC'`), but it touches every timestamp column and deserves its own tested migration — not a Phase 2 blocker.
5. **Run the §3 one-liner** to confirm container TZ = UTC (30 seconds).

**Phase 2 status: UNBLOCKED.** Timezone-related Phase 2 work remains as scoped in the Phase 1 report (labels first, optional selector after).
