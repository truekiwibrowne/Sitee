# Site Streak

Gamified construction site reporting. See `CLAUDE.md` for the rules of the road and `docs/PLAN.md` for the plan.

## Local dev

Needs Node 22 (`.nvmrc`) and Java 21+ for the emulators.

```bash
npm install
npm run emulators   # Auth, Firestore, Storage, Functions + UI on http://localhost:4000
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

Both deploy workflows need a `FIREBASE_SERVICE_ACCOUNT` repo secret and the real project ID in `.firebaserc`.
