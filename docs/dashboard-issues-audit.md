# Dashboard Issues Audit — Pre-PH Launch

**Date:** 2026-09-17 · **Launch:** 2026-09-22 (5 days) · **Mode:** read-only, no code changed, no data mutated
**Branch:** `main` @ `4d1b18e`

> **STATUS: IMPLEMENTED 2026-09-17.** Issues 1 and 2, plus A1 and A2, are fixed
> and pushed (`ff26ed7`, `a4d232e`, `2500042`, `30ef7d6`). Every assumption
> flagged below as unverified has since been checked against production data —
> see **Verification Results** immediately below. A5 was fixed alongside Issue 2.
> A3 and A4 remain open and are still post-launch items.

---

## Verification Results (2026-09-17, post-audit)

Krishna granted production-read access, so every open question in this audit
was settled before a line was changed.

### Issue 2 diagnosis — CONFIRMED

`ownerUsername` carries the **post's** owner, not the scraped profile. Of 5241
scraped items in `raw_payloads`, **152 carry an owner other than the profile
they were scraped from**, and 119 of those reached the `reels` table. The
pattern is unmistakable — a creator's collab with their own show/brand account:

| Scraped profile | Stored under | Items |
|---|---|---|
| `@rajshamani` | `@figuringout.co` | 16 |
| `@techcm_` | `@_krishna_x` | 14 |
| `@vaibhavsisinty` | `@figuringout.co` | 5 |
| `@financewithsharan` | `@onepercentclubshow` | 5 |
| `@karltondennis` | `@wealthmadesimplepod` | 4 |
| `@iamnehanagar` | `@thenehanagarshow` | 4 |

Leak rate in stored data: **119 of 3952 reels (3.0%)**.

### Correction to this audit

The audit stated `coauthorProducers` "does not appear anywhere in this
codebase" — true of the code, but **it is present in the Apify payload**, on
609 of 5422 items (11%). A live run confirmed the shape: the two dropped
`@rajshamani` reels carry `coauthorProducers: ["rajshamani"]`. Option C is
therefore viable whenever you want it; it is still deferred.

### A1 — CONFIRMED, and larger than estimated

`productType` distribution across all stored payloads:

| type | productType | count | is a Reel? |
|---|---|---|---|
| `Video` | `clips` | 4256 | ✅ yes |
| `Sidecar` | `carousel_container` | 528 | ❌ carousel |
| `Sidecar` | `null` | 269 | ❌ carousel |
| `null` | `null` | 181 | ❌ error rows |
| `Image` | `feed` | 156 | ❌ photo |
| `Image` | `null` | 32 | ❌ photo |

**985 of 5241 items (18.8%) were not Reels.** Critically, every item missing
`productType` is an error row, a Sidecar or an Image — **no genuine Reel lacks
the field**, so the strict `!== "clips"` comparison drops nothing real.

### A2 — CONFIRMED, and widespread

**90 of 148 completed runs (61%)** rendered different numbers on the Dashboard
than on Analytics. Worst cases:

| Run | Reels (dash → analytics) | Avg ER (dash → analytics) |
|---|---|---|
| `84a49f34` | 10 → 1 | 0.33% → **3.31%** (10x) |
| `fea35049` | 32 → 13 | 0.64% → 1.56% |
| `6a126e01` | 47 → 33 | 2.30% → 3.28% |
| `e22f2653` | 754 → 695 | 2.43% → 2.64% |

Total views were unaffected (zero-view rows contribute zero), but reel counts
and average engagement were materially understated on the Dashboard.

### Filter impact — replayed over all 173 completed runs

Both new filters were replayed over every stored payload before deployment:

```
stored today   3952
would store    3401      (-551, -13.9%)

drop reasons:  error 181 | pinned 982 | collab 126 | non-reel 554 | stale 178
```

**⚠️ 6 of 173 runs (3.5%) go from having data to zero** — accounts that post
only carousels and photos (`@jahanema.mag`, `@roarwithsimba`, `@appinventiv`,
`@poesiabilhete`, `@quesejapuro`, `@evangelhodarazao`). This is *correct* for a
Reels analytics product, but it made the pre-existing "No data yet. Run your
first fetch" copy actively misleading, so Issue 1's fix added a distinct
"No Reels found." state for a completed run that yielded nothing.

### Live actor validation (2026-09-17)

Two dry runs against the real actor — full parse logic, **no DB writes, no user
quota consumed**:

```
run 1: alexhormozi, garyvee, ali.abdaal      13 items -> 4 kept
       dropped 4 non-reels (all @garyvee photos/carousels)
       (@alexhormozi and @ali.abdaal had zero public posts in the 8-day window)

run 2: rajshamani, financewithsharan, iamnehanagar   18 items -> 3 kept
       dropped 2 collabs: @rajshamani -> owner @figuringout.co (clips)
                          coauthorProducers: ["rajshamani"]
       dropped 6 non-reels

both runs: every kept reel owned by a requested handle   PASS
           every kept reel has productType 'clips'       PASS
```

### Infrastructure note — Apify pool accounting drift (known, current numbers)

Hit while setting up the live test. This is **not a new defect** — the drift is
already understood and documented: `apify_keys.used_budget` is a
cost-per-item estimate accumulated since seeding, never reset when the real
cycle turns over, and Apify's own figure is authoritative
(`server/services/apifyAccount.ts`). What follows is simply the current
magnitude, which is worth knowing going into launch week.

