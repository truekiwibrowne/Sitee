# Site Streak

Gamified construction site-reporting PWA: Duolingo-style streaks, XP, leagues and a mascot (Brix) wrapped around daily site reports, QC hold points, reviews, assigned tasks and training. Full plan: `docs/PLAN.md`. Screen mockups: `docs/mockups/` (reference markup + interaction logic, not production code).

## Stack (don't substitute without asking)
- React 18 + TypeScript + Vite PWA (vite-plugin-pwa), Tailwind, Framer Motion
- Firebase: Hosting, Auth (email + password, Google), Firestore (offline persistence), Storage (photos), Functions v2 (TS, Node 22), scheduled functions, FCM, App Check
- Firebase Emulator Suite for local dev and tests
- GitHub Actions: lint + test on PR, preview channel on PR, deploy live on merge to main

## Repo layout (npm workspaces)
`apps/web` · `functions` · `packages/shared` (types, zod schemas, XP rules) · `firestore.rules` · `storage.rules` · `docs`

## Roles
foreman → siteManager → projectManager → constructionManager, plus admin. Each role has recurring tasks, reviews the level below (plus cross-site peer reviews), and assigns tasks and training to the level below. Roles + orgId live in Auth custom claims. All data under `orgs/{orgId}/`.

## Non-negotiable rules
- XP, streaks, unlocks, review routing and training sign-off results are written ONLY by Cloud Functions. Clients never write XP fields or `xpEvents`. Cover with emulator rule tests.
- XP = base × reviewer stars (1★ ×0.5, 2★ ×1, 3★ ×1.5), daily cap per user.
- Streak breaks if the daily report misses the template due time (site timezone). Streak freezes for rain days/holidays.
- Offline-first: queue submissions and photos; compress photos to ~300 KB; in-app camera with GPS + time.
- Photos go to Firebase Storage, never the repo.

## Demo mode (live site)
"Try the demo" on the sign-in screen: anonymous sign-in, then a Cloud Function copies the demo org into a private sandbox (`orgs/demo-{uid}`) with `demo: true` claims for the chosen role. Sandboxes are isolated and deleted after 24 hrs. Rules must keep demo users inside their own sandbox and cap their uploads. Functions are bundled with esbuild so they can import `packages/shared`.

## Look and feel
Friendly and playful, not corporate. Tokens: bg #FFF7E8, ink #24324A, muted #5A6478, yellow #FFC93C (shadow #D69E00), teal #2BB3A3 (shadow #17766C), coral #FF7A59 (shadow #C2410C), locked #E6E1D6. Font: Nunito 700–900. Chunky rounded buttons with a 4px darker bottom shadow that presses down on tap. Brix = brick in a yellow hard hat (SVG component; idle bob, cheer, worried states). Confetti + XP count-up on completion. Respect prefers-reduced-motion. Touch targets ≥ 44px. Mobile-first at 390px. Don't copy Duolingo assets or colours.

## Working style
- Keep it simple; no over-engineering.
- Work in small steps; stop after each, summarise, and wait.
- Ask before adding any library not listed above.
- Explain anything I need to do myself (logins, Firebase console, billing).
