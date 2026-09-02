# Dashboard alignment audit

**Date:** 2026-09-02
**Page:** `client/src/pages/dashboard.tsx` (+ `client/src/components/dashboard/*`)
**Method:** Measured rendered geometry at 1440×1400 and 390×844 via Playwright
against mocked API fixtures (`getBoundingClientRect` + `getComputedStyle`), not
read off the source. Numbers below are measured pixels.

---

## Summary

| # | Area | Finding | Severity | Fixed |
|---|------|---------|----------|-------|
| 1 | KPI cards | Uniform — no defect | — | n/a |
| 2 | Grid columns | Correct — no defect | — | n/a |
| 3 | Border radius | Consistent — no defect | — | n/a |
| 4 | Vertical rhythm | Sidebar 16px vs main column 24px | Medium | ✅ |
| 5 | Card padding | Sidebar 20px vs main column 24px | Medium | ✅ |
| 6 | Card heading size | Sidebar 15px vs main column 16px | Low | ✅ |
| 7 | Viral Reels filters | Wraps to two rows, ~8px over | Low | ❌ out of scope |
| 8 | Page header | `mb-12` redundant with `space-y-6` | Cosmetic | ❌ intentional |
| 9 | Mobile chart overflow | Pre-existing horizontal scroll | Medium | ❌ out of scope |
| 10 | KPI subtitles | Only 1 of 4 has one | Cosmetic | ❌ not a defect |

---

## What is already correct

### 1. KPI cards — uniform

All four measured identically, so there is nothing to fix here:

| Card | x | width | height | padding | radius |
|------|---|-------|--------|---------|--------|
| competitors tracked | 264.0 | 202.5 | 123.5 | 20px | 9px |
| reels analyzed | 482.5 | 202.5 | 123.5 | 20px | 9px |
| total views | 701.0 | 202.5 | 123.5 | 20px | 9px |
| avg engagement | 919.5 | 202.5 | 123.5 | 20px | 9px |

Gutters are an even 16px. Icons, labels, and values share one baseline across all
four. Only the first card carries a subtitle (`of 50 max`), but because the row is
a CSS grid the cards stretch to equal height anyway — see finding 10.

### 2. Grid columns — mathematically correct

`grid lg:grid-cols-4 gap-6` over a 1152px container: `(1152 − 3×24) / 4 = 270`.
Main column spans 3 → `270×3 + 2×24 = 858`. Measured: left `x=264 w=858`, right
`x=1146 w=270`, both `y=152`. Exact. The two columns start on the same line.

### 3. Border radius — one consistent system

- Cards / panels: `9px` (`rounded-lg`) — every surface card measured
- Controls, buttons, inputs, badges: `6px` (`rounded-md`)
- Progress bars, avatars: `9999px` (`rounded-full`)

No stray values anywhere on the page.

---

## Defects fixed

### 4. Vertical rhythm mismatch between columns — **Medium**

Measured gap between stacked cards:

- Main column (`lg:col-span-3 space-y-6`): **24px**
- Right sidebar (`space-y-4`): **16px**

The two columns sit side by side inside a `gap-6` (24px) grid, so the sidebar was
running on a tighter rhythm than both its neighbour and its own gutter. This is
the source of the "elements don't line up" feeling — as you scroll, sidebar card
edges drift progressively out of step with the main column.

**Fix:** sidebar `space-y-4` → `space-y-6`, so all three spacings (column gutter,
main stack, sidebar stack) are 24px.

### 5. Card padding inconsistency — **Medium**

Padding across all 16 surface cards on the page:

| Padding | Count | Components |
|---------|-------|------------|
| 24px (`p-6`) | 12 | all charts, viral-reels-table, quick-tips, metrics-notes, fetch-status panels |
| 20px (`p-5`) | 2 | competitor-list, Plan Usage |
| 20px (`p-4 lg:p-5`) | 4 | KPI cards |

`p-6` is the house standard by a wide margin. The two sidebar panels were the only
full-size cards not following it.

**Fix:** competitor-list and Plan Usage `p-5` → `p-6`.

**Deliberately not changed:** the KPI cards keep `p-4 lg:p-5`. They are small
metric tiles, not content panels, and the denser padding is a legitimate size
distinction rather than an inconsistency.

### 6. Card heading size inconsistency — **Low**

Every card heading is `font-tight font-semibold text-text-primary`, but the size
splits:

- `text-[16px]` — Competitor Leaderboard, Views Heatmap, Top 25 Viral Reels
- `text-[15px]` — Competitors, Plan Usage

Same semantic level, two sizes, with the majority at 16px.

**Fix:** sidebar headings `text-[15px]` → `text-[16px]`.

---

## Found but deliberately not fixed

### 7. Viral Reels filter controls wrap to two rows — **Low**

At `lg` the card header is `flex-row justify-between gap-4`. Inner width is
858 − 48 = 810px. The title block measures ~370px and the three controls
(150 + 150 + ~110 + 2×8 gaps) ~434px; with the 16px gap that is ~820px — roughly
8px over, so `Min views` drops to a second row while Search and the competitor
filter stay on the first.

Not fixed: the remedy is shrinking a control's fixed width inside
`viral-reels-table.tsx`, which is control sizing rather than alignment, and sits
outside the "dashboard component" file scope for this pass. Worth its own change.

### 8. Page header `mb-12` redundant with parent `space-y-6` — **Cosmetic**

The header carries `mb-12` (48px) while the parent `space-y-6` contributes a 24px
top margin to the next sibling. Adjacent margins collapse to `max(48, 24) = 48`,
so the measured gap is 48px and nothing is doubled. It works, but the two rules
fight and the outcome depends on collapsing.

Not fixed: the 48px gap below the title reads as deliberate breathing room.
Removing `mb-12` would tighten it to 24px — a design change, not an alignment fix.

### 9. Mobile chart overflow — **Medium, pre-existing**

At 390px the page still scrolls horizontally: `main` scrollWidth 626 vs clientWidth
390. The column itself is now correctly constrained (`min-w-0`, added in the
previous change), so the overflow is content inside the chart cards asserting a
min-width. Predates this work and is unchanged by it.

Not fixed: requires touching chart components, which are out of scope here.

### 10. KPI subtitles — **not a defect**

Only `competitors tracked` renders a subtitle. Because the row is a CSS grid with
default `align-items: stretch`, all four cards still measure 123.5px tall and their
values share a baseline. No visual defect; the subtitle simply occupies otherwise
empty space in one card.

---

## Constraints observed

Only spacing and type-size values changed. No component functionality, data,
interactive behaviour, colour token, font family, icon, or layout structure was
modified. All changed values come from the existing Tailwind scale already in use
elsewhere on the page (`space-y-6`, `p-6`, `text-[16px]`).