Three keys the DB believed were nearly untouched are in fact at their Apify
hard limit.

| Key | DB `used_budget` | Apify actual | DB correct? |
|---|---|---|---|
| `apify_api_rcuH…` | 0.08 / 5.00 | **5.14 / 5.00** | ❌ |
| `apify_api_Wk7n…` | 0.08 / 5.00 | **5.17 / 5.00** | ❌ |
| `apify_api_Ie7B…` | 0.09 / 5.00 | **5.57 / 5.00** | ❌ |
| `apify_api_AhEK…` | 0.04 / 5.00 | 5.02 / 5.00 | ✅ flagged |

Cause: `recordUsage()` *estimates* spend from item counts, while
`scripts/apify-audit.ts` reads Apify's real cycle total. The two drift.

**Not a launch blocker.** The live error text is `"Monthly usage hard limit
exceeded"`, which matches the `"monthly usage hard limit"` phrase in
`BUDGET_ERROR_PHRASES`, so `isBudgetError()` returns true, the key is retired
and rotation continues. Cost is one wasted attempt per stale key, and
`MAX_KEY_ATTEMPTS` is 10.

**Real pool state: 6 healthy keys, $27.53 remaining.** Four accounts renew
2026-09-26 (after launch); the two fattest run to 2026-09-30 and 2026-10-11.
Adequate for launch. Run `npm run audit:apify` — not the DB — for a true
reading, and consider having the reset job write Apify's figure back into
`used_budget` post-launch so the admin view stops under-reporting.

Note also that the standalone `.env` `APIFY_TOKEN` is itself exhausted. It is
only used for a boolean health check at `server/index.ts:19` — production
fetches run entirely off the rotation pool — so this affects nothing but local
scripts.

---

---

## Executive Summary

| | Issue 1 — dashboard reacts to list changes | Issue 2 — collaborator reels leak in |
|---|---|---|
| **Status** | **Root cause identified — confirmed statically** | **Root cause identified — one assumption unverified** |
| **Layer** | Client only (`client/src/pages/dashboard.tsx`) | Server parser (`server/services/apify.ts`) |
| **Data corrupted?** | **No.** Stored insight data is genuinely frozen per run | **Yes.** Wrong rows are written to `reels` / `competitor_stats` |
| **Fix complexity** | Simple | Simple change, one verification step first |
| **Fix time** | ~45 min | ~30 min + ~20 min verification |

- **Combined fix complexity:** Simple (both are a handful of lines; no schema change, no migration)
- **Estimated fix time:** **2–3 hours** including verification and manual testing. Add ~1h if Additional Finding A1 is fixed too (recommended).
- **Risk of fixing:** **Low** for Issue 1 (pure presentation). **Low–Medium** for Issue 2 — the filter itself is trivial, but it changes what data future fetches contain, and if my reading of the Apify payload is wrong it could be a no-op or (worst case) over-filter. Mitigated by the verification step in §Issue 2.
- **Risk of NOT fixing before PH:** **High.**
  - Issue 1 is a *credibility* bug: the KPI row visibly contradicts itself the moment a user touches the sidebar, and deleting the last competitor makes every chart vanish. On a launch day where most visitors poke at the UI before ever spending a fetch credit, this is the first thing they will do.
  - Issue 2 is a *correctness* bug: users see creators they never added, and those creators pollute the leaderboard, the competitor cards, the CSV export, and every average. "I added one account and it showed me five" is a review-killing first impression.

### Headline finding

**The two issues are not the same class of bug, and the user's mental model of Issue 1 is slightly off in a way that makes the fix easier than feared.**

Nothing on the server recalculates anything when a competitor is added or removed. `GET /api/fetch/latest` is keyed strictly by `fetch_run_id` and returns a frozen snapshot; no query or invalidation ties it to the competitor list; there is no FK, cascade, trigger or RLS policy from `competitors` to `reels`. **The stored insights are already frozen.** What the user is seeing is the dashboard *rendering live competitor-list data side by side with frozen fetch data* — so parts of the page move while the charts stand still. No backend work is required.

---

## Issue 1: Dashboard Recalculation

### Current Behavior

The dashboard page runs two independent React Query subscriptions:

```
client/src/pages/dashboard.tsx:34   useQuery(["/api/profile"])          → live
client/src/pages/dashboard.tsx:35   useQuery(["/api/competitors"])      → live, invalidated on every add/remove
client/src/pages/dashboard.tsx:37   useQuery(["/api/fetch/latest"])     → frozen snapshot of one fetch_run
```

`addCompetitorsMutation` (`:83`) and `removeCompetitorMutation` (`:88`) invalidate **only** `["/api/competitors"]`. React Query refetches that one key, `competitors` changes identity, and the whole `DashboardPage` component re-renders. Everything derived from `competitors` updates instantly; `reels` and `stats` do not change at all.

Five rendered things are wired to the **live** list rather than to the fetch snapshot:

