# Analytics Page — Diagnostic Audit Report

> **Date:** 2026-08-05
> **Scope:** Phase 1 audit only — no code changes made
> **Source doc:** `design-references/claude-code-analytics-audit-and-fixes.md`
> **Data basis:** live production DB (2,717 reels), full read of all 13 analytics components

---

## 1. Executive Summary — Top 5 Issues by Impact

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **Time labels are wrong, not the times.** Every time-based chart buckets by the *browser's local* hour (`new Date(...).getHours()`), yet subtitles and the Tips glossary claim "(UTC)". Users are told times are UTC when they're actually already local. | HIGH — recommendations look unusable ("8:00 UTC?") when they're actually actionable | Low |
| 2 | **319 reels (11.7%) have `views = 0`** and are stored with ER = 0. They silently drag down the Avg ER KPI, every hour/weekday/duration average, and the heatmaps. This is a far bigger data-quality problem than the high-ER outliers (only 3 reels, 0.11%). | HIGH — every average on the page is understated | Low |
| 3 | **Four different duration-bucket schemes** exist in four files. The same 45-second reel lands in "45-60s" on one chart, "31-45s" on another. Two of the four charts on the Duration tab show essentially the same metric with different buckets. | HIGH — visible contradiction, erodes trust | Low |
| 4 | **Widget duplication is worse than reported.** Overview ⊂ Creators (2 identical charts), Timing has two heatmaps with the identical title "Posting Time Heatmap", `ViralReelsTable` appears on 3 pages, and Dashboard repeats 3 analytics widgets. | MED-HIGH — page feels redundant | Med |
| 5 | **Zero beginner context.** No tooltips, no benchmarks, no "how to read this" anywhere. The dataset itself provides benchmarks (median ER = 2.24%, p90 = 4.49%) that could be surfaced. | MED-HIGH — core UX complaint | Med |

---

## 2. Architecture Findings (Step 1.1–1.2)

### Files

| Layer | Path | Notes |
|---|---|---|
| Page | `client/src/pages/analytics.tsx` (315 lines) | 6 tabs, 5 KPI cards, fetch selector |
| Charts | `client/src/components/dashboard/charts/` (10 files, 650 lines) | Recharts 2.x |
| Tables/widgets | `client/src/components/dashboard/` (`viral-reels-table.tsx`, `quick-tips.tsx`, `metrics-notes.tsx`) | |
| Utils | `client/src/lib/utils.ts` | `formatNumber`, `getDurationBucket`, ER/viral formulas duplicated client-side |
| API | `GET /api/fetch/:id` (`server/routes.ts:326`) | Returns `{ fetchRun, reels, stats }` raw |
| Ingestion | `server/services/apify.ts:198-342` | ER + viralScore computed **at fetch time**, stored in DB |
| Storage | `server/storage.ts:532` | Reels ordered by `viralScore DESC` |

### Data flow

1. Apify scrape → `apify.ts` computes per-reel `engagementRate = (likes+comments)/views` and `viralScore = 0.7·log₁₀(views) + 0.2·log₁₀(likes) + 0.1·log₁₀(comments)`, plus per-competitor `avgViews` / `avgEngagementRate` (unweighted mean of per-reel ER). Stored as `numeric` strings.
2. `GET /api/fetch/:id` returns the raw rows — **all chart aggregation (hour/day/duration bucketing, sorting, heatmap grids) happens client-side** in each component.
3. State: plain TanStack Query + local `useState`. No shared analytics context, no memoization of aggregations.

Implication for Phase 2: timezone conversion and ER filtering can be done entirely client-side without touching the API — low risk to the customer-facing data flow.

---

## 3. Data Quality Issues (Step 1.3)

SQL run against production via `scripts/audit-er-check.mjs` (read-only, uses the app's own `pg` driver since psql isn't installed locally).

### 3.1 High-ER outliers — real but rare

| Metric | Count | % of 2,717 |
|---|---|---|
| ER > 15% | 3 | 0.11% |
| ER > 25% | 2 | 0.07% |
| ER > 30% | 1 | 0.04% |

The three offenders:

