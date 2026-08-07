# vacti - Design System & UI Redesign Plan

> A deliberate, **professional** design system for a security platform. **Light and dark modes are
> both first-class** (each fully specified below - not one derived from the other). The aesthetic is
> calm, precise, enterprise-grade (think Linear / Vercel / Stripe dashboards) - never "hacker" themed.
> This supersedes the v0 functional UI.

## 0. Goals & non-goals

- **Goals:** a trustworthy, modern product feel; effortless light/dark switching; consistent semantics
  (severity/risk) across UI, charts, and PDF reports; dense data shown calmly; full accessibility.
- **Non-goals:** novelty/skeuomorphism, neon "cyber" styling, decorative gradients, heavy shadows.

## 1. Principles

1. **Professional & calm.** Muted neutrals, one restrained accent, generous structure. Color carries
   meaning only (severity, risk, status).
2. **Light & dark are equals.** Both are designed, contrast-checked, and tested. System-preference by
   default, with an explicit, persisted toggle and **no flash** on load.
3. **Dense, but breathing.** Lots of recon data, shown with rhythm, grouping, and whitespace.
4. **Always stateful.** Every surface defines loading (skeleton), empty, error, and live states.
5. **Restrained motion.** Fast (120-200ms), purposeful; fully disabled under `prefers-reduced-motion`.
6. **Keyboard-first.** Command palette (⌘K), visible focus rings, complete keyboard nav.
7. **Accessible by default.** WCAG 2.1 AA minimum; color is never the only signal.

## 2. Theming model

- Token layers: **primitive** (raw ramps) → **semantic** (role tokens like `bg`, `fg`, `accent`) →
  **component** (e.g. `button-primary-bg`). Components only consume semantic/component tokens, so a
  theme swap is a variable swap.
- Implemented as CSS custom properties on `:root` (light) and `.dark` (dark); Tailwind maps them to
  utilities. `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`; a tiny blocking script + `suppressHydrationWarning` prevents FOUC in
  the App Router. Choice persisted (localStorage + cookie for SSR-correct first paint).
- Toggle offers **System / Light / Dark**.

## 3. Color - neutrals (both modes)

Cool neutral ramp (slate family). Semantic role tokens:

| Role            | Light (hex) | Dark (hex) | Use                                      |
| --------------- | ----------- | ---------- | ---------------------------------------- |
| `bg`            | `#F7F8FA`   | `#0A0C10`  | app background (off-white reduces glare) |
| `surface`       | `#FFFFFF`   | `#0F141B`  | cards, panels, table bg                  |
| `surface-2`     | `#F1F3F6`   | `#161D27`  | hover, raised, inputs                    |
| `surface-3`     | `#E9ECF1`   | `#1E2632`  | active/selected wash                     |
| `border`        | `#E3E7EC`   | `#232C39`  | hairline dividers, card borders          |
| `border-strong` | `#CFD5DD`   | `#2E3947`  | input borders, emphasis                  |
| `fg`            | `#0C1118`   | `#F2F5F9`  | primary text                             |
| `fg-muted`      | `#5A6573`   | `#9BA7B6`  | secondary text, labels                   |
| `fg-subtle`     | `#8A94A3`   | `#6B7686`  | placeholders, captions                   |

All `fg*`/`bg*` pairs verified ≥ 4.5:1 (body) or ≥ 3:1 (large/secondary).

## 4. Color - accent (choose one; all professional, light+dark)

| Direction                   | Light accent / hover  | Dark accent / hover   | Tint (subtle bg)                       |
| --------------------------- | --------------------- | --------------------- | -------------------------------------- |
| **A - Azure** (recommended) | `#2563EB` / `#1D4ED8` | `#3B82F6` / `#60A5FA` | L `#EFF4FF` · D `rgba(59,130,246,.14)` |
| **B - Indigo**              | `#4F46E5` / `#4338CA` | `#6366F1` / `#818CF8` | L `#EEF0FF` · D `rgba(99,102,241,.14)` |
| **C - Teal**                | `#0D9488` / `#0F766E` | `#2DD4BF` / `#5EEAD4` | L `#E6FAF7` · D `rgba(45,212,191,.14)` |

`accent-fg` = white on A/B, near-black on C-dark for contrast. `ring` = accent. Links, primary
buttons, active nav, focus rings, selection, and "running" status use the accent.

## 5. Color - semantic severity / risk / status (both modes)

Single source in `@vacti/ui`; identical in tables, charts, and reports. Lightness shifts per mode so
text/badges stay legible on each background.

