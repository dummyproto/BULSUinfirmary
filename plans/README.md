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
fresh audit against `AUDIT.md`'s eight categories; the HIGH-severity items were implemented
first (per user approval), and the MEDIUM/LOW items (27–37 below) were implemented in a
follow-up round the same session.

| # | Finding | Status |
|---|---------|--------|
| 22 | `.sidebar`/`.modal`/`button`/`.nav-item`/etc. forced onto `transition: var(--transition) !important` (`all .2s`), silently overriding more specific hand-tuned transitions (e.g. `.modal-close`) declared elsewhere in the file | DONE — dropped the `!important`; normal cascade already lets the more specific selector win |
| 23 | `Modal.jsx`, `EmergencyConfirmModal.jsx`, `EmergencySuccessOverlay.jsx`, `SmsSuccessOverlay.jsx` all unmount synchronously (`if (!isOpen) return null`) with zero exit animation, despite real entrance keyframes | DONE — added `src/hooks/useDelayedUnmount.js` (keeps content mounted through a "closing" phase) and matching exit keyframes (`modalOut`/`modalOverlayOut`/`emgPopOut`) in `legacy.css` |
| 24 | Toast dismiss (click or auto-timeout) removed from state instantly, no exit transition against the entrance `toastSlide` keyframe | DONE — `ToastContext.dismiss()` now marks the toast `leaving` first, removes it from state after `toastSlideOut`'s 200ms |
| 25 | `.help-fab:hover`'s `animation: pulseRing 1s ease infinite !important` outranked the blanket `prefers-reduced-motion` rule's `!important` via higher selector specificity | DONE — removed the `!important` (normal specificity + source order already gives the hover rule priority in non-reduced-motion use) |
| 26 | `SearchableSelect`'s dropdown (patient/medicine/diagnosis search, used constantly) faded in via keyframe but unmounted instantly on blur/select, no exit | DONE — same `useDelayedUnmount` hook, new `dropdownFadeOut` keyframe |
| 27 | `--ease-bounce` used on high-frequency topbar chrome hover (`.icon-btn`, `.hamburger-btn`, `.sidebar-close-btn`), working against the "crisp dashboard" personality | DONE — swapped those three to `var(--ease-out)` |
| 28 | ~16 entrance `animation:`s used bare `ease` instead of `ease-out` (login, chatbot bubbles, notifications, registration, sidebar, emergency dialogs, scroll-to-top, manual modal) + the collapsed-sidebar nav tooltip's `transition: opacity .15s ease` | DONE — mechanical swap to `var(--ease-out)` at every cited site |
| 29 | Several entrance animations exceeded the 300ms UI budget (login logo bounceIn 700ms, `.stock-fill` progressFill 800ms, `.login-card` 550ms, `.stat-num` countUp 500ms, help-fab/sms-pop/`.reveal` 400ms, `.card` 380ms) | DONE — all trimmed to ≤300ms |
| 30 | `.btn:active`/`.btn:hover` shared one 120ms transition duration for both press and release, most consequential on `.btn-red` destructive actions | DONE — `:active` now gets its own faster `transition-duration: 0.08s`; the base rule's 0.12s still governs the release/settle |
| 31 | Inventory's tab body wrapper (`.tab-panel-enter`, shared with the much-less-frequent `.profile-tab-content`) re-fired a `fadeIn` on every single tab click — a many-times-per-shift action | DONE — removed the `tab-panel-enter` class from all 8 `InventoryPage.jsx` tab bodies; `.profile-tab-content`'s animation is untouched |
| 32 | No `(hover: hover) and (pointer: fine)` gating anywhere — every `:hover` transform fired ungated on touch/tablet taps | DONE (equivalent approach) — added a `@media (hover:none),(pointer:coarse)` block mirroring the codebase's existing reduced-motion pattern (same technique, same selector list style) that neutralizes hover-transforms on coarse pointers, instead of individually wrapping ~20 scattered `:hover` rules across the file |
| 33 | `--ease-in-out` token defined but unused; 26 of 31 hand-typed `cubic-bezier()`s exactly duplicated an existing token, plus 4 more were a consistent but untokenized "bounce-lite" `(0.34,1.4,0.64,1)` variant | DONE — all exact duplicates now reference `var(--ease-standard)`/`var(--ease-out)`/`var(--ease-bounce)`; added a new `--ease-bounce-soft` token for the bounce-lite variant and pointed its 4 sites at it. `--transition` itself now reads `all .2s var(--ease-standard)` instead of repeating the literal curve. `--ease-in-out` is still unused — left in place, not deleted (no site to safely repoint it to) |
| 34 | `ScrollToTopButton` mounted/unmounted (restarting its keyframe) on every scroll-threshold crossing, no debounce, no exit — flickered near the 300px line | DONE — added hysteresis (once visible, only hides below `threshold - 40px`, not the raw threshold) and the same `useDelayedUnmount` exit-animation treatment as the other findings, with a new `scroll-top-out` keyframe |
| 35 | `.chip`, `.diag-code-item`, `.qr-sample-btn` are pressable with a `:hover` state but no `:active` press feedback | DONE — added `:active{transform:scale(.97)}` to all three |
| 36 | `.emg-live-modal`'s initial `scale(.88)` sat just under the `0.9–0.97` physicality target | DONE — bumped to `scale(.92)`; also fixed a bare `ease` on the same rule's opacity transition while touching it |

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

