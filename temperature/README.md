# Temperature — Offline-First PWA

Installable, offline-first card game implemented with plain HTML, CSS, and JS (ES modules). No backend. Game state and settings are stored locally in IndexedDB. Service Worker precaches the app shell for full offline play and surfaces an update prompt when a new version is deployed.

## Rules (Authoritative Summary)
1) Objective: Minimize your hand total and call Show at the start of your turn when you believe you’re lowest.
2) Card values: A=1; 2–10=face; J=0; Q=12; K=15. Optional Jokers=0 (off by default).
3) Deal: 7 cards each. One card face-up starts Discard; rest form Deck.
4) Turn: Drop one or more cards only if all dropped share the same rank; then draw exactly one card (Deck top or Discard top). If you cannot drop at start, draw one first then you must drop one.
5) Reshuffle: When Deck is empty, reshuffle Discard except its top; reshuffled cards become new Deck.
6) Show: Only at start of your turn before any action. Everyone reveals and totals are compared.
   - Caller uniquely lowest: caller -20 points.
   - Caller tied for lowest: caller 0.
   - Someone else lower: caller +70.
   - Non-callers add their own hand total to their score.
7) Modes: One-Round (ends after a valid Show) and Room Mode (successive rounds until a player reaches Target; eliminated at ≥ Target; last remaining wins).
8) Multi-Drop: Only same-rank cards may be dropped together.
9) Jokers: Value=0; may be dropped alone or with Jokers only (not wilds).
10) CPU: Drops the highest-value rank (breaking ties by largest set), draws from Deck; if its hand total < 15, plans to Show at its next turn start.

## Project Structure
```
temperature/
  index.html         # App shell, tabs, SW registration
  styles.css         # Dark, responsive, touch-friendly
  manifest.webmanifest
  sw.js              # Versioned precache, cache-first, updates
  src/
    app.js           # Game engine + state
    rules.js         # Deck build, totals, legality, reshuffle
    ui.js            # Rendering, events, ARIA, shortcuts
    storage.js       # IndexedDB saves + settings
    sw-updates.js    # Update prompt wiring
    cpu.js           # Simple CPU policy
  icons/             # Placeholder PNG icons (generated locally)
  assets/
    img/             # (placeholder)
    sfx/             # (placeholder)
```

## Run Locally
- Prerequisites: Node 16+.
- Start a local static server (no external deps):

```
npm run serve
# Open http://localhost:8080/temperature/
```

The server generates placeholder PNG icons under `temperature/icons/` if missing.

## Deploy
- Any static hosting over HTTPS works (e.g., GitHub Pages, Netlify, Nginx).
- GitHub Pages:
  - Settings → Pages → Build from branch.
  - Ensure the site root serves the `/temperature/` path.
  - Service worker is registered as `./sw.js` and must be served from the same `/temperature/` scope.

## Updates (PWA)
- Bump the cache name in `sw.js` (e.g., `temperature-v2`) and redeploy.
- Users will see a banner: “New version available — Reload”. Clicking it activates the new SW immediately and reloads on `controllerchange`.

## Storage & iOS Notes
- IndexedDB stores:
  - `config` → settings (mode, counts, jokers, target)
  - `save` → last game state (deck, discard, hands, current, scores, eliminated flags)
- iOS may evict storage when low on space. If that happens, the app still loads (app-shell precached), but the last save may be gone.

## Manual Test Checklist
- Install as PWA; airplane mode still works.
- Multi-drop same rank enforced; illegal combos show a toast.
- Reshuffle when Deck is empty preserves Discard top.
- Show only at start of turn; scoring matches rules.
- Room mode elimination at Target; next round deals only to active players.
- Update prompt appears after deployment with new cache version.
- Lighthouse: PWA ≥ 95, Performance ≥ 90, Best Practices ≥ 90, Accessibility ≥ 90.

## Accessibility
- Keyboard: ←/→ to move across cards, Space toggles selection; D → Drop→Deck; F → Drop→Discard; S → Show.
- Buttons ≥ 44×44px targets. Live regions for toasts and update prompts.

## License
MIT

