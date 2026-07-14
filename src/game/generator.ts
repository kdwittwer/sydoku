import { DOG_COUNT, GRID_SIZE, type Position, type Puzzle } from './types';
import { solveLogically } from './solver';

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Places one dog per row/column such that no two dogs touch, including
 * diagonally. Since dogs occupy distinct rows, only consecutive rows can
 * ever be adjacent, so backtracking only needs to check the previous row's
 * column choice.
 */
function generateDogPositions(): number[] {
  const columns: number[] = new Array(GRID_SIZE).fill(-1);

  function backtrack(row: number, usedCols: Set<number>): boolean {
    if (row === GRID_SIZE) return true;
    const prevCol = row > 0 ? columns[row - 1] : null;
    const candidates = shuffled(
      Array.from({ length: GRID_SIZE }, (_, c) => c).filter((c) => !usedCols.has(c))
    );
    for (const col of candidates) {
      if (prevCol !== null && Math.abs(col - prevCol) < 2) continue;
      columns[row] = col;
      usedCols.add(col);
      if (backtrack(row + 1, usedCols)) return true;
      usedCols.delete(col);
      columns[row] = -1;
    }
    return false;
  }

  const ok = backtrack(0, new Set());
  if (!ok) {
    // Astronomically unlikely for a 10x10 grid, but retry fresh if it happens.
    return generateDogPositions();
  }
  return columns;
}

const ORTHOGONAL_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Every valid dog placement (row/column-distinct, no touching) with the
 * region constraint ignored entirely. This depends only on GRID_SIZE, so
 * it's computed once and memoized — recomputing it per puzzle would dwarf
 * everything else in generatePuzzle.
 */
let cachedPlacements: number[][] | null = null;
function allValidPlacements(): number[][] {
  if (cachedPlacements) return cachedPlacements;

  const results: number[][] = [];
  const usedCols = new Array(GRID_SIZE).fill(false);
  const placedInRow = new Array(GRID_SIZE).fill(-1);

  function backtrack(row: number) {
    if (row === GRID_SIZE) {
      results.push([...placedInRow]);
      return;
    }
    for (let col = 0; col < GRID_SIZE; col++) {
      if (usedCols[col]) continue;
      if (row > 0 && Math.abs(placedInRow[row - 1] - col) < 2) continue;
      usedCols[col] = true;
      placedInRow[row] = col;
      backtrack(row + 1);
      usedCols[col] = false;
    }
  }
  backtrack(0);

  cachedPlacements = results;
  return results;
}

/**
 * Grows DOG_COUNT connected regions outward from each dog cell. At every
 * step, among all cells bordering an existing region, it assigns whichever
 * (cell, region) pairing invalidates the most competing placements — every
 * valid row/column/no-touch placement other than the true solution that
 * could still end up with exactly one dog per region.
 *
 * A pairing invalidates a competing placement P' as soon as two of P''s
 * dogs share a region, which can only ever become true as more cells are
 * assigned (never false again), and the true solution's own 10 dog cells
 * are already claimed as seeds before growth starts, so it's never at risk.
 * That means growth only ever narrows the field of alternative solutions,
 * and by the time the grid is fully partitioned, almost every puzzle has
 * exactly one valid solution left. generatePuzzle() verifies this (and
 * that it's reachable by pure deduction) and retries on the rare puzzle
 * that isn't.
 */