| Line | What it renders | Behaviour on add/remove |
|---|---|---|
| `dashboard.tsx:257` | `competitors.length === 0 ? <EmptyState/> : <insights>` | **Deleting the last competitor hides the entire insight block** — KPI row, all four tabs, every chart. Re-adding one brings the old data back. This is almost certainly what the user read as "insights recalculated". |
| `dashboard.tsx:282` | KPI card `competitors tracked` = `competitors.length` | Ticks down/up immediately, while the neighbouring `reels analyzed` card stays put. The KPI row now self-contradicts: "2 competitors tracked / 33 reels analyzed" from a run over 3 accounts. |
| `dashboard.tsx:103-106` | `canFetch` → Fetch Data button enablement + tooltip copy | Correct behaviour; should stay live. |
| `dashboard.tsx:393,399` | Plan Usage "Competitors" counter and progress bar | Correct behaviour; should stay live. |
| `dashboard.tsx:362` | `<CompetitorList>` sidebar | Correct behaviour; should stay live. |

### Data Flow Diagram

```
  ┌─────────────────────────── FROZEN (per fetch_run_id) ───────────────────────────┐
  │                                                                                 │
  │  POST /api/fetch                                                                │
  │    └─ routes.ts:280  createFetchRun({ competitorUsernames: [...snapshot...] })   │
  │                            │                                                    │
  │                            ▼                                                    │
  │  worker.ts:154   usernames = fetchRun.competitorUsernames   ← snapshot, not live │
  │    └─ apify.ts   processApifyFetch()                                            │
  │         └─ INSERT reels(fetch_run_id, …), competitor_stats(fetch_run_id, …)     │
  │                            │                                                    │
  │  GET /api/fetch/latest     ▼                                                    │
  │    routes.ts:409  getLatestFetchRun(userId)  → ORDER BY created_at DESC LIMIT 1  │
  │    routes.ts:415  getReelsByFetchRun(run.id)        ← WHERE fetch_run_id = $1    │
  │    routes.ts:416  getCompetitorStatsByFetchRun(id)  ← WHERE fetch_run_id = $1    │
  │                            │                                                    │
  └────────────────────────────┼────────────────────────────────────────────────────┘
                               │  { fetchRun, reels, stats }
                               ▼
                   useQuery(["/api/fetch/latest"])  ──────┐
                                                          │
  ┌──────────────────────── LIVE ─────────────────────┐   │
  │  DELETE /api/competitors/:id                      │   │
  │    └─ storage.removeCompetitor()  (competitors    │   │
  │        table ONLY — no cascade to reels)          │   │
  │                    │                              │   │
  │  onSuccess: invalidateQueries(["/api/competitors"])│  │
  │                    ▼                              │   │
  │      useQuery(["/api/competitors"]) refetches  ───┼───┤
  └───────────────────────────────────────────────────┘   │
                                                          ▼
                                             DashboardPage re-render
                                                          │
                        ┌─────────────────────────────────┴─────────────────────────────┐
                        ▼                                                               ▼
        derived from LIVE competitors                                 derived from FROZEN reels/stats
        • :257 empty-state gate  ◄── hides everything                 • :283 reels analyzed   (unchanged)
        • :282 "competitors tracked" KPI                              • :284 total views      (unchanged)
        • :103 canFetch                                               • :285 avg engagement   (unchanged)
        • :393 plan-usage bar                                         • charts / tables       (unchanged)
```

### Root Cause

**`client/src/pages/dashboard.tsx` reads the *current* competitor list where it should read the fetch run's own `competitorUsernames` snapshot.**

The snapshot already exists and is already correct. `fetch_runs.competitor_usernames text[]` (`shared/schema.ts:61`) is written at enqueue time (`routes.ts:280`), is what the worker actually scrapes (`worker.ts:154-155`), and is returned to the client on every `/api/fetch/latest` response inside `fetchRun`. **The dashboard simply never reads it.**

Two distinct symptoms, one cause:

1. **The empty-state gate (`:257`) is the loud one.** It asks "does the user track anyone *right now*?" when the question it should ask is "did the last run produce anything?" Delete your last competitor and a perfectly good completed run is hidden behind "No competitors tracked yet."
2. **The KPI card (`:282`) is the quiet one.** It mixes a live count into a row of otherwise-frozen run metrics, so the row stops being internally consistent.

### Confirmed NOT the cause (checked and ruled out)

- No cascade from `competitors` to `reels`/`competitor_stats` — both FK only to `fetch_runs` (`shared/schema.ts:80, 97`). Deleting a competitor cannot delete reels.
- No RLS policy links them — `reels`, `competitor_stats` and `competitors` all have RLS enabled with **zero policies** (`supabase/migrations/20260501000000_enable_rls_security.sql:233, 246, 258`); all reads go through the service-role server.
- `/api/fetch/latest` takes no competitor parameter and performs no join (`server/routes.ts:406-423`).
- Nothing anywhere in `client/src/` invalidates, refetches, resets or mutates `["/api/fetch/latest"]` or `["/api/fetch", id]` on a competitor mutation (grepped every `invalidateQueries`/`refetchQueries`/`setQueryData`/`removeQueries`/`resetQueries` call site).
- `staleTime: Infinity` + `refetchOnWindowFocus: false` (`client/src/lib/queryClient.ts`) means `/api/fetch/latest` cannot refetch incidentally either.
- The Analytics page (`client/src/pages/analytics.tsx`) is **already correct** — it is driven entirely by `/api/fetch/history` + `/api/fetch/:id` and never reads the competitor list. No fix needed there.
- The Competitors page (`client/src/pages/competitors.tsx:39`) renders `latestFetch.stats` unconditionally — it does **not** have the empty-state bug.

