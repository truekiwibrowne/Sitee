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
| `npm run test:emulators` | Unit tests plus the Firestore/Storage security-rules tests in `tests/rules`, inside the emulators (what CI runs) |

## Layout

- `apps/web` – React PWA (Vite, Tailwind, Framer Motion)
- `functions` – Cloud Functions v2 (Node 22)
- `packages/shared` – types, zod schemas, XP rules shared by both
- `firestore.rules`, `storage.rules` – security rules

## CI (GitHub Actions)

`ci.yml` runs lint, typecheck, build and the emulator tests on every PR and push to `main`. It has no secrets and no access to Firebase.

## Deploying (by hand, from your laptop)

Test locally first. Then deploy only what changed:

| Command | Deploys |
| --- | --- |
| `npm run deploy:web` | The web app (Hosting) |
| `npm run deploy:functions` | Cloud Functions (unchanged functions are skipped) |
| `npm run deploy:rules` | Firestore and Storage security rules + indexes |
| `npm run deploy:all` | Everything (rarely needed) |

You need to be logged in (`npx firebase login`) as an owner of `sitee-eeac7`.
