Read CLAUDE.md, docs/PLAN.md and the mockups in docs/mockups/. Then set up the project and build Phase 0 plus the first slice of Phase 1, in this order. Stop after each step, summarise what you did and anything I need to do, and wait for me.

1. Scaffold the monorepo, Firebase config (firebase.json, .firebaserc placeholder), emulators, Tailwind theme from the tokens in CLAUDE.md, and GitHub Actions workflows.
2. Auth, role custom claims and a seed script for the emulators: 1 org, 2 sites, 1 user per role, plus "Daily site report" and "Rebar hold point" templates.
3. Shared zod schemas and TypeScript types for every collection in the plan.
4. Firestore and Storage security rules with emulator tests (including: clients can never write XP).
5. Foreman "Today" screen matching docs/mockups/foreman-today.dc.html: task path (done / current / locked / daily chest), streak, XP and league chips, Brix with animations, bottom nav.
6. Daily site report form generated from the template's fields (pick list, number, text, photo), working offline.
7. Functions: onSubmission creates a review task for the site manager; onReview writes an xpEvent and updates totals; a daily scheduled job generates task instances and checks streaks.