### Files Involved

| File | Lines | Role |
|---|---|---|
| `client/src/pages/dashboard.tsx` | 35, 83, 88, 257, 282 | **The bug.** Live list used for frozen-state rendering |
| `client/src/pages/dashboard.tsx` | 103-106, 362, 393-399 | Live list used *correctly* — leave alone |
| `shared/schema.ts` | 61 | `fetch_runs.competitor_usernames` — the snapshot to switch to |
| `server/routes.ts` | 406-423 | `/api/fetch/latest` — already correct, no change |
| `server/routes.ts` | 280 | Snapshot written at enqueue — already correct, no change |
| `server/worker.ts` | 154-155 | Worker already uses the snapshot — already correct, no change |

### Recommended Fix

**Client-only. No endpoint, schema or migration change.**

1. **Derive a frozen count from the run** (`dashboard.tsx`, near line 91 where `reels`/`stats` are unpacked):
   ```ts
   const fetchedUsernames = fetchRun?.competitorUsernames ?? [];
   ```

2. **Fix the KPI card (`:282`)** — show what the run covered, not what the list holds today:
   ```ts
   <KPICard title="competitors fetched" value={fetchedUsernames.length}
            subtitle={`of ${profile?.maxCompetitors || 5} max`} icon={Users} />
   ```
   Renaming the label to "competitors fetched" is worth doing: it makes the frozen semantics self-evident and removes any perceived conflict with the sidebar count.

3. **Fix the empty-state gate (`:257`)** — this is the important one. Gate the insight block on whether there is data to show, not on the live list:
   ```ts
   {reels.length === 0 && !isProcessing ? (
       competitors.length === 0 ? <EmptyState title="No competitors tracked yet." …/>
                                : <EmptyState title="No data yet." …/>
   ) : ( …insights… )}
   ```
   Net effect: a completed run keeps rendering even after the user empties their list, and a user with no competitors *and* no data still sees the onboarding empty state. The two conditions get evaluated in the right order.

4. **Optional but recommended (~15 min):** add a one-line staleness banner above the KPI row when the live list has diverged from the snapshot:
   > *"Showing your fetch from {time}. Your competitor list has changed since — run a new fetch to update."*

   This converts the remaining (correct) inconsistency from "the app is buggy" into "the app is being precise", which is exactly the impression you want on launch day. Compute it as a set-difference between `fetchedUsernames` and `competitors.map(c => c.username)`.

### Risk Assessment

**Low.** Presentation-layer only; no data path, no endpoint, no migration.

What could break:
- **Empty-state regression.** The nesting in step 3 must keep the `isProcessing` guard, or a user with a queued first fetch will see "No data yet" flash under the progress stepper. Test the three states explicitly.
- **First-time users.** A brand-new user has `competitors = []` *and* `latestFetch = null`. Verify they still land on "No competitors tracked yet." with the working focus-the-input CTA (`dashboard.tsx:262-267`) — that CTA is the primary onboarding path and must not regress.
- **`fetchRun.competitorUsernames` is nullable** (`text("competitor_usernames").array()`, no `.notNull()`). Legacy or worker-fallback runs may carry `null`. The `?? []` in step 1 covers it, but the KPI would then read 0 on such a run; consider falling back to `stats.length` when the array is empty.
- **Serialization:** `competitorUsernames` already ships to the client inside `fetchRun` on every `/api/fetch/latest` response — confirmed, no API change needed.

### Testing Requirements

1. Complete a fetch with 3 competitors → note KPI row and charts.
2. Delete 1 competitor → **charts, KPI row and all tabs must not move**; sidebar count and plan-usage bar go 3→2; Fetch Data stays enabled.
3. Delete all 3 → **insights must still render**; empty state must *not* appear; Fetch Data becomes disabled with the "Add at least one competitor first" tooltip.
4. Add a new competitor → insights still unchanged; Fetch Data re-enables.
5. Click Fetch Data → stepper appears, and only on completion does the dashboard change.
6. Fresh account, zero competitors, zero fetches → onboarding empty state renders with a working "Add your first competitor" CTA.
7. Queued/running run with competitors → stepper shows, no spurious "No data yet".
8. Hard reload after step 3 → state persists (nothing was stored in component state).

---

## Issue 2: Collaboration Reels

### Current Behavior

`processApifyFetch` (`server/services/apify.ts:186`) sends one Apify run for all tracked handles, then walks the returned dataset and **stores every item under whatever `ownerUsername` the item carries** — with no check that the username was one it asked for.

```
server/services/apify.ts:216   directUrls = usernames.map(u => `https://www.instagram.com/${u}`)
server/services/apify.ts:235   reelsInput = { directUrls, resultsType: "posts", resultsLimit,
                                              onlyPostsNewerThan, searchType: "hashtag",
                                              searchLimit: 1, addParentData: false }