| Username | Views | Likes | Comments | ER | Duration | Age | Followers | Likely cause |
|---|---|---|---|---|---|---|---|---|
| faye.gela | 22,379 | 14,891 | 2,468 | **77.57%** | **0s** | <30d | 324K | Broken scrape — 0s duration + likes≈66% of views means the view count is wrong, not the engagement |
| harshsharma.tech | 20,086 | 849 | 4,389 | 26.08% | 0s | 30-90d | 718K | Comment-bait/giveaway (5× more comments than likes); 0s duration again suspicious |
| techmasterco | 3,297,973 | 142,457 | 451,089 | 18.00% | 49s | 30-90d | 5.0M | Giveaway loop (451K comments) — possibly genuine but atypical |

Answers to the audit questions: **not** micro-accounts (all 324K–5M followers), **not** old posts (all <90 days). Two of three have `duration_seconds = 0`, pointing at partial scrapes rather than organic engagement. The 77% reel currently ranks **#1 in "Top by ER"** on the Reels tab.

- Stored ER vs recomputed ER: **0 mismatches** — the formula and storage are correct; the outliers are input-data problems.
- Dataset ER distribution: **p50 = 2.24%, p90 = 4.49%, p99 = 8.97%** — a >30% cutoff (per the fix plan) is safe; even >15% only removes 3 rows.

### 3.2 Zero-view reels — the bigger problem (not in the original issue list)

**319 reels (11.7%) have `views = 0`** and stored ER = 0 (`apify.ts:223`). These are almost certainly scrape failures (`videoPlayCount` missing), not genuinely unwatched posts. Effects:

- Avg ER KPI (`analytics.tsx:73-74`) is an unweighted mean **including** these zeros → understated.
- Hour/weekday/heatmap/duration averages all include them.
- They're excluded from VR charts (likes>0 filter helps) but not from ER charts.

Recommendation: exclude `views === 0` reels from all ER/views aggregations (keep them in Total Reels with a footnote, or drop entirely).

### 3.3 Other data notes

- ER is capped at 999,999,999 in `apify.ts:225` — effectively uncapped; no sanity ceiling.
- `viralScore` ordering from the API means `DurationScatterChart`'s `reels.slice(0, 100)` is the **top 100 by viral score**, a biased sample presented as "relationship between length and performance".

---

## 4. Widget-by-Widget Inventory (Step 1.4)

Actual composition from code (differs slightly from the fix-plan doc — corrections marked ⚠️).

| Tab | Widget | Component | Duplicate? | Needs explainer? | TZ-relevant? | Benchmark? | Issues |
|---|---|---|---|---|---|---|---|
| — (top) | 5 KPI cards | inline in `analytics.tsx` | — | Yes | No | **None** | Avg ER polluted by zero-view reels; no good/bad context |
| Overview | Top Creators by Avg ER | `creator-er-chart.tsx` | = Creators tab (identical) | Yes | No | No | Unweighted ER mean per creator |
| Overview | Competitor Leaderboard | `leaderboard-chart.tsx` | = Creators tab + Dashboard | Yes | No | No | — |
| Overview | Posting Time Heatmap | `heatmap-chart.tsx` (views) | = Timing tab + Dashboard | Yes | **Yes** | No | Local time, no label; "Best" cell can come from a single reel (no min sample size) |
| Overview | Avg Views by Duration | `duration-bucket-chart.tsx` | = Duration tab | Yes | No | No | Bucket scheme A (8 buckets) |
| Creators | Top Creators by Avg ER | ⚠️ exact duplicate of Overview | ✔ | | | | |
| Creators | Competitor Leaderboard | ⚠️ exact duplicate of Overview | ✔ | | | | |
| Creators | Top 25 Viral Reels | `viral-reels-table.tsx` | ⚠️ also on **Reels tab** and Dashboard (3 places) | Yes | Minor (Posted col) | No | — |
| Timing | Avg ER by Upload Hour | `er-by-hour-chart.tsx` | No | Yes | **Yes** | No | Subtitle says "(UTC)" but uses local `getHours()` (`er-by-hour-chart.tsx:10`); single-reel bars dominate |
| Timing | Avg ER by Weekday | `er-by-weekday-chart.tsx` | No | Yes | **Yes** | No | Local `getDay()`; same sample-size issue |
| Timing | Posting Time Heatmap ×2 | `heatmap-chart.tsx` views + engagement | ⚠️ **same title twice** — only the "Best:" subtitle differs | Yes | **Yes** | No | Confirmed root cause of issue #3: `analytics.tsx:278-279` renders same component, `metric` prop changes data but not the title |
| Duration | Avg Views by Duration | `duration-bucket-chart.tsx` | = Overview | Yes | No | No | Scheme A: `<10s, 10-20s, 20-30s, 30-45s, 45-60s, 60-90s, 90-120s, >120s` |
| Duration | Duration Performance | `duration-chart.tsx` | ⚠️ **near-duplicate of the chart beside it** — same metric (avg views/bucket), different buckets | Yes | No | No | Scheme B: `0-10s, 11-20s, 21-30s, 31-45s, 46-60s, 60s+`; also its gray Cell palette makes bars 4-5 nearly invisible on dark bg |
| Duration | Duration vs Views | `scatter-chart.tsx` | No | Yes | No | No | Biased top-100 sample (see §3.3) |
| Duration | View-to-Like Ratio Distribution | `vr-distribution-chart.tsx` | No | Yes | No | No | Silently drops reels with VR ≥ 500; x-labels show bucket start only ("0", "25"…) |
| Reels | Top by Views / Top by ER | `top-reels-table.tsx` ×2 | No | **Yes — issue #8** | Minor (Posted col) | No | Top by ER currently led by the 77% broken reel; no explanation of which list matters |
| Reels | Top 25 Viral Reels | ⚠️ third appearance | ✔ | | | | Not mentioned in fix-plan doc |
| Tips | Quick Tips | `quick-tips.tsx` | No | Is the explainer | **Yes** | Partial | "Post around X:00" with no timezone; uses a 4th bucket scheme; benchmarks derived from user's own data only |
| Tips | Metric Definitions | `metrics-notes.tsx` | No | — | **Yes** | No | States timing is "(UTC)" — incorrect (see §6) |

