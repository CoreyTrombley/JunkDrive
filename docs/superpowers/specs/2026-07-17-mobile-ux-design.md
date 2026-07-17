# JUNKRUN Mobile UX Refactor — Design Spec (v2.3.0)

Date: 2026-07-17. User brief: "refactor the UI for better UX, it needs to feel like a mobile
game. Keep the punch and vibe, but it's a bit cluttered and compacted. There needs to be some
separation of the different sections on some of the pages — an options screen, stats screen, etc."
User-confirmed choices: hub-and-spoke navigation · glowing-card visual treatment · all five
tabs + sub-screens in one pass · transitions + sticky headers + pull-down quick stats.

## Principles

- **UI layer only.** No engine, state-shape, or balance changes; no save-compat surface. All
  work lives in `src/components/`, `src/app.tsx`, and `src/style.css`.
- **Keep the punch.** Station-accent neon theming, chunky mono numbers, toasts/floaters/confetti
  all stay. Cards AMPLIFY the glow (station-tinted borders) while density drops.
- **One job per screen.** Every screen answers one question; everything else is a tap away.
- `reducedMotion` disables all new animation.

## Navigation architecture

A lightweight screen stack in `App`:

```ts
type SubScreen =
  | { tab: 'more'; id: 'wormhole' | 'rewards' | 'codex' | 'stats' | 'settings' | 'save' }
  | { tab: 'map'; id: 'contracts' | 'signals' };
// App state: activeTab: TabId, sub: SubScreen | null. Switching tabs clears `sub`.
```

- Sub-screens render full-screen with a **back header**: `‹ ‹chevron› ‹icon› ‹title›`, tap
  anywhere on the header (or the hardware/browser back is out of scope) returns to the hub.
- **Transitions:** tab switches cross-fade (120ms); hub → sub-screen slides in from the right
  (180ms translate + fade); back slides out. Pure CSS classes keyed on a nav revision counter;
  skipped entirely under `reducedMotion`.

## Screen inventory (after)

1. **MARKET** — sticky compact header (station name + controls row pinned), goods as glowing
   cards (one card per good, 44px+ touch rows), stock badges and mass inline as today.
2. **MAP** — the chart owns the screen. Under it: the route bar, then two pill buttons —
   `⚡ Contracts (n ready)` and `📈 Signals (n)` — opening sub-screens. Contracts and Signals
   sections move off the main scroll entirely.
3. **SHIP** — two cards: Upgrades (rows), Personal Bests (tile grid).
4. **YARD** — rate banner card, then one glowing card per rig (existing content, more padding,
   the whole card stays the tap target).
5. **MORE → COMMAND hub** — a grid of big tappable cards, exactly:
   - `🌀 WORMHOLE ›` (full-width): prestige banner + relic shop → sub-screen
   - `🎁 REWARDS` (half): daily streak + boost tokens → sub-screen
   - `🏆 STATS` (half): stat tiles + milestone wall + personal bests → sub-screen
   - `📖 CODEX` (half): codex sets (tap-tooltips stay) → sub-screen
   - `⚙️ OPTIONS` (half): all settings toggles/sliders → sub-screen
   - `💾 SAVE` (half): export/import → sub-screen
   Hub cards show a live hint line (e.g. REWARDS shows "Daily ready!" when claimable; WORMHOLE
   shows the DM preview) so the hub itself carries signal.
6. **Quick-stats drawer** — tapping the HUD (existing `onOpenTicker` affordance area) toggles a
   drop-down drawer under the HUD: rank + XP progress bar, gate resonance `⚡ n/needed` (when a
   gate ladder is active), boost countdown, daily-streak state, active event count. Closes on
   tap-outside or re-tap. Replaces nothing — the ticker line stays.

## Visual language (the card system)

New CSS primitives in `style.css` (consumed everywhere):

- `.card` — `border-radius: 14px; padding: 14px; background: color-mix(in srgb, var(--surface) 88%, var(--accent) 12%)`-style tint fallback to rgba layering; `border: 1px solid` accent at 25% alpha; subtle `box-shadow: 0 0 12px` glow at 12% accent alpha; `margin-bottom: 12px`.
- `.card-header` — icon + title row, 13px caps label, accent color, 8px bottom margin.
- `.hub-card` — the tappable hub tiles: min-height 72px, icon 22px, title + live hint line, `›` affordance, active-state scale(0.98) press feedback.
- `.row-tap` — list rows: `min-height: 44px`, centered vertically.
- `.sub-header` — sticky back header: `position: sticky; top: 0`, station-bg backdrop blur, z above content.
- Screen padding rises from the current cramped values to 14px horizontal rhythm; sections separated by the card gaps, no bare `section-label` floating between unrelated blocks.

## Component moves (no logic changes — cut/paste + card wrappers)

- `MoreScreen.tsx` shrinks to the COMMAND hub. New: `WormholeScreen.tsx` (prestige banner +
  relics list), `RewardsScreen.tsx` (daily + boosts), `StatsScreen.tsx` (stats grid + milestone
  wall + the bests currently duplicated on ShipScreen stay on Ship too), `CodexScreen.tsx`,
  `OptionsScreen.tsx` (settings), `SaveScreen.tsx`. All existing handlers/actions move verbatim.
- `MapScreen.tsx` sheds Contracts + Active Signals into `ContractsScreen.tsx` (wraps the
  existing `ContractsPanel`) and `SignalsScreen.tsx` (the signals list, dressed names intact);
  gains the two pill buttons with live counts.
- `Hud.tsx` gains the drawer toggle + `QuickStats.tsx` (reads existing state only:
  rank/xp/xpToNext, gateResonance/resonanceNeeded, activeBoost, dailyStreak, activeEvents).
- `app.tsx` owns the nav state, passes `openSub`/`closeSub` down, applies transition classes.

## Out of scope

Engine/state changes; TradeSheet redesign (already a bottom sheet — it fits the language);
map chart rendering changes; new features. Onboarding copy references tabs by name only — no
changes needed (verify in QA).

## Verification

- No unit-test surface (pure UI): gates are strict typecheck, full suite green (85 tests
  unaffected), `npm run balance` untouched, plus a structured manual QA checklist per screen.
- Version: **v2.3.0**.