function buildGreedyRegions(dogCols: number[], maxRegionSize: number): number[][] {
  const regions: number[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(-1)
  );
  dogCols.forEach((col, row) => {
    regions[row][col] = row;
  });
  const regionSize = new Array(DOG_COUNT).fill(1);

  const buildIndexLists: number[][][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => [] as number[])
  );
  const alternates: number[][] = [];
  for (const placement of allValidPlacements()) {
    let isTrueSolution = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (placement[r] !== dogCols[r]) {
        isTrueSolution = false;
        break;
      }
    }
    if (isTrueSolution) continue;
    const ai = alternates.length;
    alternates.push(placement);
    for (let r = 0; r < GRID_SIZE; r++) buildIndexLists[r][placement[r]].push(ai);
  }
  const buildIndex = buildIndexLists.map((row) => row.map((list) => Int32Array.from(list)));

  const alive = new Uint8Array(alternates.length).fill(1);
  const counts = new Uint8Array(alternates.length * DOG_COUNT);
  const bumpCount = (alternateIndex: number, region: number) => {
    const idx = alternateIndex * DOG_COUNT + region;
    counts[idx]++;
    if (counts[idx] >= 2) alive[alternateIndex] = 0;
  };

  dogCols.forEach((col, row) => {
    for (const alternateIndex of buildIndex[row][col]) bumpCount(alternateIndex, row);
  });

  // Frontier: unclaimed cell -> set of regions currently bordering it.
  const frontier = new Map<number, Set<number>>();
  const addFrontier = (row: number, col: number, region: number) => {
    for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && regions[r][c] === -1) {
        const key = r * GRID_SIZE + c;
        let set = frontier.get(key);
        if (!set) {
          set = new Set();
          frontier.set(key, set);
        }
        set.add(region);
      }
    }
  };
  dogCols.forEach((col, row) => addFrontier(row, col, row));

  let remaining = GRID_SIZE * GRID_SIZE - DOG_COUNT;
  while (remaining > 0 && frontier.size > 0) {
    let bestKey = -1;
    let bestRegion = -1;
    let bestKills = -1;
    // Fallback choice ignoring the size cap, used only if every bordering
    // region for every frontier cell has already hit maxRegionSize.
    let anyKey = -1;
    let anyRegion = -1;
    for (const [key, regionSet] of frontier) {
      const r = Math.floor(key / GRID_SIZE);
      const c = key % GRID_SIZE;
      const cellAlternates = buildIndex[r][c];
      for (const region of regionSet) {
        if (anyKey === -1) {
          anyKey = key;
          anyRegion = region;
        }
        if (regionSize[region] >= maxRegionSize) continue;

        let kills = 0;
        for (let i = 0; i < cellAlternates.length; i++) {
          const alternateIndex = cellAlternates[i];
          if (alive[alternateIndex] && counts[alternateIndex * DOG_COUNT + region] >= 1) kills++;
        }
        if (kills > bestKills) {
          bestKills = kills;
          bestKey = key;
          bestRegion = region;
        }
      }
    }

    const chosenKey = bestKey === -1 ? anyKey : bestKey;
    const chosenRegion = bestKey === -1 ? anyRegion : bestRegion;
    const r = Math.floor(chosenKey / GRID_SIZE);
    const c = chosenKey % GRID_SIZE;
    regions[r][c] = chosenRegion;
    regionSize[chosenRegion]++;
    frontier.delete(chosenKey);
    remaining--;
    addFrontier(r, c, chosenRegion);
    for (const alternateIndex of buildIndex[r][c]) {
      if (alive[alternateIndex]) bumpCount(alternateIndex, chosenRegion);
    }
  }

  // Growth can't reach cells outside the connected frontier on a fully
  // connected grid, so this shouldn't fire — kept as a defensive fallback.
  let unclaimed: Position[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (regions[r][c] === -1) unclaimed.push({ row: r, col: c });
    }
  }
  let guard = 0;
  while (unclaimed.length > 0 && guard < 1000) {
    guard++;
    const next: Position[] = [];
    for (const { row, col } of unclaimed) {
      let assigned = false;
      for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && regions[r][c] !== -1) {
          regions[row][col] = regions[r][c];
          assigned = true;
          break;
        }
      }
      if (!assigned) next.push({ row, col });
    }
    unclaimed = next;
  }

  return regions;
}

function regionSizes(regions: number[][]): number[] {
  const sizes = new Array(DOG_COUNT).fill(0);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) sizes[regions[r][c]]++;
  }
  return sizes;
}

function isConnectedWithoutCell(
  regions: number[][],
  region: number,
  skipRow: number,
  skipCol: number
): boolean {
  const cells: Position[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (regions[r][c] === region && !(r === skipRow && c === skipCol)) cells.push({ row: r, col: c });
    }
  }
  if (cells.length === 0) return false;

  const key = (p: Position) => p.row * GRID_SIZE + p.col;
  const cellKeys = new Set(cells.map(key));
  const visited = new Set<number>([key(cells[0])]);
  const stack: Position[] = [cells[0]];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const k = nr * GRID_SIZE + nc;
      if (cellKeys.has(k) && !visited.has(k)) {
        visited.add(k);
        stack.push({ row: nr, col: nc });
      }
    }
  }
  return visited.size === cells.length;
}

const TARGET_REGION_SIZE = (GRID_SIZE * GRID_SIZE) / DOG_COUNT;

