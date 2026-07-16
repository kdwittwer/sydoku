import { STANDARD_SIZE, type Position, type Puzzle } from './types';
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
function generateDogPositions(size: number): number[] {
  const columns: number[] = new Array(size).fill(-1);

  function backtrack(row: number, usedCols: Set<number>): boolean {
    if (row === size) return true;
    const prevCol = row > 0 ? columns[row - 1] : null;
    const candidates = shuffled(
      Array.from({ length: size }, (_, c) => c).filter((c) => !usedCols.has(c))
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
    // Astronomically unlikely for any reasonable grid size, but retry fresh if it happens.
    return generateDogPositions(size);
  }
  return columns;
}

const ORTHOGONAL_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ---------------------------------------------------------------------------
// Provably unique and logic-solvable, via full enumeration of every valid
// dog placement. This is what makes uniqueness achievable at all (see
// buildGreedyRegions), but the enumeration itself is only tractable at this
// grid size — it already reaches ~64 million placements at size 12, and
// grows roughly ~130x for every +2 after that.
// ---------------------------------------------------------------------------

const allValidPlacementsCache = new Map<number, number[][]>();
function allValidPlacements(size: number): number[][] {
  const cached = allValidPlacementsCache.get(size);
  if (cached) return cached;

  const results: number[][] = [];
  const usedCols = new Array(size).fill(false);
  const placedInRow = new Array(size).fill(-1);

  function backtrack(row: number) {
    if (row === size) {
      results.push([...placedInRow]);
      return;
    }
    for (let col = 0; col < size; col++) {
      if (usedCols[col]) continue;
      if (row > 0 && Math.abs(placedInRow[row - 1] - col) < 2) continue;
      usedCols[col] = true;
      placedInRow[row] = col;
      backtrack(row + 1);
      usedCols[col] = false;
    }
  }
  backtrack(0);

  allValidPlacementsCache.set(size, results);
  return results;
}

/**
 * Grows `size` connected regions outward from each dog cell. At every step,
 * among all cells bordering an existing region, it assigns whichever (cell,
 * region) pairing invalidates the most competing placements — every valid
 * row/column/no-touch placement other than the true solution that could
 * still end up with exactly one dog per region.
 *
 * A pairing invalidates a competing placement P' as soon as two of P''s
 * dogs share a region, which can only ever become true as more cells are
 * assigned (never false again), and the true solution's own dog cells are
 * already claimed as seeds before growth starts, so it's never at risk.
 * That means growth only ever narrows the field of alternative solutions,
 * and by the time the grid is fully partitioned, almost every puzzle has
 * exactly one valid solution left. generateStandardPuzzle() verifies this
 * (and that it's reachable by pure deduction) and retries on the rare
 * puzzle that isn't.
 */
function buildGreedyRegions(size: number, dogCols: number[], maxRegionSize: number): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  dogCols.forEach((col, row) => {
    regions[row][col] = row;
  });
  const regionSize = new Array(size).fill(1);

  const buildIndexLists: number[][][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );
  const alternates: number[][] = [];
  for (const placement of allValidPlacements(size)) {
    let isTrueSolution = true;
    for (let r = 0; r < size; r++) {
      if (placement[r] !== dogCols[r]) {
        isTrueSolution = false;
        break;
      }
    }
    if (isTrueSolution) continue;
    const ai = alternates.length;
    alternates.push(placement);
    for (let r = 0; r < size; r++) buildIndexLists[r][placement[r]].push(ai);
  }
  const buildIndex = buildIndexLists.map((row) => row.map((list) => Int32Array.from(list)));

  const alive = new Uint8Array(alternates.length).fill(1);
  const counts = new Uint8Array(alternates.length * size);
  const bumpCount = (alternateIndex: number, region: number) => {
    const idx = alternateIndex * size + region;
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
      if (r >= 0 && r < size && c >= 0 && c < size && regions[r][c] === -1) {
        const key = r * size + c;
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

  let remaining = size * size - size;
  while (remaining > 0 && frontier.size > 0) {
    let bestKey = -1;
    let bestRegion = -1;
    let bestKills = -1;
    // Fallback choice ignoring the size cap, used only if every bordering
    // region for every frontier cell has already hit maxRegionSize.
    let anyKey = -1;
    let anyRegion = -1;
    for (const [key, regionSet] of frontier) {
      const r = Math.floor(key / size);
      const c = key % size;
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
          if (alive[alternateIndex] && counts[alternateIndex * size + region] >= 1) kills++;
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
    const r = Math.floor(chosenKey / size);
    const c = chosenKey % size;
    regions[r][c] = chosenRegion;
    regionSize[chosenRegion]++;
    frontier.delete(chosenKey);
    remaining--;
    addFrontier(r, c, chosenRegion);
    for (const alternateIndex of buildIndex[r][c]) {
      if (alive[alternateIndex]) bumpCount(alternateIndex, chosenRegion);
    }
  }

  fillUnclaimed(size, regions);
  return regions;
}

/**
 * Assigns any still-unclaimed cells to a bordering region. This is a rare
 * defensive fallback — growth should always claim every cell — but prefers
 * each unclaimed cell's *smallest* bordering region rather than just the
 * first one found, to avoid one region snowballing through the leftover
 * area.
 */
function fillUnclaimed(size: number, regions: number[][]): void {
  const sizes = regionSizes(size, regions);
  let unclaimed: Position[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === -1) unclaimed.push({ row: r, col: c });
    }
  }
  let guard = 0;
  while (unclaimed.length > 0 && guard < 1000) {
    guard++;
    const next: Position[] = [];
    for (const { row, col } of shuffled(unclaimed)) {
      let smallestNeighbor = -1;
      for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size || regions[r][c] === -1) continue;
        const neighborRegion = regions[r][c];
        if (smallestNeighbor === -1 || sizes[neighborRegion] < sizes[smallestNeighbor]) {
          smallestNeighbor = neighborRegion;
        }
      }
      if (smallestNeighbor !== -1) {
        regions[row][col] = smallestNeighbor;
        sizes[smallestNeighbor]++;
      } else {
        next.push({ row, col });
      }
    }
    unclaimed = next;
  }
}

