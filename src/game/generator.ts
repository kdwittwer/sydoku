import { DOG_COUNT, GRID_SIZE, type Position, type Puzzle } from './types';

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
 * Grows DOG_COUNT connected regions outward from each dog cell (multi-source
 * random flood fill) until every cell on the grid belongs to exactly one
 * region.
 */
function generateRegions(dogCols: number[]): number[][] {
  const regions: number[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(-1)
  );
  const frontiers: Position[][] = Array.from({ length: DOG_COUNT }, () => []);

  const addNeighborsToFrontier = (row: number, col: number, region: number) => {
    for (const [dr, dc] of ORTHOGONAL_NEIGHBORS) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && regions[r][c] === -1) {
        frontiers[region].push({ row: r, col: c });
      }
    }
  };

  dogCols.forEach((col, row) => {
    regions[row][col] = row;
    addNeighborsToFrontier(row, col, row);
  });

  let remaining = GRID_SIZE * GRID_SIZE - DOG_COUNT;
  while (remaining > 0) {
    const activeRegions = Array.from({ length: DOG_COUNT }, (_, i) => i).filter(
      (i) => frontiers[i].length > 0
    );
    if (activeRegions.length === 0) {
      // Shouldn't happen on a fully connected grid, but guard against infinite loops.
      break;
    }

    // Pop a random cell from a random active region's frontier. A single pop
    // per iteration (rather than one-per-region-per-round) avoids stalling
    // out when every active region's pick happens to already be claimed.
    const region = activeRegions[Math.floor(Math.random() * activeRegions.length)];
    const frontier = frontiers[region];
    const idx = Math.floor(Math.random() * frontier.length);
    const { row, col } = frontier[idx];
    frontier.splice(idx, 1);
    if (regions[row][col] !== -1) continue; // claimed by another region already
    regions[row][col] = region;
    addNeighborsToFrontier(row, col, region);
    remaining--;
  }

  return regions;
}

export function generatePuzzle(): Puzzle {
  const dogCols = generateDogPositions();
  const dogs: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(false)
  );
  dogCols.forEach((col, row) => {
    dogs[row][col] = true;
  });

  const regions = generateRegions(dogCols);

  return { size: GRID_SIZE, dogs, regions };
}