/**
 * Opportunistically evens out region sizes via boundary-cell swaps. Every
 * candidate swap is verified against the deduction solver before being
 * kept, so this can only improve balance — it never risks breaking
 * solvability or uniqueness. Runs until sizes are about as even as
 * possible or `deadline` (a performance.now() timestamp) passes.
 */
function rebalanceRegions(puzzle: Puzzle, deadline: number): void {
  const { regions, dogs } = puzzle;

  while (performance.now() < deadline) {
    const sizes = regionSizes(regions);
    if (Math.max(...sizes) - Math.min(...sizes) <= 1) return;

    const oversizedFirst = Array.from({ length: DOG_COUNT }, (_, i) => i).sort(
      (a, b) => sizes[b] - sizes[a]
    );

    let swapped = false;
    for (const region of oversizedFirst) {
      if (sizes[region] <= TARGET_REGION_SIZE) break; // rest are at or under target too

      const candidates: { cell: Position; targetRegion: number }[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (regions[r][c] !== region || dogs[r][c]) continue;
          let smallestNeighbor = -1;
          for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            const neighborRegion = regions[nr][nc];
            if (neighborRegion === region || sizes[neighborRegion] >= sizes[region]) continue;
            if (smallestNeighbor === -1 || sizes[neighborRegion] < sizes[smallestNeighbor]) {
              smallestNeighbor = neighborRegion;
            }
          }
          if (smallestNeighbor !== -1) candidates.push({ cell: { row: r, col: c }, targetRegion: smallestNeighbor });
        }
      }

      for (const { cell, targetRegion } of shuffled(candidates)) {
        if (performance.now() >= deadline) return;
        if (!isConnectedWithoutCell(regions, region, cell.row, cell.col)) continue;

        const previousRegion = regions[cell.row][cell.col];
        regions[cell.row][cell.col] = targetRegion;
        if (solveLogically(puzzle).solved) {
          swapped = true;
          break;
        }
        regions[cell.row][cell.col] = previousRegion;
      }

      if (swapped) break;
    }

    if (!swapped) return; // no safe improving swap available right now
  }
}

// A size cap keeps regions from growing wildly uneven — without it, the
// construction happily lets one region eat 40-60 cells because interior
// cells rarely help distinguish the true solution from alternatives. The
// cap trades away some of that unconstrained kill-maximizing power, so
// finding a fully logic-solvable puzzle under it takes more attempts on
// average; the generation budget below accounts for that.
const CAPPED_MAX_REGION_SIZE = 3 * TARGET_REGION_SIZE;
const FALLBACK_MAX_REGION_SIZE = GRID_SIZE * GRID_SIZE; // effectively uncapped

// Kept separate (rather than one shared deadline) because rebalancing
// always finds *some* further marginal improvement to try and would
// otherwise happily spend an entire shared budget on diminishing returns,
// making every generation slow instead of only the rare unlucky one.
const GENERATION_BUDGET_MS = 8000;
const REBALANCE_BUDGET_MS = 1500;

export function generatePuzzle(): Puzzle {
  const generationDeadline = performance.now() + GENERATION_BUDGET_MS;

  let puzzle: Puzzle | null = null;
  while (performance.now() < generationDeadline) {
    // If capped attempts haven't succeeded with most of the budget spent,
    // fall back to the uncapped construction (much higher single-attempt
    // success rate) so generation reliably finishes within the budget,
    // even if that rare puzzle ends up less evenly sectioned.
    const timeLeft = generationDeadline - performance.now();
    const maxRegionSize =
      timeLeft < GENERATION_BUDGET_MS * 0.2 ? FALLBACK_MAX_REGION_SIZE : CAPPED_MAX_REGION_SIZE;

    const dogCols = generateDogPositions();
    const dogs: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
      new Array(GRID_SIZE).fill(false)
    );
    dogCols.forEach((col, row) => {
      dogs[row][col] = true;
    });

    const regions = buildGreedyRegions(dogCols, maxRegionSize);
    const candidate: Puzzle = { size: GRID_SIZE, dogs, regions };

    if (solveLogically(candidate).solved) {
      puzzle = candidate;
      break;
    }
  }

  if (!puzzle) {
    throw new Error('Failed to generate a logically solvable Sydoku puzzle within the time budget');
  }

  rebalanceRegions(puzzle, performance.now() + REBALANCE_BUDGET_MS);
  return puzzle;
}
