import { DOG_COUNT, GRID_SIZE, type CellMark, type Puzzle } from './types';

export function createEmptyMarks(): CellMark[][] {
  return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill('empty'));
}

export function createEmptyDogImages(): (string | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(null));
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
