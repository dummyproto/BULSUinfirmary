# Recommendations for Future Improvements

Roughly in priority order.

## Before Production Launch

1. **Verify the RLS policies against a live project.** They're written (`supabase/migrations/`), covering per-role access for every table, but couldn't be tested against a real Supabase instance in the environment they were written in — see the "A Note on RLS Testing" checklist at the bottom of `KNOWN_ISSUES.md` before trusting them with real data.
2. **Add rate-limiting/CAPTCHA to the pre-login Emergency SOS flow before real production use.** It intentionally accepts anonymous writes (matching the original app and the explicit request to add it), but that's a real spam/abuse vector worth mitigating — e.g. front `emergency_alerts` inserts and `search_patients_public` calls with a Supabase Edge Function that applies rate limits per IP, rather than direct anon-role table/RPC access.
3. **Verify the `create-user` Edge Function end-to-end.** It's written and documented (`supabase/functions/create-user/`, deployment steps in `DEPLOYMENT.md`) but couldn't be deployed or tested in this environment. Confirm: it deploys cleanly, the admin-only check actually rejects non-admins, and both `invite` and `password` modes produce a working login.
4. **Verify the `chat-completion` Edge Function end-to-end**, same caveat as above — couldn't be deployed or tested here. Confirm it deploys cleanly, real replies come back with a valid `GROQ_API_KEY` set, and the automatic fallback to `botEngine.js` actually kicks in when the key is missing or the function isn't deployed.
5. **Add rate-limiting to the chatbot's AI endpoint** before real production use — right now a user could send messages in a tight loop and consume Groq API quota/cost with no throttling. A simple per-user cooldown inside the Edge Function (using `chat_messages` timestamps you already have, no new table needed) would cover this.
6. **Migrate the schema gaps in `KNOWN_ISSUES.md`** that block real functionality (`'Claimed'` status, `diagnosis` column, `'Emergency'` visit type at minimum).
7. **Move avatar/profile images to Supabase Storage** instead of base64-in-TEXT — better performance, proper CDN caching, and it stops bloating `users` table rows.

## Testing

8. **Add automated tests.** Suggested starting point given the codebase's shape:
   - **Vitest** for the pure functions in `src/lib/` and `src/features/*/lib/` (formatting, validation, `getInventoryStatus`, `deductForConsultation`'s matching logic, etc.) — these are already side-effect-free and easy to unit test.
   - **React Testing Library** for component-level tests on the more complex interactive pieces (`SearchableSelect`, `Modal`'s focus trap, form validation in the various modals).
   - **Playwright** for a handful of critical-path E2E tests (login → dashboard, submit a document request → approve it, add an inventory item) run against a real (test) Supabase project.

## Performance

9. Bundle is now code-split by route (~250KB initial load, down from ~1.07MB) — the remaining large per-page chunks (Consultation ~236KB with Chart.js, Inventory ~187KB with jsQR) only load when those specific pages are visited, which is the right tradeoff. If Consultation's Analytics tab is rarely used relative to the rest of the page, it could be split into its *own* lazy chunk separate from the rest of Consultation for an even lighter initial page load.
10. Consider `React.memo` on the larger table-row components (`ItemsTab`'s `ItemRow`, etc.) if you notice re-render jank on inventories/lists with hundreds of rows — not needed at current expected data volumes.
11. Consider pruning `legacy.css` once you have a way to visually regression-test the result (e.g. Percy, Chromatic, or just careful manual review) — flagged in Known Issues as not attempted here due to that exact risk.

## Accessibility

12. This pass added keyboard/screen-reader support to the highest-traffic interactive elements (global Topbar bell + avatar, all toggle switches, the shared Modal's focus trap). A handful of other clickable `<div>`s exist further down in less-trafficked areas (dashboard stat cards, chatbot topic chips, diagnosis quick-picks) that would benefit from the same `role="button"`/keyboard-handler treatment — not done here for time, listed so it's not forgotten.
13. Run an automated audit (Lighthouse, axe DevTools) once you can load the app in a real browser — this pass was necessarily code-review-only given the sandbox's lack of browser/network access to a live Supabase project.

## Developer Experience

14. Add a CI pipeline (GitHub Actions or similar) running `npm run lint` and `npm run build` on every PR — trivial to set up and would have caught the couple of self-introduced syntax slips during this project immediately instead of at the next manual lint pass.
15. Consider TypeScript for the service layer at minimum — the amount of manual field-name mapping between camelCase UI state and snake_case Supabase columns (documented throughout `src/services/`) is exactly the kind of thing a type system catches for free.