| Token                | Light text / tint     | Dark text / tint                    |
| -------------------- | --------------------- | ----------------------------------- |
| `sev-critical`       | `#DC2626` / `#FEECEC` | `#F87171` / `rgba(248,113,113,.14)` |
| `sev-high`           | `#EA580C` / `#FFF1E8` | `#FB923C` / `rgba(251,146,60,.14)`  |
| `sev-medium`         | `#B45309` / `#FFF7E6` | `#FBBF24` / `rgba(251,191,36,.14)`  |
| `sev-low`            | `#A16207` / `#FEFAE6` | `#FACC15` / `rgba(250,204,21,.14)`  |
| `sev-info`           | `#0284C7` / `#E8F6FE` | `#38BDF8` / `rgba(56,189,248,.14)`  |
| `risk-green` (0-30)  | `#059669`             | `#34D399`                           |
| `risk-amber` (31-70) | `#D97706`             | `#FBBF24`                           |
| `risk-red` (71-100)  | `#DC2626`             | `#F87171`                           |

Status pills: `running` = accent + pulsing dot, `completed` = green, `failed` = red, `queued` =
neutral, `cancelled` = neutral-dim. Badges always pair color **with text/icon** (never color alone).

## 6. Typography

- **Geist Sans** (UI), **Geist Mono** (IDs, payloads, ports, tokens). Fallbacks: Inter, ui-monospace.
- Weights: 400 / 500 / 600 / 700. Numerals **tabular** in metrics and tables.

| Style   | Size / line-height | Weight  | Use              |
| ------- | ------------------ | ------- | ---------------- |
| Display | 30 / 36            | 700     | empty-state hero |
| H1      | 24 / 32            | 600     | page title       |
| H2      | 20 / 28            | 600     | section          |
| H3      | 16 / 24            | 600     | card title       |
| Body    | 14 / 20            | 400     | default          |
| Small   | 13 / 18            | 400     | tables, meta     |
| Caption | 12 / 16            | 500     | labels, badges   |
| Mono    | 13 / 20            | 400/500 | code, IDs        |

## 7. Spacing, radius, border, elevation

- Spacing scale (px): 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radius: control 8, card 12, popover 12, pill 9999. Inputs/buttons 8.
- Borders: 1px hairline (`border`), 1px `border-strong` for inputs/focus context.
- Elevation: **light** uses soft shadows - `e1` `0 1px 2px rgba(16,24,40,.06)`, `e2`
  `0 4px 12px -2px rgba(16,24,40,.10)`, `e3` `0 12px 28px -8px rgba(16,24,40,.16)`. **dark** relies on
  borders + a faint top inset highlight; shadows near-invisible (use `surface-2/3` for separation).

## 8. Iconography, motion, imagery

- **lucide-react**, 1.5px stroke, sizes 16/18/20; currentColor.
- Motion (**framer-motion**): micro 120ms, panels/sheets 180ms, easing `cubic-bezier(.2,.8,.2,1)`;
  list stagger ≤ 30ms; running-scan **pulse** dot; skeleton shimmer. All gated by reduced-motion.
- Empty-state illustrations: simple line art that adapts to theme via currentColor (no raster).

## 9. Components (shadcn/ui + Radix, wrapped in `@vacti/ui`)

Primitives: Button (`primary`/`secondary`/`outline`/`ghost`/`destructive`, sizes sm/md/lg, loading

- icon slots), Input, Textarea, Select, Combobox, Checkbox, Switch, Radio, Label, Tooltip, Dropdown
  Menu, Dialog, Sheet/Drawer, Tabs, Badge, Card, Separator, Avatar, Skeleton, Progress, ScrollArea,
  Popover, Breadcrumb, Pagination, Toast (**sonner**).

vacti composites: `PageHeader`, `StatCard` (label, value, delta, sparkline), `StatusPill` (live
pulse), `SeverityBadge`, `RiskGauge` (arc, mode-aware), `DataTable` (TanStack Table - server-side
sort/filter/paginate, column visibility, sticky header, row hover, empty/loading), `Timeline` (scan
activity), `StageStepper` (pipeline stages), `CodeBlock` (mono, copy, wrap toggle), `EmptyState`,
`CommandPalette` (**cmdk**, ⌘K), `ThemeToggle` (System/Light/Dark), `ProjectSwitcher`.

Each component specifies: default / hover / active / focus-visible / disabled / loading, in **both**
modes.

## 10. Data visualization (Recharts, themed per mode)

- Categorical palette derived from accent + severity hues; gridlines `border`, axis text `fg-muted`,
  tooltips on `surface` with `e2` (light) / border (dark).
- Charts: `SeverityDonut` (uses severity tokens), `TrendArea` (7-day findings, accent gradient fill at
  low opacity), `RiskGauge`, mini sparklines in stat cards. All re-read CSS vars on theme change.

## 11. Layout & responsive

Breakpoints: sm 640, md 768, lg 1024, xl 1280, 2xl 1536.

