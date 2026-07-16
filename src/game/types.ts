export const STANDARD_SIZE = 10;

export type CellMark = 'empty' | 'safe' | 'dog';

export interface Position {
  row: number;
  col: number;
}

export interface Puzzle {
  size: number;
  /** dogs[row][col] === true means a dog occupies that cell */
  dogs: boolean[][];
  /** regions[row][col] === region index (0..size-1) */
  regions: number[][];
}