## Third pass — 2026-07-31 (same session, MEDIUM/LOW findings 27–36)

Implemented every MEDIUM/LOW finding from the same audit that produced 22–26 above, per user
instruction to "proceed and finish." See the table above (rows 27–36) for what changed.

### Notes / deliberate exceptions (this pass)

- **Finding #32 (hover:hover gating)**: implemented as a single `@media (hover:none),
  (pointer:coarse)` block that neutralizes `transform` on a fixed list of known
  hover-transform selectors, rather than the more literal AUDIT.md pattern of wrapping each
  individual `:hover` rule in `@media (hover:hover) and (pointer:fine)`. Wrapping ~20 rules
  scattered across a 5,600-line file individually would have meant moving declarations out of
  their current location, which is much higher risk of ordering/specificity mistakes than
  adding one new block. Practically equivalent outcome (no stuck hover-transform on tap); if
  a hover-transform selector is added to the file later, it needs to be added to this new
  block's list too (it won't be covered automatically the way the wrap-per-rule approach
  would have been).
- **Finding #16 / tooltip "instant after first hover"**: only fixed the easing (bare `ease` →
  `var(--ease-out)`) on the collapsed-sidebar nav tooltip. AUDIT.md's fuller recommendation —
  making a toolbar's tooltip instant after the first one has shown — needs stateful JS
  (tracking "has any tooltip shown recently" across sibling nav items), which is a bigger,
  riskier change for a LOW-severity finding. Not implemented.
- **Missed opportunity — table row stagger**: `rowFadeIn` keyframe exists in `legacy.css` but
  is applied nowhere; EHR records, case listings, and inventory tables all render rows with no
  entrance animation. Not implemented in this pass — it touches live-data list rendering in
  several feature files without a way to visually verify the result in this environment, so
  left as a follow-up rather than guessed at.
- **Modal-open bounce curve**: `.modal-overlay.open .modal`'s `scaleIn` animation still uses
  the (now-tokenized) `--ease-bounce-soft` curve. Left as-is deliberately — modals are an
  "occasional" interaction per AUDIT.md's frequency table (not the "tens of times/day" bucket
  that finding #6 was about), so a little personality on open is a defensible, not
  contradictory, choice. Only the genuinely high-frequency topbar chrome (icon/hamburger/
  sidebar-close buttons) was moved to `--ease-out`.

### Verification performed (this pass)

- `node` brace-balance check on `legacy.css` (0 net) after every batch of edits.
- `npm run build` — succeeds (same pre-existing chunk-size warnings only).
- `npx eslint` on both touched JS files (`ScrollToTopButton.jsx`, `InventoryPage.jsx`) — 0
  errors, 0 warnings.
- Same live-browser feel-check gap as the previous pass — not done, same reasons (no
  browser-automation tooling available, most surfaces behind auth). Recommend additionally
  checking: the topbar icon buttons' hover feel less bouncy, the login page loads noticeably
  snappier, Inventory tab-switching no longer fades, destructive button presses (e.g. delete
  in a confirm dialog) feel snappier on press, and the scroll-to-top button doesn't flicker
  when scrolling back and forth near its show/hide threshold.