```
┌────────────────────────────────────────────────────────────┐
│ ▟ vacti   [Project ▾]          ⌘K Search…      System◐  (AV)│  topbar 56px
├──────────┬─────────────────────────────────────────────────┤
│ ◳ Dashboard                                                 │
│ ◧ Targets │   PageHeader (title · subtitle · primary action)│
│ ◰ Scans   │   ── content grid · max-w 1200 · px-6/8 ──      │
│ ◆ Threat  │                                                 │
│ ▤ Reports │                                                 │
│ ⟐ API     │                                                 │
│ ───────── │                                                 │
│ ⚙ Settings                                                  │
└──────────┴─────────────────────────────────────────────────┘
```

- Sidebar 248px ≥ lg; icon-rail (64px) toggle md-lg; **Sheet drawer** < md.
- Topbar: project switcher, ⌘K search, ThemeToggle, user menu. RBAC hides nav the role can't use.
- Content max-width 1200px; comfortable padding; 12-col responsive grid for cards.

## 12. Page-by-page redesign

- **Dashboard:** row of `StatCard`s (Targets, Scans, Live endpoints, Open vulns) with sparkline +
  delta; `SeverityDonut` + `TrendArea`; Threat-Intel card with `RiskGauge`; recent-scans table; rich
  empty state when no data.
- **Scans (list):** `DataTable` (Target, Status pill, severity mini-bar, counts, started relative,
  duration); toolbar search + status/profile filters; `New scan` dialog (target + profile + summary).
- **Scan detail:** header (target + status pill + Cancel/Re-scan/Report); **StageStepper** (Subfinder
  → httpx → naabu → nuclei → wordfence) live via SSE; activity `Timeline`; tabs Overview / Subdomains
  / Endpoints / Ports / Vulnerabilities (DataTables); vuln rows expand to `CodeBlock` req/resp + CVE/
  CWE/CVSS chips (+ AI enrichment later).
- **Targets:** table/cards, predefined-subs as chips, inline Scan action.
- **Settings:** tabbed (Profile · API Tokens · API Key Vault · Users & Roles · Integrations); token
  shown once in a copyable callout; vault values masked with reveal.
- **Threat Intel / Reports:** same system, per their epics.

## 13. Accessibility

- Contrast: body ≥ 4.5:1, large/secondary ≥ 3:1, UI borders ≥ 3:1 - in both modes.
- Visible `focus-visible` ring (2px accent + offset) on every interactive element; logical tab order.
- Full keyboard operation incl. ⌘K palette, dialogs (focus trap + Esc), menus (arrow keys).
- Screen-reader labels, `aria-live` for scan progress, semantic landmarks (`nav`/`main`).
- Color never the sole signal (severity = color **+** label/icon). `prefers-reduced-motion` honored.

## 14. Content & tone

Concise, confident, neutral. Sentence case. Buttons are verbs ("Start scan", "Add target"). Empty
states explain value + offer the next action. Errors are plain and actionable.

## 15. Implementation phases (maps to dashboard-ui epic)

1. **Tokens + Tailwind + shadcn/ui** in `@vacti/ui`; light/dark vars, Geist fonts, ThemeToggle, no-FOUC. (epic 001)
2. **App shell:** sidebar + topbar + ⌘K palette skeleton; responsive + drawer. (epic 001)
3. **Primitives + composites** (StatCard, StatusPill, SeverityBadge, DataTable, Timeline, StageStepper, EmptyState). (epic 002)
4. **Redesign pages:** dashboard → scans → scan detail → targets → settings. (epic 003/004/002)
5. **Charts** (Recharts, mode-aware) + live SSE polish. (epic 003/004)
6. **Polish:** skeletons, motion, a11y audit, responsive, reduced-motion, keyboard. (epic 006)

New deps: `tailwindcss` + `@tailwindcss/postcss`, `tailwindcss-animate`, `class-variance-authority`,
`clsx`, `tailwind-merge`, `lucide-react`, shadcn-generated `@radix-ui/*`, `sonner`, `cmdk`,
`@tanstack/react-table`, `recharts`, `framer-motion`, `next-themes`, `geist`.

## 16. Visual direction options

All three are professional and ship **both light and dark**; they differ only in accent (see §4):
**A - Azure** (recommended) · **B - Indigo** (enterprise) · **C - Teal** (fresh). Pick one; neutrals,
components, and both themes are identical across them.

## 17. Definition of done (design)

- Light **and** dark both polished and contrast-checked (AA); System/Light/Dark toggle, no FOUC.
- Tokens consistent across app + reports (severity/risk identical to data).
- Every page has loading/empty/error/live states; tables server-side and fast.
- Keyboard + screen-reader navigable; reduced-motion honored.
- Visual QA pass (light + dark screenshots) signed off before closing the redesign.
