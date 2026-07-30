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

## Second pass — 2026-07-31 (this session)

A commit history now exists (see "Initial commit"), so this pass ran in an isolated
worktree rather than editing the shared checkout directly. Findings 22–26 below came from a
fresh audit against `AUDIT.md`'s eight categories; only the HIGH-severity items were
implemented (per user approval). The MEDIUM/LOW findings from that same audit were reported
but not selected — see the conversation for the full table if picking those up later.

| # | Finding | Status |
|---|---------|--------|
| 22 | `.sidebar`/`.modal`/`button`/`.nav-item`/etc. forced onto `transition: var(--transition) !important` (`all .2s`), silently overriding more specific hand-tuned transitions (e.g. `.modal-close`) declared elsewhere in the file | DONE — dropped the `!important`; normal cascade already lets the more specific selector win |
| 23 | `Modal.jsx`, `EmergencyConfirmModal.jsx`, `EmergencySuccessOverlay.jsx`, `SmsSuccessOverlay.jsx` all unmount synchronously (`if (!isOpen) return null`) with zero exit animation, despite real entrance keyframes | DONE — added `src/hooks/useDelayedUnmount.js` (keeps content mounted through a "closing" phase) and matching exit keyframes (`modalOut`/`modalOverlayOut`/`emgPopOut`) in `legacy.css` |
| 24 | Toast dismiss (click or auto-timeout) removed from state instantly, no exit transition against the entrance `toastSlide` keyframe | DONE — `ToastContext.dismiss()` now marks the toast `leaving` first, removes it from state after `toastSlideOut`'s 200ms |
| 25 | `.help-fab:hover`'s `animation: pulseRing 1s ease infinite !important` outranked the blanket `prefers-reduced-motion` rule's `!important` via higher selector specificity | DONE — removed the `!important` (normal specificity + source order already gives the hover rule priority in non-reduced-motion use) |
| 26 | `SearchableSelect`'s dropdown (patient/medicine/diagnosis search, used constantly) faded in via keyframe but unmounted instantly on blur/select, no exit | DONE — same `useDelayedUnmount` hook, new `dropdownFadeOut` keyframe |

### Notes / deliberate exceptions (this pass)

- Along the way, noticed `SmsSuccessOverlay.jsx`'s overlay `<div>` is missing the `open`
  class that `.emg-overlay` needs for `display:flex` (its CSS default is `display:none`) —
  looks like a pre-existing functional bug, unrelated to motion. Left untouched: out of the
  scope of this animation pass, flagging for a separate fix.
- `EmergencySuccessOverlay`/`SmsSuccessOverlay` needed a small extra fix beyond the shared
  hook: their `result` prop is nulled by the parent the instant `onClose` fires, but the
  component now stays mounted ~160ms longer to finish its exit animation — so each keeps its
  own `useState` copy of the last non-null `result` to render from during that window
  (reading a `ref` during render was tried first and rejected by
  `eslint-plugin-react-hooks`'s `react-hooks/refs` rule; state-during-render is what actually
  passes lint here).
- `useDelayedUnmount` computes state during render (comparing `active` to a stored previous
  value) rather than calling `setState` synchronously inside a `useEffect` body — the newer
  `react-hooks/set-state-in-effect` rule in this repo's ESLint config flags the latter.

### Verification performed (this pass)

- `node` brace-balance check on `legacy.css` (0 net).
- `npm run build` — succeeds (pre-existing chunk-size warnings only).
- `npx eslint` on all touched files — 0 errors, 1 pre-existing warning unrelated to this
  change (`ToastContext.jsx`'s `react-refresh/only-export-components`, present before this
  pass).
- Attempted a live feel-check via the dev server, but no browser-automation tool
  (`chromium-cli`/Playwright) was available in this environment, and most of the changed
  components (Modal, Toast, SearchableSelect) sit behind Supabase auth this session has no
  credentials for. **Not feel-checked in a real browser** — recommend before merging:
  click through opening/closing a modal (Profile → Edit, or any confirm dialog), triggering
  and dismissing a toast, opening/closing the patient/medicine search dropdown, and toggling
  `prefers-reduced-motion` on the emergency Help FAB, ideally with DevTools' Animations panel
  at 10% playback speed to see the exit motion clearly.
