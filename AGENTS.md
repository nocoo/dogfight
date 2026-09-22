# Dogfight

Browser arcade dogfight (F-22 vs Su-35) branded AETHER in the UI.
Profile: ts-worker-web
Direction: [docs/README.en.md](docs/README.en.md). Frameworks must not rewrite this file.

## Scope and instruction sources

- This file is the only project handbook; nested files do not compete with it. Do not create a `CLAUDE.md` alias or copy.
- This file is the contract; `.github/workflows/ci.yml`, `vite.config.ts` (no coverage) and `scripts/browser-smoke.mjs` are enforcement. If they disagree, that is a failure — raise enforcement to match this file; never lower the contract to a weaker hook.
- Human docs: [README.md](README.md) and `docs/README.en.md`. Version is `package.json` `"version"` as `1.2.3`, displayed `v1.2.3`. No env files are required. Global machine rules live in the machine `AGENTS.md` and `rules/git-commit.md`.
- Accidents: [Retrospective.md](Retrospective.md).

## Project invariants

- Single-player, in-browser only. No accounts, multiplayer, or external 3D model service.
- Worker serves assets and `/api/live` (`run_worker_first`). Do not add D1 or remote `-test` resources.
- High score is origin localStorage. Current mission/settings are memory-only; refresh does not resume combat.
- Arcade flight, not a real avionics sim. Do not claim FAA/realism fidelity.
- Smoke may use `AETHER_TEST_URL`; default is `http://localhost:5173`. Do not point that at production.

## Setup and commands

TypeScript (`tsc --noEmit` / `tsc -b`); npm (`package-lock.json`) plus `bun.lock`; Vite + React + Three.js on a Cloudflare Worker `worker.js`; no lint; Vitest `src/game/simulation.test.ts` plus Playwright smoke `test:browser`; no database (browser localStorage high score). Layout: `src/game/`, `public/`, `scripts/browser-smoke.mjs`, `worker.js`, `wrangler.jsonc`. CI uses Bun 1.4.0 for build.

```bash
npm install
npm run dev                 # Vite --host 0.0.0.0 (default :5173)
npm run typecheck           # tsc --noEmit
npm run build               # tsc -b && vite build
npm test                    # vitest run (no coverage thresholds)
npm run test:browser        # node scripts/browser-smoke.mjs
```

No lint or deploy script in package.json; release workflow runs `bun run build` + wrangler.

## Testing and quality contract

6DQ keeps its name with unified L1, L2/L3, G2 and D1; the owner merged former G1 into L1 on 2026-09-21.
Required L1 bar: statements/branches/functions/lines each ≥95%; no skipped or focused tests; strict types and check-only lint/format with zero errors/warnings, installed hooks and failure rejection.
Statuses: `enforced` | `planned` | `manual` | `N/A`.

| Dimension | Required proof | Status | Evidence |
|---|---|---|---|
| L1 pre-commit quality | Four coverage metrics ≥ 95%, no skipped/focused tests, strict types and check-only lint with zero errors/warnings | planned | CI `bun run test` with `coverage-path: ""`; no thresholds in `vite.config.ts`; CI typecheck; `lint: false` with documented reason (no lint script); no husky installed |
| L2 API | Real HTTP | N/A | no application API beyond static `/api/live` |
| L3 UI path | Playwright smoke | planned | `test:browser` exists; **not** in CI |
| G2 security | osv-scanner + gitleaks | enforced | quality.yml default `security: true` |
| D1 isolation | Fresh browser state and a guarded local target | planned | Smoke launches a fresh browser and defaults to localhost:5173, but `AETHER_TEST_URL` accepts an unchecked remote URL. Require loopback and a test-owned server; SQLite/`_test_marker` are N/A because there is no database |
| Build | `bun run build` | enforced | CI `prepare-command` |
| Docs | README if controls changed | manual | human review |
| Release | version + live HTTP 200 | enforced | `release.yml` curl `https://dogfight.hexly.ai/` |

No husky. Target (unmeasured): pre-commit unified L1 on an index snapshot <30s; pre-push L2+G2 on stdin push refs <3min. `--no-verify` forbidden.

## Resources and isolation

| Purpose | Port / resource | Isolation |
|---|---|---|
| Dev | 5173 Vite | local; may bind `0.0.0.0` |
| L3 smoke | 5173 or `AETHER_TEST_URL` | local only |

E2E never touches prod data stores. No SQLite in this static game. Do not deploy remote `-test` Workers.

## Operations / release

- Entry: tag `v*.*.*` / `release.yml`
- Auth: Cloudflare account owner
- Before ship: CI typecheck+unit+build; live 200
- Runbook: README + `release.yml`

## Retrospective

| Kind | Where |
|---|---|
| Accident narrative | [Retrospective.md](Retrospective.md) |
| Project-specific rule that will recur | one line here (cap ~10) |
| Cross-project lesson | nmem / global `AGENTS.md` / `rules/` |
| Deterministically checkable rule | hook or test, not prose |

- Do not set `AETHER_TEST_URL` to the production host.
