# Dogfight

Browser arcade dogfight (F-22 vs Su-35) branded AETHER in the UI.
Profile: ts-worker-web
Direction: [docs/README.en.md](docs/README.en.md). Frameworks must not rewrite this file.

## Sources of Truth

This file is the **contract**. Hooks, CI, and config are **enforcement**. If they disagree, that is a failure — raise enforcement to match this file; never lower the contract to a weaker hook.

| Fact | Where |
|---|---|
| Agent handbook | this file |
| Human docs | README.md, `docs/README.en.md` |
| Version | `package.json` `"version"` as `1.2.3`, display `v1.2.3` |
| Enforcement | `.github/workflows/ci.yml`, `vite.config.ts` (no coverage), `scripts/browser-smoke.mjs` |
| Machine rules | global `AGENTS.md`, `rules/git-commit.md` |
| Accidents | [Retrospective.md](Retrospective.md) |
| Env files | none required |

## Project Invariants

- Single-player, in-browser only. No accounts, multiplayer, or external 3D model service.
- Worker serves assets and `/api/live` (`run_worker_first`). Do not add D1 or remote `-test` resources.
- High score is origin localStorage. Current mission/settings are memory-only; refresh does not resume combat.
- Arcade flight, not a real avionics sim. Do not claim FAA/realism fidelity.
- Smoke may use `AETHER_TEST_URL`; default is `http://localhost:5173`. Do not point that at production.

## Stack / Layout

| Component | Choice |
|---|---|
| Language | TypeScript (`tsc --noEmit` / `tsc -b`) |
| Package manager | npm (`package-lock.json`) plus `bun.lock` |
| Runtime | Vite + React + Three.js; Cloudflare Worker `worker.js` |
| Lint | none |
| Tests | Vitest `src/game/simulation.test.ts`; Playwright smoke `test:browser` |
| Data | none (browser localStorage high score) |

```
src/game/  public/  scripts/browser-smoke.mjs
worker.js  wrangler.jsonc
```

## Commands

```bash
npm install   # CI uses bun for build
npm run dev                 # Vite --host 0.0.0.0 (default :5173)
npm run typecheck           # tsc --noEmit
npm run build               # tsc -b && vite build
npm test                    # vitest run (no coverage thresholds)
npm run test:browser        # node scripts/browser-smoke.mjs
```

No lint or deploy script in package.json; release workflow runs `bun run build` + wrangler.

## Verification

Status: `enforced` | `planned` | `manual` | `N/A`.
6DQ = L1/L2/L3 + G1/G2 + D1. Required L1 bar is statements/branches/functions/lines each ≥95%; no skipped or focused tests.

| Change | Proof | Status | Evidence |
|---|---|---|---|
| Logic | L1 Vitest ≥ 95% four metrics | planned | CI `bun run test` with `coverage-path: ""`; no thresholds in `vite.config.ts` |
| API / schema | L2 real HTTP | N/A | no application API beyond static `/api/live` |
| UI path | L3 Playwright smoke | planned | `test:browser` exists; **not** in CI |
| Types / lint | G1 0 error, 0 warning | planned | CI typecheck; `lint: false`; no husky |
| Deps / secrets | G2 osv-scanner + gitleaks | enforced | quality.yml default `security: true` |
| Test isolation | D1 fresh browser state and a guarded local target | planned | Smoke launches a fresh browser and defaults to localhost:5173, but `AETHER_TEST_URL` accepts an unchecked remote URL. Require loopback and a test-owned server; SQLite/`_test_marker` are N/A because there is no database |
| Bundler output | `bun run build` | enforced | CI `prepare-command` |
| Docs | README if controls changed | manual | human review |
| Release | version + live HTTP 200 | enforced | `release.yml` curl `https://dogfight.hexly.ai/` |

No husky. Target (unmeasured): pre-commit G1+L1 on index snapshot <30s; pre-push L2+G2 on stdin refs <3min. `--no-verify` forbidden.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
|---|---|---|
| Dev | 5173 Vite | local; may bind `0.0.0.0` |
| L3 smoke | 5173 or `AETHER_TEST_URL` | local only |

E2E never touches prod data stores. No SQLite in this static game. Do not deploy remote `-test` Workers.

## Operations / Release

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