server/services/apify.ts:286   for (const item of postsData) {
server/services/apify.ts:288       if (item.error) continue;              // error rows
server/services/apify.ts:292       if (item.isPinned === true) continue;  // pinned posts
server/services/apify.ts:297       const username = (item.ownerUsername || "").toLowerCase();
server/services/apify.ts:298       if (!username) continue;               // missing owner
server/services/apify.ts:307       if (!reelUrl) continue;                // missing URL
server/services/apify.ts:317       if (postedAt < cutoffDate) continue;   // outside time range
server/services/apify.ts:345       reelsToInsert.push({ fetchRunId, username, … })   ← NO OWNERSHIP CHECK
server/services/apify.ts:358       userStatsMap.set(username, …)                     ← NO OWNERSHIP CHECK
```

There are **five** skip conditions in that loop. **None of them is "is this username one the user actually tracks?"** The `usernames` array is used to build `directUrls` at line 216 and then never referenced again.

Worse than a display leak: because `userStatsMap` is also keyed on the raw `ownerUsername` (`:358`), a collaborator gets a **`competitor_stats` row of their own** (`:399-428`) — a full leaderboard entry, a competitor card, a CSV row, and a slot in the follower-scraper call (`:373`, which spends additional Apify credit on accounts the user never added).

### Apify Configuration

| | |
|---|---|
| **Actor** | `shu8hvrXbJbY3Eb9W` (`apify.ts:15`) — Apify's official **`apify/instagram-scraper`** |
| **Followers actor** | `7RQ4RlfRihUhflQtJ` (`apify.ts:16`) |
| **Mode** | `directUrls` (per-profile), `resultsType: "posts"` |
| **Per-profile cap** | `resultsLimit` = 11 / 21 / 36 for 7 / 14 / 28 days (`apify.ts:220-224`) |
| **Recency** | `onlyPostsNewerThan` = 8 / 15 / 29 days, then a second client-side `postedAt < cutoffDate` filter at `:317` |
| **Dead params** | `searchType: "hashtag"`, `searchLimit: 1` — meaningless alongside `directUrls`; leftovers |

### Apify Response Structure

The parser's own type (`apify.ts:148-178`) documents the fields it expects:

```ts
interface InstagramPostData {
  id, shortCode, url, type, productType,
  ownerUsername, ownerFullName, ownerId,      // ← the attribution fields
  caption, hashtags, mentions,
  commentsCount, likesCount,
  videoPlayCount, videoViewCount, videoDuration,
  timestamp, displayUrl, videoUrl,
  inputUrl,                                   // ← which directUrl produced this item
  isPinned, …
}
```

Note what is **declared but never used**: `inputUrl` (`apify.ts:176`) — the input URL that produced the item — and `type` / `productType`, which distinguish a Reel (`productType: "clips"`) from a photo or carousel.

**`coauthorProducers` does not appear anywhere in this codebase** — neither in the interface nor in any handling code. `apify/instagram-scraper` exposes collaborators on that field in current versions; this parser is unaware of it.

### Root Cause

**This is a filtering bug, not an Apify bug.**

On Instagram, a collab post appears on **both** creators' grids, but carries a single `owner`. When the scraper walks `instagram.com/alexhormozi`, it returns the collab post that appears there — and if the other creator is the owner, the item arrives with `ownerUsername = <the other creator>`. The parser takes that value at face value (`:297`), attributes the reel to a stranger, and creates a `competitor_stats` row for them.

Apify is doing exactly what it was asked: "give me the posts on this profile." The scope error is entirely on our side — we have the requested `usernames` in hand at line 216 and never use them as an allowlist.

**Honest caveat — one assumption I could not verify.** The above depends on `apify/instagram-scraper` setting `ownerUsername` to the *post's* owner rather than to the *scraped profile*. That is the documented behaviour and it is consistent with the reported symptom (a stranger's handle appearing in the UI can only come from `ownerUsername`, since that is the sole source of `reels.username`). But I could not confirm it against a real payload: the `raw_payloads` table holds the complete untouched Apify response for every run (`apify.ts:262`), and the read-only query I wrote to inspect it was **blocked by this environment's production-read permission**. See §Verification Step below — it is 5 minutes of work and it removes the last doubt.

If that assumption were wrong, the alternative explanations are: (a) the dead `searchType`/`searchLimit` params causing a search fallback when a `directUrl` fails to resolve — unlikely but the params should go regardless; or (b) `addParentData: false` altering attribution, which does not match the documented meaning of that flag.

### Files Involved

| File | Lines | Role |
|---|---|---|
| `server/services/apify.ts` | **286-367** | **The bug.** Parse loop with no ownership check |
| `server/services/apify.ts` | 297 | `ownerUsername` accepted unconditionally |
| `server/services/apify.ts` | 345-357 | Leaked reel inserted |
| `server/services/apify.ts` | 358-365 | Leaked creator gets a stats row |
| `server/services/apify.ts` | 148-178 | `InstagramPostData` — needs `coauthorProducers`, `productType` |
| `server/services/apify.ts` | 235-243 | Actor input — dead `searchType`/`searchLimit` |
| `server/services/apify.ts` | 370-380 | Followers actor called for leaked usernames too (wasted credit) |
| `server/services/apify.ts` | 186-190 | `usernames` param — the allowlist, available and unused |
| `server/routes.ts` | 620-695 | CSV exports inherit the leak (no change needed once fixed) |

### Verification Step (do this first — 5 min, read-only)

`raw_payloads` retains the full Apify JSON for every run, so this is answerable offline with **zero** Apify spend. Run against production **read-only**:

```sql
-- 1. How much leaks today, and who?
SELECT fr.id, fr.competitor_usernames, r.username, count(*) AS reels
FROM fetch_runs fr JOIN reels r ON r.fetch_run_id = fr.id
WHERE fr.status = 'completed'
  AND NOT (lower(r.username) = ANY (SELECT lower(u) FROM unnest(fr.competitor_usernames) u))
GROUP BY 1,2,3 ORDER BY reels DESC LIMIT 25;

-- 2. Does ownerUsername really diverge from the scraped profile?
SELECT it->>'ownerUsername'                                            AS owner,
       it->>'inputUrl'                                                 AS input_url,
       (it ? 'coauthorProducers')                                      AS has_coauthor_field,
       jsonb_array_length(COALESCE(it->'coauthorProducers','[]'::jsonb)) AS coauthors,
       it->>'productType'                                              AS product_type,
       count(*)                                                        AS n
FROM raw_payloads rp, jsonb_array_elements(rp.payload) it
WHERE rp.actor = 'instagram_scraper' AND jsonb_typeof(rp.payload) = 'array'
GROUP BY 1,2,3,4,5 ORDER BY n DESC LIMIT 40;
```

Query 2 answers everything at once: whether `ownerUsername` ≠ the `inputUrl` handle (confirms the root cause), whether `coauthorProducers` is present (tells you if the richer filter in Option B is available), and how many non-`clips` items are being stored as "reels" (Additional Finding A1). Query 1 quantifies the existing blast radius.

### Recommended Fix

**Option A — post-processing allowlist (recommended).**

Build a normalized set from the `usernames` already passed into `processApifyFetch`, and reject any item whose owner is not in it. One insertion in the parse loop, right after line 298:

```ts
// near the top of processApifyFetch, beside `directUrls` (~:216)
const requested = new Set(usernames.map(u => u.toLowerCase().replace("@", "")));
let collabSkipped = 0;

// in the parse loop, immediately after the `if (!username) continue;` at :298
if (!requested.has(username)) {
  collabSkipped++;
  continue;   // collaboration / tagged post — not this competitor's own reel
}
```
…and log `collabSkipped` alongside the existing `pinnedCount` line (`:368`) so the effect is observable in production from day one.

This is ~6 lines, needs no Apify knowledge, cannot over-filter (the set is exactly what the user asked for), and fixes `reels`, `competitor_stats`, the leaderboard, the competitor cards, both CSV exports and the wasted follower-scraper calls in one stroke. It is also the only option that is *guaranteed* correct regardless of how Apify represents collabs — an item whose owner is not a tracked handle should never be stored, whatever the reason.

**Option B — Apify-side parameter.** `apify/instagram-scraper` has no "exclude collaborations" input. The nearest lever is `onlyPostsNewerThan` (already used) and post-hoc use of `coauthorProducers`. There is no Apify parameter that solves this. **Not viable as the primary fix.**

**Option C — `coauthorProducers`-aware filter (a refinement of A, optional).** Once verified present, you could additionally keep a collab post when the *tracked* creator is among its `coauthorProducers` — i.e. treat a genuine collab that the tracked account co-produced as theirs. This is a product decision, not a bug fix, and it contradicts the stated expected behaviour ("only show reels where he's the primary creator/owner"). **Recommend deferring until after launch.**

### Trade-offs

| | Option A (allowlist) | Option B (Apify param) | Option C (coauthor-aware) |
|---|---|---|---|
| **Effort** | ~30 min | n/a | ~1.5 h + verification |
| **Correct regardless of payload shape** | ✅ | — | ❌ depends on the field existing |
| **Fixes stats/CSV/leaderboard too** | ✅ | — | ✅ |
| **Saves Apify credit** | ✅ fewer follower lookups | ❌ | ✅ |
| **Risk** | Low | — | Medium |
| **Downside** | Result counts drop. `resultsLimit` is per profile (11 for a 7-day run), and collab posts consume slots *before* filtering — so a creator who collabs heavily may return 11 posts and store only 7. Consider bumping `resultsLimit` by ~30% in the same PR if post counts look thin after the fix. | No such parameter exists | Contradicts the stated expected behaviour |

**The `resultsLimit` interaction is the one real trade-off and it deserves a decision.** Filtering makes the data correct but can make it sparser. Bumping `resultsLimit` costs Apify credit per fetch — relevant given the 10-account / $50 rotation pool. Recommendation: **ship the filter alone**, watch the `collabSkipped` log for a day, and bump `resultsLimit` only if the skip rate is material.

### Testing Requirements

1. Run verification query 2 above and confirm `ownerUsername` diverges from `inputUrl` on collab posts.
2. Add **only** `@alexhormozi`, fetch 7 days → every row in `reels` has `username = 'alexhormozi'`; `competitor_stats` has exactly one row.
3. Check the worker log for `collabSkipped > 0` — proves the filter fired rather than the input simply being clean.
4. Confirm `reels.length` is still non-trivial; if it collapses, revisit `resultsLimit`.
5. Multi-competitor run (3 handles) → `SELECT DISTINCT username FROM reels WHERE fetch_run_id = …` returns a subset of `fetch_runs.competitor_usernames` and nothing else.
6. Leaderboard, Competitors tab, competitor cards and both CSV exports show only tracked handles.
7. A run whose competitor collabs with nobody must be **unchanged** vs. a pre-fix run — regression check that the filter is not over-eager.
8. Follower-scraper call receives only tracked usernames (log `uniqueUsernames`).

---

## Combined Fix Plan

### Recommended Order

**1. Issue 2 first (the data bug).** It corrupts what gets written. Every fetch run between now and the fix produces permanently wrong rows, and a PH visitor's *first* fetch is the one that matters. It is also the cheaper of the two to verify, because `raw_payloads` lets you confirm the diagnosis and validate the filter offline without spending Apify credit.

**2. Issue 1 second (the presentation bug).** It corrupts nothing — the frozen data is already correct on the server. It is a pure client change that can be verified against existing runs with no fetch credit spent, so it can land as late as the day before launch without risk.

They touch disjoint files (`server/services/apify.ts` vs `client/src/pages/dashboard.tsx`), so they can also be done in parallel or in either order if convenient. The ordering above optimizes for "what hurts a launch-day user most."

### Files to Modify

| File | Change | Why |
|---|---|---|
| `server/services/apify.ts` | Add `requested` allowlist set (~:216) and the ownership skip in the parse loop (~:299); extend the `pinnedCount` log with `collabSkipped` (~:368) | **Issue 2 root cause.** Stops non-tracked creators entering `reels` and `competitor_stats` |
| `server/services/apify.ts` | Remove `searchType: "hashtag"` and `searchLimit: 1` (`:240-241`) | Dead params with `directUrls`; removes the one alternative leak hypothesis |
| `server/services/apify.ts` | Add `coauthorProducers?: { username?: string }[]` and keep `productType` on `InstagramPostData` (`:148-178`) | Type honesty; enables Option C later and A1 now |
| `client/src/pages/dashboard.tsx` | `fetchedUsernames` from `fetchRun.competitorUsernames` (~:91) | **Issue 1 root cause.** The frozen source of truth |
| `client/src/pages/dashboard.tsx` | KPI card `:282` → frozen count, relabel "competitors fetched" | Stops the KPI row contradicting itself |
| `client/src/pages/dashboard.tsx` | Re-nest the empty-state gate `:257` | Stops a completed run vanishing when the list empties |
| `client/src/pages/dashboard.tsx` | *(optional)* staleness banner above the KPI row | Turns correct-but-confusing into explicit |

**No changes needed to:** `server/routes.ts`, `server/worker.ts`, `server/storage.ts`, `shared/schema.ts`, `client/src/pages/analytics.tsx`, `client/src/pages/competitors.tsx`. All are already correct.

### Migration Needs

**None.** No schema change, no new column, no Drizzle migration, no Supabase migration. `fetch_runs.competitor_usernames` already exists and is already populated.

**Optional data cleanup (not required, and I'd skip it before launch):** existing `reels`/`competitor_stats` rows for untracked usernames from past runs will remain. Verification query 1 quantifies them. Deleting them is a **destructive mutation on production** — out of scope for this audit, needs its own decision, and historical runs arguably should stay as they were recorded. The new filter only affects runs from the fix forward.

### Rollback Plan

- **Issue 2:** revert the commit. The filter is additive and side-effect-free; removing it restores the previous (leaky) behaviour immediately. No data written under the fix needs undoing — it is a strict subset of what would have been written before. Safe to revert at any time, including mid-launch.
- **Issue 1:** revert the commit. Client-only; a redeploy of the previous bundle fully restores prior behaviour. Note the Vite build-time env constraint from prior work — a client revert means a rebuild, not just a restart.
- Both are small, isolated, single-file commits. Keep them as **two separate commits** so either can be reverted independently.

---

## Pre-PH Launch Decision

### Recommendations

**Fix before PH: Yes — both.**

- **Issue 2 is non-negotiable.** It is a correctness bug in the core value proposition. "I added one competitor and it showed me reels from five accounts I've never heard of" is the kind of thing that ends up in a PH comment thread, and it is a ~30-minute fix with a verification path that costs nothing. The cost/benefit is not close.
- **Issue 1 is strongly recommended.** It is not data corruption, but it is *visible within seconds* of anyone touching the sidebar — and touching the sidebar is exactly what a curious visitor does before spending a fetch credit. The worst case (delete your last competitor, watch the entire dashboard disappear) reads as "the app lost my data."

**Estimated total time: 2–3 hours.**

| Step | Time |
|---|---|
| Verification queries against `raw_payloads` | 20 min |
| Issue 2 filter + dead-param removal + logging | 30 min |
| Issue 1 client changes (KPI + empty-state gate) | 45 min |
| Issue 1 optional staleness banner | 15 min |
| Manual test pass, both issues | 45 min |
| **Total** | **~2h35m** |

One live fetch is needed to fully validate Issue 2 end-to-end (~1 Apify run). Everything else validates against existing data.

**Risk if delayed:** High. Five days is ample; the fixes are small, isolated, independently revertable, and touch no schema. Delaying trades a 2–3 hour known cost against a launch-day impression you cannot re-take. Neither fix carries the kind of risk that justifies waiting.

**User experience impact after the fix:**
- The dashboard becomes a genuine point-in-time snapshot — stable, predictable, and matching the mental model the user described.
- Fetch results contain only accounts the user chose. Leaderboards, competitor cards and CSV exports all become trustworthy in one change.
- Bonus: fewer wasted follower-scraper lookups per fetch, which is real Apify credit back into the rotation pool.

---

## Additional Findings

Discovered during the audit. **None is a blocker**, but A1 is close to one and is nearly free to fix alongside Issue 2.

### A1 — Non-reel posts are stored as reels *(Medium — fix with Issue 2)*

The actor is called with `resultsType: "posts"` (`apify.ts:237`), which returns **photos and carousels as well as reels**. The parse loop never checks `type` or `productType`, so a static image post is inserted into the `reels` table with `views = 0` (no `videoPlayCount`), `engagementRate = 0` (`:333` — division guarded by `views > 0`) and `durationSeconds = 0`.

Consequences:
- Every zero-view photo post **drags the dashboard's average engagement toward zero**.
- The `reels analyzed` KPI overstates the real reel count.
- The duration chart and scatter plot get a phantom 0-second bucket.

This is very likely a contributor to the "numbers look wrong" impression alongside Issue 2. **Fix:** in the same parse loop, skip items where `productType !== "clips"` (verify the exact value against `raw_payloads` first — query 2 above returns the `productType` distribution). Roughly 3 lines, same PR as Issue 2.

### A2 — Dashboard and Analytics disagree on the same run *(Medium)*

`client/src/pages/analytics.tsx:83-101` filters out reels with `views <= 0` and `engagementRate > 0.30` as scrape failures, with a well-reasoned comment. **`dashboard.tsx:97-101` applies no such filter** — it averages over the raw `reels` array.

So for one and the same fetch run, the dashboard and the Analytics page display **different** total views, average engagement and reel counts. A user who clicks "View Full Analytics" (a CTA the dashboard deliberately pulses at them, `dashboard.tsx:307-330`) sees the numbers change under them. That is a trust problem on the exact path the product pushes hardest.

**Fix:** extract the `validReels` predicate into a shared helper (`client/src/lib/` or `shared/`) and apply it in both places. ~30 min. Note that A1 removes most of the zero-view rows at the source, which shrinks the discrepancy but does not eliminate it — the `> 30% ER` guard is still dashboard-side-missing.

### A3 — CSV export fields are not quoted or escaped *(Low)*

`server/routes.ts:650` and `:684` build CSV by `r.join(",")` with no quoting and no escaping. Today's exported columns (username, URL, integers, decimals, ISO timestamp) cannot contain a comma, so nothing is broken **right now** — but the moment anyone adds caption, full name or location to the export, columns will silently shift. There is also no defence against CSV formula injection (a leading `=`, `+`, `-` or `@` in a text cell executing in Excel/Sheets) — and `@`-prefixed usernames are exactly the shape that trips that heuristic. **Fix:** a 5-line `csvEscape()` helper. Post-launch is fine.

### A4 — `competitor_usernames` is nullable *(Low)*

`shared/schema.ts:61` declares `text("competitor_usernames").array()` without `.notNull()`, and `worker.ts:156-158` has a fallback path that reads the live competitor list when the column is empty. That fallback is the one place in the backend where a run's scope could drift from its snapshot — it would scrape whatever the list holds *at worker time*, not at enqueue time. In practice `routes.ts:280` always populates it, so the branch appears to be dead. **Fix:** either add `.notNull()` (needs a migration — post-launch) or replace the fallback with a hard error. It also matters to Issue 1's fix, which reads the column and needs the `?? []` guard. Post-launch.

### A5 — Dead actor-input parameters *(Cosmetic)*

`searchType: "hashtag"` and `searchLimit: 1` (`apify.ts:240-241`) are inert alongside `directUrls`. Harmless today, but they are the only plausible alternative explanation for Issue 2 if the `ownerUsername` hypothesis fails verification, and they invite exactly the kind of confusion this audit had to rule out. Delete them with the Issue 2 fix.

---

## Audit Constraints & Confidence

**Observed:** read-only. No file in `client/`, `server/`, `shared/` or `supabase/` was modified. No data was mutated. `npm run dev` was not run (it would attach the worker to the production DB).

**One thing I could not do:** a read-only `SELECT` against production `raw_payloads` / `reels` was **blocked by this environment's production-read permission gate**. The queries are written out in §Verification Step and are pure `SELECT`s — please run them (or grant the permission) before implementing Issue 2.

**Confidence:**

| Claim | Confidence | Basis |
|---|---|---|
| Issue 1 root cause is client-side coupling to the live list | **High** | Every layer traced: no FK, no cascade, no RLS policy, no join, no invalidation. Exhaustively grepped |
| Issue 1's backend is already frozen and needs no change | **High** | `/api/fetch/latest` reads by `fetch_run_id` only (`routes.ts:406-423`) |
| Issue 2 is a missing ownership filter in the parse loop | **High** | Directly readable: `usernames` is used at `:216` and never again; five skip conditions, none about ownership |
| The leak arrives specifically via `ownerUsername` on collab posts | **Medium-High** | `ownerUsername` is the only source of `reels.username`, so a stranger's handle can only come from there. The *mechanism* (collab attribution) matches documented Apify behaviour but is **unconfirmed against a real payload** — see §Verification Step |
| Option A fixes it regardless of mechanism | **High** | An allowlist on the requested handles is correct whatever produced the foreign owner |
| A1 (non-reel posts stored as reels) | **Medium-High** | `resultsType: "posts"` plus no `productType` check is unambiguous in the code; the *volume* is unverified pending query 2 |

**External verification still worth doing:** the `apify/instagram-scraper` input schema, to confirm the current `productType` value for reels (`"clips"`) and the exact shape of `coauthorProducers`. Both are answerable from `raw_payloads` without touching Apify docs or spending credit.
