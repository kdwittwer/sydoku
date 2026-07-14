import { DOG_COUNT, GRID_SIZE, type CellMark, type Puzzle } from './types';

export function createEmptyMarks(): CellMark[][] {
  return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill('empty'));
}

/** Returns a grid of booleans flagging every marked-dog cell that violates a placement rule. */
export function findConflicts(puzzle: Puzzle, marks: CellMark[][]): boolean[][] {
  const conflicts: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(false)
  );

  const dogCells: { row: number; col: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (marks[r][c] === 'dog') dogCells.push({ row: r, col: c });
    }
  }

  for (let i = 0; i < dogCells.length; i++) {
    for (let j = i + 1; j < dogCells.length; j++) {
      const a = dogCells[i];
      const b = dogCells[j];
      const sameRow = a.row === b.row;
      const sameCol = a.col === b.col;
      const touching = Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
      const sameRegion = puzzle.regions[a.row][a.col] === puzzle.regions[b.row][b.col];
      if (sameRow || sameCol || touching || sameRegion) {
        conflicts[a.row][a.col] = true;
        conflicts[b.row][b.col] = true;
      }
    }
  }

  return conflicts;
}

export function isWon(puzzle: Puzzle, marks: CellMark[][]): boolean {
  let dogMarkCount = 0;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const marked = marks[r][c] === 'dog';
      if (marked) dogMarkCount++;
      if (marked !== puzzle.dogs[r][c]) return false;
    }
  }
  return dogMarkCount === DOG_COUNT;
}
