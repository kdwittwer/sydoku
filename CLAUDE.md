# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sydoku is a client-side puzzle game (Vite + React + TypeScript, no backend). Rules: find 10 hidden
dogs on a 10x10 grid — one per row, one per column, no two touching (including diagonally), and one
per colored "section" (region). Single-click marks a cell safe (✕), double-click flags it as a dog,
click-and-drag mass-paints a swath. Deployed as an installable PWA to GitHub Pages.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build — always run this (not just tsc) before considering work done
npm run lint      # oxlint
npm run preview   # serve the production build locally — required to test PWA/service-worker behavior,
                   # since the dev server does not register the service worker
```

There is no test suite. Verification for this project has consistently meant: `npx tsc -b`, `npm run
build`, driving the app in a real headless browser (Playwright via `chromium-cli` or a throwaway
script — see the `run` skill), and for puzzle-generation changes, a standalone `tsx` script that
generates many puzzles and checks invariants (see "Verifying generator/solver changes" below).

## Architecture

### Puzzle generation is the load-bearing piece (`src/game/`)

The three files `generator.ts`, `solver.ts`, and `logic.ts` are tightly coupled and the reason this
app isn't a simple "randomly place dogs and draw blobby regions" puzzle:

- **`solver.ts`** (`solveLogically`) is a deduction-only solver (naked singles + row/column↔region
  line reduction) that never guesses and never reads `puzzle.dogs` — only `puzzle.regions`, the same
  information a player has. If it fully resolves a puzzle, that also *proves the solution is unique*
  (sound elimination rules never discard a cell that's part of some valid solution, so ambiguity would
  leave a row/column/region with >1 live candidate forever).

- **`generator.ts`** (`generatePuzzle`) does not generate regions randomly and hope. It:
  1. Places 10 dogs via backtracking (`generateDogPositions`).
  2. Grows regions outward from each dog (`buildGreedyRegions`) by greedily choosing, at each step,
     the (cell, region) assignment that invalidates the most *other* valid row/column/no-touch
     placements — enumerated once via `allValidPlacements()` (~479k for a 10x10 grid) and memoized at
     module scope, since recomputing that per-puzzle would dominate generation cost. This can only
     narrow the solution space (the true solution's 10 cells are claimed as seeds before growth
     starts, so they're never at risk), which is what makes near-uniqueness achievable at all.
  3. Verifies the result with `solveLogically` and retries on the rare puzzle that isn't fully
     forceable — this is the actual uniqueness/solvability gate, not the greedy construction alone.
  4. Runs `rebalanceRegions`, which opportunistically swaps boundary cells from oversized to
     undersized regions, **re-verifying with `solveLogically` after every candidate swap** so it can
     only improve size balance, never break solvability.

  Unconstrained greedy growth lets one region eat 40-60 cells (interior cells rarely help distinguish
  the true solution). `CAPPED_MAX_REGION_SIZE` (3x target) bounds that during construction at the cost
  of a lower single-attempt success rate, so generation runs on a **time budget, not a fixed retry
  count**: `GENERATION_BUDGET_MS` (8s) for finding a solvable puzzle, falling back to an uncapped
  attempt in the last 20% of that budget to guarantee termination, then a separate
  `REBALANCE_BUDGET_MS` (1.5s) for polish. The two budgets are intentionally separate — rebalancing
  always finds *some* further marginal improvement to chase and would otherwise spend an entire shared
  budget on diminishing returns every single generation, not just the rare unlucky one.

  Typical generation is 1.5-3s; worst case is bounded by the two budgets combined (~9.5s).

- **`logic.ts`** is the live, per-move game logic used during play (as opposed to generation-time
  validation): `findConflicts` flags dog-marked cells that violate a placement rule *against each
  other* (row/col/touch/region — this doesn't need the solution), and `isWon` checks marks against
  `puzzle.dogs` exactly.

Don't conflate these three: `solveLogically` runs during generation only (module never touches game
UI state); `findConflicts`/`isWon` run during play and never do deduction.

### Verifying generator/solver changes

There's no committed test suite for this — verification has been done ad hoc with `tsx` (`npx --yes
tsx -e "..."`) scripts that call `generatePuzzle()` in a loop and check: every cell assigned a region,
each region has exactly one dog, one dog per row/col, no touching dogs, every region is
4-connected (BFS), and `solveLogically(puzzle).solved === true` with `solution` matching `puzzle.dogs`
exactly. Do this after touching `generator.ts` or `solver.ts` — this exact class of bug (a coordinate
hashing bug in `isConnectedWithoutCell` that let a swap silently disconnect a region) was only caught
by the connectivity check, not by TypeScript or a quick visual look.

### Interaction model lives in `Grid`, not `Cell` (`src/components/`)

`Cell.tsx` is presentation-only: it forwards raw `onPointerDown`/`onClick`/`onDoubleClick` events up
with no logic of its own. All click/double-click/drag interpretation is centralized in `Grid.tsx`
because detecting "did the pointer leave this cell" (for drag-painting) requires tracking pointer
position across the *whole* grid, not one cell's own events — see the doc comment at the top of
`Grid.tsx` for the full reasoning, including a documented gotcha: the drag-suppression flag that
swallows a spurious trailing click must be scoped to the *specific cell* the drag ended on, not a
global "a drag just happened" boolean, or it wrongly eats an unrelated later click (e.g. keyboard
Enter on a different cell).

A plain click is intentionally debounced (`CLICK_DELAY_MS`) so a following double-click can cancel it
before it fires — otherwise double-clicking would visibly flicker through "safe" before landing on
"dog".

### App-level state (`src/App.tsx`)

Four parallel `GRID_SIZE x GRID_SIZE` grids, all indexed by `[row][col]` and reset together on new
puzzle / win: `marks` (`CellMark[][]`), `dogImages` (which cutout photo a dog-marked cell shows, chosen
once when marked and kept stable — not re-randomized every render), `conflicts` and `incorrect`
(derived via `useMemo`, not stored). `incorrect` (from the "Check dogs" button) is a snapshot
comparison: `checkedSnapshot` freezes `marks` at click time, and a cell's flag persists only while it's
still 'dog' in *both* the snapshot and current `marks` — so editing a flagged cell clears its flag
immediately without needing to press the button again, without turning this into continuous live
validation of every dog placement.

### Dog photo pipeline (`scripts/`, `src/assets/dogs/`, `src/game/dogImages.ts`)

`src/assets/dogs/` holds source photos locally only (gitignored — see the "cutouts only should be
committed" note below); `src/assets/dogs/cutouts/` holds the committed transparent-background head
crops actually used at runtime. `scripts/generate_dog_cutouts.py` (Python, `rembg`/U2Net for real
background segmentation — plain edge detection doesn't work on cluttered real-photo backgrounds) is
the one-time preprocessing step; it skips files whose cutout is already newer, so it's safe to re-run
after dropping in new photos. Setup: `python3 -m venv .venv && source .venv/bin/activate && pip install
-r scripts/requirements.txt`.

`src/game/dogImages.ts` uses `import.meta.glob('../assets/dogs/cutouts/*.png', { eager: true })` to
pick up every cutout automatically at build time — adding a new cutout needs no code change, just a
rebuild. Falls back to a 🐶 emoji if the folder is ever empty.

**Source photos were scrubbed from git history** (`git-filter-repo`) once the repo was made public on
GitHub Pages, since they're personal photos and only the cutouts need to ship — `src/assets/dogs/*.png`
is gitignored (the `cutouts/` subfolder is not, since the pattern doesn't cross directories). Don't
re-add source photos to git.

### Deployment

GitHub Pages via `.github/workflows/deploy.yml`, auto-deploying on push to `main`. Because Pages
project sites serve from `/sydoku/` and not the domain root, `vite.config.ts` sets `base = '/sydoku/'`
and threads it into the PWA manifest's `start_url`/`scope` — if the repo is ever renamed or forked
under a different path, that constant is the one thing that needs to change. Live at
https://kdwittwer.github.io/sydoku/.

### PWA

`vite-plugin-pwa` generates the manifest and service worker; iOS Safari only partially honors the web
manifest, so `index.html` also carries explicit Apple meta tags
(`apple-mobile-web-app-capable`/`apple-touch-icon`/etc.) by hand. App icons live in `public/icons/`,
generated at the specific sizes each platform asks for (16/32 favicon, 180 apple-touch, 192/512
manifest, 512 maskable) — regenerate by rerunning the icon-drawing approach used originally (a small
PIL script drawing a paw print on the app's accent purple; not currently checked into the repo as a
script, so recreate it if the icon design needs to change).
