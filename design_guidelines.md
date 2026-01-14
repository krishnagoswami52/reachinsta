# ReachInsta Design Guidelines

## Design Approach

**System Selection**: Material Design principles with Linear-inspired minimalism for a professional SaaS analytics platform. Drawing from industry leaders like Linear (interface polish), Mixpanel (data visualization), and Notion (information hierarchy).

**Core Principles**:
- Data-first clarity: Information hierarchy optimized for quick scanning
- Professional efficiency: Minimal cognitive load, maximum insight density
- Scalable layouts: Accommodates varying data volumes gracefully

---

## Typography System

**Font Families**:
- Primary: Inter (Google Fonts) - UI elements, body text, data labels
- Monospace: JetBrains Mono - numeric data, usernames, URLs

**Hierarchy**:
- Page Titles: text-2xl font-semibold (32px)
- Section Headers: text-xl font-semibold (24px)
- Card Titles: text-base font-medium (16px)
- Body/Data: text-sm (14px)
- Captions/Metadata: text-xs (12px)
- Large Metrics: text-4xl font-bold (48px) for KPI numbers

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-6
- Card spacing: gap-4
- Section margins: mb-8
- Tight groupings: gap-2

**Grid Structures**:
- Dashboard KPI cards: 4-column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- Competitor cards: 3-column grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Comparison views: 2-column side-by-side
- Tables/Lists: Full-width single column with horizontal scroll if needed

**Container Strategy**:
- Dashboard content: max-w-7xl mx-auto px-6
- Modals/Dialogs: max-w-2xl
- Data tables: Full-width within container

---

## Component Library

### Navigation & Layout
- **Sidebar Navigation** (persistent left rail, w-64):
  - Dashboard, Competitors, Analytics, Exports, Settings
  - Plan badge at bottom with upgrade CTA
  - Usage meters (competitors, fetches)
  
- **Top Bar**:
  - User profile dropdown (right)
  - "Fetch Data" primary action button (right)
  - Last fetch timestamp (subtle, left side)

### Data Display Components

**KPI Cards**:
- Rounded corners (rounded-lg)
- Border treatment (border with subtle shadow)
- Large metric number + label + trend indicator
- Compact height to fit 4 across viewport

**Tables** (Top 25 Viral Reels):
- Sticky header row
- Alternating row backgrounds for scannability
- Right-aligned numeric columns
- Icon buttons for actions (external link, expand)
- Sortable column headers with indicator arrows
- Row hover state with subtle background shift

**Charts** (Recharts implementation):
- Bar charts: 8px bar width, 4px gap
- Scatter plots: 6px dot radius with 30% opacity
- Heatmap: Grid cells with tooltip on hover
- Consistent axis labels (text-xs)
- Legend positioned top-right
- Responsive height: 300px mobile, 400px desktop

**Competitor Cards**:
- Profile aesthetic with follower count prominent
- Username as clickable link (external to Instagram)
- Mini-metrics grid (3 key stats)
- Remove button (icon only, top-right corner)

**Progress Stepper**:
- Horizontal step indicator
- 5 states: Queued → Running → Merging → Analyzing → Completed
- Active step highlighted, completed steps with checkmark
- Real-time status updates

### Forms & Input

**Add Competitor Input**:
- Single-line input with "Add" button inline (grouped)
- Bulk add button triggers modal

**Bulk Add Modal**:
- Three-tab interface: Paste Text | Upload TXT | Upload CSV
- Large textarea for paste (h-64)
- File upload dropzone with drag-and-drop
- Preview of usernames before confirmation (max-h-48 overflow-y-auto)
- Duplicate/invalid username warnings

**Time Range Selector**:
- Segmented button group (7 / 14 / 28 days)
- Disabled options with tooltip explaining plan limitation

### Feedback Elements

**Empty States**:
- Centered layout with icon (large, subtle)
- Primary message + supporting text
- Clear CTA button ("Add Your First Competitor")

**Loading States**:
- Skeleton loaders for tables and cards
- Spinner for long operations (fetch process)
- Progress bar for multi-step operations

**Error Messages**:
- Inline validation (red text, text-sm)
- Alert banner for system errors (dismissible)
- Retry button for failed fetch operations

---

## Admin Panel Specifics

**User Management Table**:
- Searchable/filterable user list
- Inline plan assignment dropdown
- Usage metrics columns (compact)
- Action menu (3-dot) for advanced operations
- Highlight admin users with badge

**Override Controls**:
- Number inputs with +/- steppers for limits
- Date picker for plan expiry
- Confirmation dialog for role changes

---

## Responsive Behavior

**Breakpoints**:
- Mobile (<768px): Single column, collapsed sidebar (hamburger menu)
- Tablet (768-1024px): 2-column grids, persistent sidebar
- Desktop (>1024px): Full multi-column layouts, expanded sidebar

**Mobile Adaptations**:
- Tables become card-based scrollable lists
- Charts maintain aspect ratio, reduce padding
- Sidebar becomes bottom navigation or overlay
- KPI cards stack vertically

---

## Accessibility

- Maintain ARIA labels on all interactive elements
- Keyboard navigation for tables (arrow keys)
- Focus indicators (ring-2 ring-offset-2)
- Sufficient contrast ratios (WCAG AA minimum)
- Screen reader announcements for status changes

---

## Key Interaction Patterns

- Click competitor username → opens Instagram profile in new tab
- Click reel URL → opens reel in new tab
- Hover table row → highlight + show action buttons
- Sort table columns → immediate re-render with loading state
- Filter competitors → instant results, no page reload
- Export CSV → triggers download, no new window

---

## Special Considerations

**Upgrade Prompts** (for Free/Plus users):
- Subtle banner when attempting restricted features
- Feature comparison table in modal
- "Contact Admin" CTA (no payment integration)

**Data Freshness Indicators**:
- Timestamp on all data displays
- "Stale data" warning if >7 days old
- Auto-refresh option for completed fetch runs