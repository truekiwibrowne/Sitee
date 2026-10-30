# Site Streak

Gamified construction site reporting. See `CLAUDE.md` for the rules of the road and `docs/PLAN.md` for the plan.

## Local dev

Needs Node 22 (`.nvmrc`) and Java 21+ for the emulators.

```bash
npm install
npm run emulators   # Auth, Firestore, Storage, Functions + UI on http://localhost:4000
npm run seed        # in a second terminal: demo org, 2 sites, 1 user per role, templates
npm run dev         # web app on http://localhost:5180, talking to the emulators
```

The emulators run as `demo-site-streak`, so no real Firebase project or login is needed locally.

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint across all workspaces |
| `npm run typecheck` | `tsc --noEmit` in each workspace |
| `npm run build` | shared → web → functions |
| `npm test` | Unit tests |
| `npm run test:emulators` | Tests with Auth/Firestore/Storage emulators running (what CI runs) |

## Layout

- `apps/web` – React PWA (Vite, Tailwind, Framer Motion)
- `functions` – Cloud Functions v2 (Node 22)
- `packages/shared` – types, zod schemas, XP rules shared by both
- `firestore.rules`, `storage.rules` – security rules

## CI/CD (GitHub Actions)

- `ci.yml` – lint, typecheck, build and emulator tests on every PR and on `main`
- `preview.yml` – deploys each PR to a 7-day Hosting preview channel and comments the link
- `deploy.yml` – on merge to `main`, deploys Hosting, Functions and rules to the live project

Both deploy workflows use the `FIREBASE_SERVICE_ACCOUNT_SITEE_EEAC7` repo secret (created by `firebase init hosting:github`).
