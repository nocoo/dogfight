<p align="center">
  <img src="../assets/brand/icon-rounded.png" alt="Dogfight logo" width="180" height="180" />
</p>

<h1 align="center">Dogfight</h1>

<p align="center">Fly an F-22 against Su-35s in a browser arcade dogfight.</p>

<p align="center">
  <a href="https://dogfight.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

<p align="center">
  <img src="../preview.jpg" width="720" alt="Dogfight — AETHER combat interface" />
</p>

## What it does

Dogfight is a browser 3D air-combat game whose interface uses the AETHER name. You fly a fixed F-22 and start airborne against three Su-35s. Shooting down all three wins the mission; losing the aircraft or hitting terrain ends it in defeat.

Flight, locking, missiles, the cannon, and countermeasures are designed around one arcade mission, without takeoff, landing, or real-world aviation-system simulation. The game runs in the browser and currently has no multiplayer or account service.

## Features

- Pursue enemies with pitch, turning, afterburner, and braking while the HUD displays speed, altitude, aircraft condition, targets, and incoming missiles.
- Lock targets with AIM-120C missiles, fire an unlimited cannon with overheating, and release flares against incoming missiles.
- Fight among procedurally generated F-22 / Su-35 aircraft, terrain, water, and clouds, with synthesized Web Audio effects.
- Use keyboard, optional mouse steering, or touch direction controls, with landscape and fullscreen support, inverted pitch, mouse sensitivity, and two quality presets.
- Pause when switching tabs or opening settings, then review your score and launch another sortie after the mission.

The highest winning score is stored in the current browser's localStorage. The active mission and control settings live in memory, so refreshing does not resume combat. High scores do not synchronize across browsers or devices.

## Usage

Open the [game](https://dogfight.hexly.ai) in a modern WebGL 2 browser and click the engage button. Aircraft, scenery, and audio do not depend on an external 3D model service.

| Action | Keys |
| --- | --- |
| Pitch up / down | W / S, ↑ / ↓ |
| Turn left / right | A / D, ← / → |
| Afterburner / brake | Hold Shift / C |
| Fire cannon | Hold Space |
| Fire missile | Enter |
| Cycle target | Q |
| Release flares | F |
| Pause / resume | Esc / P |

A target locks after roughly 1.1 seconds within 21° of the aircraft's forward direction and closer than 3.6 km. Two missiles can destroy an enemy at full health, and the cannon has mild aim assistance within 1.7 km. These are game rules, defined in the [combat simulation](../src/game/simulation.ts).

You can also select targets by clicking an aircraft marker or target list, and fire missiles through the weapon card. Keyboard input remains available when mouse steering is enabled. Select the balanced quality preset if performance is low.

## Development

Node.js 22 with npm is recommended; the repository's CI uses Bun 1.4.0. These commands use the committed npm lockfile.

```bash
git clone https://github.com/nocoo/dogfight.git
cd dogfight
npm ci
npm run dev
```

Vite defaults to port 5173. If occupied, use the actual address printed in the terminal or select one with `npm run dev -- --port 5174`. The app needs no API keys or database.

```bash
npm run typecheck
npm run build
npm run preview
```

Build output goes to `dist/` and can be served by a static web host. The current site uses Cloudflare Workers Static Assets; its domain and asset directory are defined in [wrangler.jsonc](../wrangler.jsonc).

| Path | Contents |
| --- | --- |
| `src/App.tsx`, `src/styles.css` | HUD, settings, pause, and mission flow |
| `src/game/simulation.ts` | Independent flight, guidance, weapons, and outcome logic |
| `src/game/engine.ts` | Input and rendering loop |
| `src/game/aircraft.ts`, `world.ts`, `clouds.ts` | Procedural aircraft and environment |
| `src/game/audio.ts` | Synthesized sound effects |
| `scripts/browser-smoke.mjs` | Browser mission flown through the HUD and keyboard |

## Tests

```bash
npm test
```

Vitest checks flight, locking, missiles, flares, cannon overheating, outcomes, and resets without a development server.

For browser journeys, first run `npm run dev` in another terminal, then execute:

```bash
npx playwright install chromium
AETHER_TEST_URL=http://localhost:5173 npm run test:browser
```

Set `AETHER_TEST_URL` to the current local server address. The script does not start a server. It prefers installed Google Chrome on macOS and otherwise uses Playwright Chromium. It covers a complete desktop mission, pause and settings, mobile touch, and landscape checks, writing screenshots to `test-results/`. Current CI runs builds and unit tests; run the browser script separately. There is no server API test layer.

## Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)

| Area | Implementation |
| --- | --- |
| Game and HUD | TypeScript, React, CSS, Lucide |
| 3D and audio | Three.js, WebGL 2, Web Audio |
| Local score | localStorage |
| Build and hosting | Vite, Cloudflare Workers Static Assets |
| Tests | Vitest, Playwright |

## Documentation

- [Logo usage](01-logo-usage.md)
- [Identity study](https://hexly.ai/logos/dogfight)

## License

[MIT](../LICENSE) © 2026 Zheng Li
