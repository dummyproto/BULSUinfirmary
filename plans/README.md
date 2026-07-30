# Animation improvements — applied

All findings from the animation audit were implemented directly (no commits existed yet to
base isolated worktrees on, so changes were made straight to the working tree instead of via
the usual plan-file + isolated-executor flow).

| # | Finding | Status |
|---|---------|--------|
| 1 | Sidebar collapse animates layout props | DONE (partial — see note) |
| 2 | `.page-content` cascade replays every route nav | DONE — removed |
| 3 | Table rows retrigger fade/stagger on filter | DONE — removed |
| 4 | `scale(0)`/`scale(0.3)` starting transforms | DONE |
| 5 | No shared easing tokens | DONE — `--ease-standard`, `--ease-out`, `--ease-in-out`, `--ease-bounce` added to `:root` |
| 6 | Bounce easing on routine/frequent chrome | DONE |
| 7 | `.nav-item` missing press feedback | DONE |
| 8 | Password strength bar animates `width` | DONE — `transform: scaleX()` |
| 9 | `.tab-btn.active` bare ease + keyframe restart | DONE — removed redundant keyframe |
| 10 | 3 duplicate `prefers-reduced-motion` blocks | DONE — consolidated to 1 |
| 11 | Bare `ease` on modal backdrop / nav-item / dropdown | DONE |
| 12 | Diagnosis/analytics bars animate `width` | DONE — `transform: scaleX()` |
| 13 | `transition: all` (explicit uses) | DONE (2 literal cases fixed; the pervasive `--transition: all` token itself was left as-is — see note) |
| 14 | Infinite hover float on stat-icon | DONE — removed |
| 15 | Dead `.profile-tab-content` transition | DONE — now a real `fadeIn` |
| 16 | Missed opportunities | DONE — Inventory tab-panel fade, theme-aware gradient transitions |
| 17 | Under-floor starting scales (chatBubblePop, scaleIn) | DONE |
| 18 | Weak scroll-to-top press feedback | DONE |
| 19 | Dead duplicate `.toast` keyframe | DONE — removed; `.help-panel` easing improved |
| 20 | Unused `.nav-badge` wiggle | DONE — removed (class itself left in place, unused) |
| 21 | Sidebar-toggle-tab hover animates `width` | DONE — `transform: scaleX()` |

## Notes / deliberate exceptions

- **#1 sidebar collapse**: the `.sidebar` container's `width`/`min-width` transition was left
  as a genuine layout-affecting property, not converted to `transform`. A transform-only
  collapse would require restructuring the sidebar to fixed/overlay positioning (a structural
  change, out of scope for a motion-only pass) and risks visually breaking the icon-rail
  layout. Only tokenized the easing curves for consistency. Flagged as a larger follow-up if
  a true transform-based rewrite is wanted.
- **#13 `--transition: all`**: the shared `--transition` custom property (33 call sites) was
  left using `all` rather than exploded into per-site explicit property lists — doing that
  safely requires checking each of the 33 usages for exactly which properties change, and
  guessing wrong causes a visual regression (abrupt snap on a property that silently relied on
  `all`). Only the two literal, isolated `transition: all` declarations were fixed.

## Verification performed

- `node` brace-balance check on `legacy.css` (0 net, no unbalanced blocks).
- `npm run build` — production build succeeds, no errors (chunk-size warnings are
  pre-existing and unrelated).
- Dev server restarted and running clean at the printed local URL.
- Feel-checking in an actual browser (slow-motion animation panel, reduced-motion toggle,
  etc.) was not done — recommend clicking through: sidebar collapse, tab switching, table
  search/filter, toasts, password strength meter, and theme toggle to confirm the changes feel
  right before treating this as final.