function regionSizes(size: number, regions: number[][]): number[] {
  const sizes = new Array(size).fill(0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) sizes[regions[r][c]]++;
  }
  return sizes;
}

function isConnectedWithoutCell(
  size: number,
  regions: number[][],
  region: number,
  skipRow: number,
  skipCol: number
): boolean {
  const cells: Position[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === region && !(r === skipRow && c === skipCol)) cells.push({ row: r, col: c });
    }
  }
  if (cells.length === 0) return false;

  const key = (p: Position) => p.row * size + p.col;
  const cellKeys = new Set(cells.map(key));
  const visited = new Set<number>([key(cells[0])]);
  const stack: Position[] = [cells[0]];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const k = nr * size + nc;
      if (cellKeys.has(k) && !visited.has(k)) {
        visited.add(k);
        stack.push({ row: nr, col: nc });
      }
    }
  }
  return visited.size === cells.length;
}

/**
 * Opportunistically evens out region sizes via boundary-cell swaps. Every
 * candidate swap is verified against the deduction solver before being
 * kept, so this can only improve balance — it never risks breaking
 * solvability or uniqueness. Runs until sizes are about as even as
 * possible or `deadline` (a performance.now() timestamp) passes.
 */
function rebalanceRegions(puzzle: Puzzle, deadline: number): void {
  const { regions, dogs, size } = puzzle;
  const targetRegionSize = (size * size) / size;

  while (performance.now() < deadline) {
    const sizes = regionSizes(size, regions);
    if (Math.max(...sizes) - Math.min(...sizes) <= 1) return;

    const oversizedFirst = Array.from({ length: size }, (_, i) => i).sort(
      (a, b) => sizes[b] - sizes[a]
    );

    let swapped = false;
    for (const region of oversizedFirst) {
      if (sizes[region] <= targetRegionSize) break; // rest are at or under target too

      const candidates: { cell: Position; targetRegion: number }[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (regions[r][c] !== region || dogs[r][c]) continue;
          let smallestNeighbor = -1;
          for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
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
        if (!isConnectedWithoutCell(size, regions, region, cell.row, cell.col)) continue;

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
// construction happily lets one region eat far more than its share because
// interior cells rarely help distinguish the true solution from
// alternatives. The cap trades away some of that unconstrained
// kill-maximizing power, so finding a fully logic-solvable puzzle under it
// takes more attempts on average; the generation budget below accounts for
// that.
const CAPPED_REGION_SIZE_MULTIPLIER = 3;
const GENERATION_BUDGET_MS = 8000;
const REBALANCE_BUDGET_MS = 1500;

function generateStandardPuzzle(): Puzzle {
  const size = STANDARD_SIZE;
  const targetRegionSize = (size * size) / size;
  const cappedMaxRegionSize = CAPPED_REGION_SIZE_MULTIPLIER * targetRegionSize;
  const fallbackMaxRegionSize = size * size; // effectively uncapped

  const generationDeadline = performance.now() + GENERATION_BUDGET_MS;

  let puzzle: Puzzle | null = null;
  while (performance.now() < generationDeadline) {
    // If capped attempts haven't succeeded with most of the budget spent,
    // fall back to the uncapped construction (much higher single-attempt
    // success rate) so generation reliably finishes within the budget,
    // even if that rare puzzle ends up less evenly sectioned.
    const timeLeft = generationDeadline - performance.now();
    const maxRegionSize =
      timeLeft < GENERATION_BUDGET_MS * 0.2 ? fallbackMaxRegionSize : cappedMaxRegionSize;

    const dogCols = generateDogPositions(size);
    const dogs: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    dogCols.forEach((col, row) => {
      dogs[row][col] = true;
    });

    const regions = buildGreedyRegions(size, dogCols, maxRegionSize);
    const candidate: Puzzle = { size, dogs, regions };

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

export function generatePuzzle(): Puzzle {
  return generateStandardPuzzle();
}

// Shared worker <-> main-thread message shapes. Defined here (rather than
// in generator.worker.ts) so generatorClient.ts — part of the main app's
// DOM-lib tsconfig project, which excludes the WebWorker-lib worker file
// entirely — can import them without reaching across that project
// boundary; generator.ts itself compiles cleanly under both.
export interface GenerateRequest {
  requestId: number;
}

export interface GenerateResponse {
  requestId: number;
  puzzle: Puzzle;
}
