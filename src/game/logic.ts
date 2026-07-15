import type { CellMark, Puzzle } from './types';

export function createEmptyMarks(size: number): CellMark[][] {
  return Array.from({ length: size }, () => new Array(size).fill('empty'));
}

export function createEmptyDogImages(size: number): (string | null)[][] {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

export function isWon(puzzle: Puzzle, marks: CellMark[][]): boolean {
  let dogMarkCount = 0;
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const marked = marks[r][c] === 'dog';
      if (marked) dogMarkCount++;
      if (marked !== puzzle.dogs[r][c]) return false;
    }
  }
  return dogMarkCount === puzzle.size;
}
