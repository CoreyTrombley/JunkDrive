# JUNKRUN 🚀

Buy junk. Jump stars. Get rich. Endless.

A mobile-first idle/trading hybrid built from `junkrun-spec.md` — Dope Wars-style
station-to-station trading crossed with AdVenture Capitalist-style idle income,
wrapped in a space-scrap-smuggler theme. No images anywhere: every visual is an
emoji icon, CSS animation, or canvas particle; every sound is synthesized live
with the Web Audio API.

## Quick start

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # type-checks, then produces a single self-contained dist/index.html
npm run preview   # serve the production build locally
```

The production build uses `vite-plugin-singlefile`, so `dist/index.html` is a
**fully self-contained file** — open it directly in a browser (even via
`file://`, no server needed) and the whole game runs, gzip ~42KB. Note that
`file://` can still run the game, but the browser will not register a Service
Worker from a `file://` origin, so "Add to Home Screen" only becomes available
once it's served over `http(s)://` (localhost or a real deploy both count).

## Deploying to GitHub Pages

`npm run build` produces everything Pages needs in `dist/`: the single-file
`index.html`, plus `manifest.webmanifest`, `sw.js`, `icons/`, and `.nojekyll`
(all copied from `public/`, since `vite-plugin-singlefile` only inlines JS/CSS,
not other static files). Every path in those files is relative, so the same
build works whether it's hosted at a domain root or a project subdirectory
like `https://<user>.github.io/<repo>/` — no `base` config needed either way.

To publish:

1. `npm run build`
2. Push the **contents of `dist/`** to whatever branch/folder your repo's
   Pages source is set to — e.g. a `gh-pages` branch (`git subtree push` or
   any `gh-pages`-style deploy action), or a plain `git add -f dist && git
   subtree push --prefix dist origin gh-pages`. A GitHub Actions workflow
   using `actions/upload-pages-artifact` + `actions/deploy-pages` on
   `dist/` works too.
3. In the repo's Settings → Pages, point the source at that branch/folder.

The `.nojekyll` file is included so GitHub Pages serves the build as-is
instead of running it through Jekyll first (which can otherwise choke on
stray `{{`/`{%`-like sequences inside the bundled JS).

## Project shape

```
src/
  config/     Pure data: goods, stations (+ theming), rigs, ranks, events,
              relics, ship upgrades, quests, codex sets. Balance lives here,
              not scattered through logic — see spec §15.6.
  engine/     The reducer and everything it depends on:
              state.ts       GameState shape + fresh-save factory
              actions.ts     every mutation in the game (buy/sell/jump/rigs/
                              prestige/quests/…) — the reducer
              store.ts       @preact/signals store + the 250ms clock signal
              price.ts       market wave math (pure, seed-free random walk)
              pricing.ts     ties state + config into an actual displayed price
              formulas.ts    rig cost/rate, prestige DM, gate tolls, milestones
              sectorgen.ts   procedural sector 2+ goods & station reskinning
              audio.ts       synthesized SFX + ambience (zero audio files)
              haptics.ts     navigator.vibrate patterns
              bus.ts         tiny pub/sub so logic can trigger UI "juice"
                              (floaters/SFX/haptics/confetti) without knowing
                              about the DOM
  components/ Preact UI: one file per screen/modal (Market, Map, Yard, Ship,
              More, TradeSheet, EncounterModal, JackpotModal, OfflineModal,
              Onboarding, Hud, TabBar, Starfield, FxLayer, QuestRailStrip)
  app.tsx     Screen router + station theme application (CSS custom props)
  main.tsx    Boot sequence: load-or-init save, start clock/autosave, mount
public/
  manifest.webmanifest, sw.js, icons/   PWA install + offline shell caching
```

## Design notes / where things live

- **Theming**: each station in `config/stations.ts` carries a full
  `StationTheme` (palette, particle hue, overlay style, musical motif,
  ambience type). `app.tsx` pushes these onto CSS custom properties on dock,
  so the whole app crossfades — no per-screen theme logic needed.
- **Pricing**: `price = base × bias × wave × event × 8^(sector-1)`, exactly
  per spec §16.1. Bias lives in `config/stations.ts` for Sector 1; Sector 2+
  bias/goods are generated deterministically by `engine/sectorgen.ts` (seeded
  PRNG keyed off the sector number, so it's reproducible, not saved).
- **Offline & idle income**: nothing accumulates on a `setInterval` — every
  value is a pure function of elapsed wall-clock time (`Date.now()` deltas),
  so backgrounding the tab or closing the app can't desync anything. See
  `bootGame()` in `actions.ts` for the offline catch-up path.
- **No build-your-own RNG worries**: `engine/rng.ts` is a small mulberry32
  implementation used for market waves and event rolls — fast enough to
  fast-forward hundreds of ticks synchronously on load.
- **Balance**: every number in `config/*.ts` is the literal value from
  `junkrun-spec.md` (§4.2 station bias, §5.1 goods, §7.1 rigs, §9 rank curve,
  §11.1 relics). Sim-verified pacing targets are in spec §16.2.

## What's implemented vs. spec's v1.x/vDream cutline

Everything in spec §17's **v1.0 MVP** list is in: Sector 1 + a working Sector 2
gate/toll/reskin, all 24 goods, all 10 rigs + managers + milestones + offline
earnings, ship upgrades, all 6 market events / 7 encounters / 4 jackpots, the
3-slot quest rail, daily streak + shield, milestone wall, Codex with set
bonuses, Wormhole prestige + all 12 relics, the full juice layer (animation +
synthesized SFX + haptics), and PWA install/offline shell.

Trimmed for scope (flagged as v1.x/vDream in the spec, or noted inline in
code): Sector 3+ uses the same procedural generator as Sector 2 rather than
hand-tuned content; a couple of encounter timers (e.g. Stowaway's "3 minutes")
resolve immediately rather than running a live countdown; break_infinity.js
bignum swap-in isn't wired up (floats are fine well past any realistic play
session). None of these affect the core loop.