### Duration bucket schemes — 4 conflicting definitions

| File | Buckets | Boundary logic |
|---|---|---|
| `duration-bucket-chart.tsx:10-19` | `<10s, 10-20s, … 90-120s, >120s` (8) | `[min, max)` |
| `duration-chart.tsx:10-17` | `0-10s, 11-20s, … 46-60s, 60s+` (6) | inclusive |
| `lib/utils.ts getDurationBucket` | same labels as duration-chart (6) | `<=` chains |
| `quick-tips.tsx:53-58` | `15-30s, 30-45s, 45-60s, 60-90s` (4) | `[min, max)`; ignores <15s and >90s |

Concrete contradiction: a 45s reel is "45-60s" in Avg Views by Duration, "31-45s" in Duration Performance and the Viral Reels badge, and "45-60s" in Quick Tips. A 20s reel flips between "20-30s" and "11-20s". This is exactly the 30-45s vs 31-45s inconsistency Krishna spotted (issue #6).

---

## 5. UX Issues

1. **No explanations anywhere.** Zero tooltips/help icons on any metric; the only glossary is buried in the Tips tab (`metrics-notes.tsx`).
2. **No benchmarks.** KPI cards are bare numbers. Dataset-derived context is available for free: median ER 2.24%, p90 4.49% (from production data), so "your 2.40% is around the median" is possible without external data.
3. **Top by Views vs Top by ER confusion (issue #8):** both tables render side by side with one-line subtitles and no guidance; the ER list is additionally corrupted by the 77% outlier at #1.
4. **Single-sample artifacts:** hour bars, weekday bars, and heatmap "Best:" callouts can be driven by one reel; no minimum-count threshold and counts aren't shown in bar-chart tooltips.
5. **Duration Performance palette** (`duration-chart.tsx:44`) uses `#2A2D32`/`#1F2227` cells — nearly invisible against the `bg-surface` dark background.
6. **Heatmap on Overview** carries no metric name in the title (it's the views variant, but users can't tell).

---

## 6. Timezone Handling Assessment (Step 1.5)

### Storage
- `reels.posted_at` is **`timestamp without time zone`** (`shared/schema.ts:80`, confirmed in DB).
- Apify sends ISO-8601 UTC strings; `apify.ts:206` does `new Date(item.timestamp)`. With `timestamp without time zone`, node-postgres writes the **server's local wall-clock** rendering of that instant. Values are true UTC **only if the production server runs with TZ=UTC** (typical for hosted Node, but worth confirming). Same dependency applies when reading rows back for JSON serialization.

### Client
- **Every** time bucketing call uses browser-local methods: `er-by-hour-chart.tsx:10` (`getHours()`), `er-by-weekday-chart.tsx:12` (`getDay()`), `heatmap-chart.tsx:22-24`, `quick-tips.tsx:21,40`.
- So (assuming server TZ=UTC) charts **already display the viewer's local time** — but three places label it UTC: the hour-chart subtitle, and the Metric Definitions note. Krishna's issue #2 ("all times are UTC") is actually a **labeling bug**, not a conversion gap. The practical risk is the reverse: users mentally convert from "UTC" times that were already local.
- No timezone selector, no persistence, `profiles` has no timezone column.

### Libraries
- `date-fns ^3.6.0` installed; **no** `date-fns-tz`, luxon, or moment-timezone.
- ⚠️ Phase 2 doc correction: the doc's snippets use `utcToZonedTime` from date-fns-tz v2. The v3 API (which pairs with date-fns v3) renamed it to **`toZonedTime`**.
- Alternative worth considering in Phase 2: since data is bucketed from `Date` objects, an explicit-timezone selector can be implemented with zero new deps via `Intl.DateTimeFormat(..., { timeZone })` — or keep the current implicit local-time behavior and just fix the labels ("your local time") + add the selector for users analyzing a different market's audience.

---

## 7. Redundancy Summary

| Widget | Appears in | Verdict |
|---|---|---|
| CreatorERChart | Overview, Creators | Remove from one (Overview should summarize, Creators deep-dive) |
| LeaderboardChart | Overview, Creators, Dashboard | Same |
| HeatmapChart (views) | Overview, Timing, Dashboard | Keep in Timing; Overview could show a "best window" summary card instead |
| HeatmapChart ×2 same title | Timing | Rename: "Views Heatmap" / "Engagement Heatmap" |
| DurationBucketChart | Overview, Duration | Keep in Duration only |
| DurationBucketChart vs DurationChart | Duration tab, side by side | **Merge** — same metric, conflicting buckets |
| ViralReelsTable | Creators, Reels, Dashboard | Keep on Reels; Creators tab could show per-creator drill-down instead |

---

## 8. Recommended Priority Order for Phase 2

1. **Quick wins, zero risk (do first):**
   a. Fix time labels — "(UTC)" → "your local time" in hour chart + Metric Definitions; distinct heatmap titles ("Views Heatmap" / "Engagement Heatmap") with subtitles. Fixes issues #2-perception and #3 in ~30 min.
   b. Single `DURATION_BUCKETS` constant in `lib/utils.ts`; use everywhere (4 files). Fixes issue #6.
   c. Exclude `views === 0` reels from ER/views aggregations (client-side filter at the top of `analytics.tsx`, pass filtered array down). Biggest accuracy win on the page.
   d. Filter/flag ER > 30% from rankings (3 rows affected today). Fixes issue #5.
2. **Beginner layer:** HelpText tooltip component + captions + KPI benchmarks (use dataset percentiles: p50 2.24% / p90 4.49% alongside the industry 2-6% range). Fixes issues #1, #7, #8.
3. **De-duplication / tab restructure:** Overview = summary, Creators = deep dive, merge the two duration charts. Fixes issue #4. (Larger diff — do after the above so it doesn't block the quick wins.)
4. **Timezone selector (optional after 1a):** since charts are already local-time, the selector's real value is analyzing *another* market's timezone. Implementable with `Intl` (no new dependency) or `date-fns-tz` v3 (`toZonedTime`). Persist in localStorage first; `profiles.preferred_timezone` later if needed.
5. **Polish:** min-sample-size threshold (e.g. n≥3) for hour/weekday/heatmap "Best" callouts, show counts in tooltips, fix Duration Performance palette, VR chart range labels + overflow bucket, unbias or relabel the scatter sample.

### Additional corrections to the Phase 2 plan doc
- `utcToZonedTime` → `toZonedTime` (date-fns-tz v3).
- ViralReelsTable triple-duplication (Creators + Reels + Dashboard) isn't in the doc's inventory.
- The doc's Duration-tab inventory misses that its first two charts are near-duplicates of each other.
- Zero-view reels (11.7% of data) are a bigger data-quality issue than the ER outliers (0.11%) and should be added to Priority 5 → promoted to a quick win.

---

*Audit script: `scripts/audit-er-check.mjs` (read-only queries, reusable). No application code was modified.*
