export const GRID_SIZE = 10;
export const DOG_COUNT = 10;

export type CellMark = 'empty' | 'safe' | 'dog';

export interface Position {
  row: number;
  col: number;
}

export interface Puzzle {
  size: number;
  /** dogs[row][col] === true means a dog occupies that cell */
  dogs: boolean[][];
  /** regions[row][col] === region index (0..DOG_COUNT-1) */
  regions: number[][];
}

export interface GameState {
  puzzle: Puzzle;
  marks: CellMark[][];
  won: boolean;
}
