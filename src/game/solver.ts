import { DOG_COUNT, GRID_SIZE, type Puzzle } from './types';

type CellState = 'unknown' | 'eliminated' | 'confirmed';
type Coord = [number, number];

export interface SolveResult {
  solved: boolean;
  solution: boolean[][];
}

const NEIGHBOR_OFFSETS: Coord[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/**
 * Attempts to fully determine dog placement using only sound logical
 * deduction rules (naked singles + row/column/region line reduction) —
 * never branches or guesses. Only reads puzzle.regions, the same
 * information a player has; puzzle.dogs is never consulted.
 *
 * Every rule here only eliminates a cell when no valid solution could place
 * a dog there, so reaching a full solve (confirmedCount === DOG_COUNT) also
 * proves the solution is unique: genuine ambiguity would leave at least one
 * row/column/region with more than one live candidate forever.
 */
export function solveLogically(puzzle: Puzzle): SolveResult {
  const state: CellState[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill('unknown')
  );
  const rowConfirmed = new Array(GRID_SIZE).fill(false);
  const colConfirmed = new Array(GRID_SIZE).fill(false);
  const regionConfirmed = new Array(DOG_COUNT).fill(false);

  const rowCells: Coord[][] = Array.from({ length: GRID_SIZE }, () => []);
  const colCells: Coord[][] = Array.from({ length: GRID_SIZE }, () => []);
  const regionCells: Coord[][] = Array.from({ length: DOG_COUNT }, () => []);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      rowCells[r].push([r, c]);
      colCells[c].push([r, c]);
      regionCells[puzzle.regions[r][c]].push([r, c]);
    }
  }

  const eliminate = (r: number, c: number) => {
    if (state[r][c] === 'unknown') state[r][c] = 'eliminated';
  };

  let confirmedCount = 0;
  const confirm = (r: number, c: number) => {
    if (state[r][c] === 'confirmed') return;
    state[r][c] = 'confirmed';
    confirmedCount++;
    rowConfirmed[r] = true;
    colConfirmed[c] = true;
    regionConfirmed[puzzle.regions[r][c]] = true;
    for (const [cr, cc] of rowCells[r]) if (cc !== c) eliminate(cr, cc);
    for (const [cr, cc] of colCells[c]) if (cr !== r) eliminate(cr, cc);
    for (const [cr, cc] of regionCells[puzzle.regions[r][c]]) {
      if (cr !== r || cc !== c) eliminate(cr, cc);
    }
    for (const [dr, dc] of NEIGHBOR_OFFSETS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) eliminate(nr, nc);
    }
  };

  const unknownsOf = (cells: Coord[]) => cells.filter(([r, c]) => state[r][c] === 'unknown');

  let changed = true;
  while (changed) {
    changed = false;

    // Naked singles: a row/column/region with exactly one live candidate must hold the dog.
    for (let r = 0; r < GRID_SIZE; r++) {
      if (rowConfirmed[r]) continue;
      const unknowns = unknownsOf(rowCells[r]);
      if (unknowns.length === 1) {
        confirm(unknowns[0][0], unknowns[0][1]);
        changed = true;
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      if (colConfirmed[c]) continue;
      const unknowns = unknownsOf(colCells[c]);
      if (unknowns.length === 1) {
        confirm(unknowns[0][0], unknowns[0][1]);
        changed = true;
      }
    }
    for (let region = 0; region < DOG_COUNT; region++) {
      if (regionConfirmed[region]) continue;
      const unknowns = unknownsOf(regionCells[region]);
      if (unknowns.length === 1) {
        confirm(unknowns[0][0], unknowns[0][1]);
        changed = true;
      }
    }
    if (changed) continue; // re-check naked singles before trying line reduction

    // Region confined to a single row/column -> that row/column's dog is this
    // region's dog, so no other region may use it.
    for (let region = 0; region < DOG_COUNT; region++) {
      if (regionConfirmed[region]) continue;
      const unknowns = unknownsOf(regionCells[region]);
      if (unknowns.length === 0) continue;

      const rows = new Set(unknowns.map(([r]) => r));
      if (rows.size === 1) {
        const [onlyRow] = rows;
        for (const [r, c] of rowCells[onlyRow]) {
          if (puzzle.regions[r][c] !== region && state[r][c] === 'unknown') {
            eliminate(r, c);
            changed = true;
          }
        }
      }
      const cols = new Set(unknowns.map(([, c]) => c));
      if (cols.size === 1) {
        const [onlyCol] = cols;
        for (const [r, c] of colCells[onlyCol]) {
          if (puzzle.regions[r][c] !== region && state[r][c] === 'unknown') {
            eliminate(r, c);
            changed = true;
          }
        }
      }
    }

    // Row/column confined to a single region -> symmetric reduction the other way.
    for (let r = 0; r < GRID_SIZE; r++) {
      if (rowConfirmed[r]) continue;
      const unknowns = unknownsOf(rowCells[r]);
      if (unknowns.length === 0) continue;
      const regions = new Set(unknowns.map(([, c]) => puzzle.regions[r][c]));
      if (regions.size === 1) {
        const [onlyRegion] = regions;
        for (const [cr, cc] of regionCells[onlyRegion]) {
          if (cr !== r && state[cr][cc] === 'unknown') {
            eliminate(cr, cc);
            changed = true;
          }
        }
      }
    }
    for (let c = 0; c < GRID_SIZE; c++) {
      if (colConfirmed[c]) continue;
      const unknowns = unknownsOf(colCells[c]);
      if (unknowns.length === 0) continue;
      const regions = new Set(unknowns.map(([r]) => puzzle.regions[r][c]));
      if (regions.size === 1) {
        const [onlyRegion] = regions;
        for (const [cr, cc] of regionCells[onlyRegion]) {
          if (cc !== c && state[cr][cc] === 'unknown') {
            eliminate(cr, cc);
            changed = true;
          }
        }
      }
    }
  }

  const solution: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(false)
  );
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      solution[r][c] = state[r][c] === 'confirmed';
    }
  }

  return { solved: confirmedCount === DOG_COUNT, solution };
}
