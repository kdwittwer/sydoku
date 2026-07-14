import { GRID_SIZE, type CellMark, type Puzzle } from '../game/types';
import Cell from './Cell';

const REGION_COLORS = [
  '#f2a6a6',
  '#f4c68b',
  '#f2e08b',
  '#c3e08b',
  '#8fd6a6',
  '#8fd6cf',
  '#8fc3e8',
  '#a6a6f2',
  '#d69ae0',
  '#e8a6c3',
];

const BORDER_THIN = '1px solid rgba(0, 0, 0, 0.12)';
const BORDER_THICK = '3px solid rgba(0, 0, 0, 0.65)';

interface GridProps {
  puzzle: Puzzle;
  marks: CellMark[][];
  conflicts: boolean[][];
  disabled: boolean;
  onToggleSafe: (row: number, col: number) => void;
  onToggleDog: (row: number, col: number) => void;
}

function borderStyleFor(puzzle: Puzzle, row: number, col: number): React.CSSProperties {
  const region = puzzle.regions[row][col];
  const top = row === 0 || puzzle.regions[row - 1][col] !== region ? BORDER_THICK : BORDER_THIN;
  const left = col === 0 || puzzle.regions[row][col - 1] !== region ? BORDER_THICK : BORDER_THIN;
  const bottom =
    row === GRID_SIZE - 1 || puzzle.regions[row + 1][col] !== region ? BORDER_THICK : BORDER_THIN;
  const right =
    col === GRID_SIZE - 1 || puzzle.regions[row][col + 1] !== region ? BORDER_THICK : BORDER_THIN;
  return { borderTop: top, borderLeft: left, borderBottom: bottom, borderRight: right };
}

export default function Grid({
  puzzle,
  marks,
  conflicts,
  disabled,
  onToggleSafe,
  onToggleDog,
}: GridProps) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
      }}
    >
      {marks.map((rowMarks, row) =>
        rowMarks.map((mark, col) => (
          <Cell
            key={`${row}-${col}`}
            mark={mark}
            regionColor={REGION_COLORS[puzzle.regions[row][col]]}
            conflict={conflicts[row][col]}
            borderStyle={borderStyleFor(puzzle, row, col)}
            disabled={disabled}
            onToggleSafe={() => onToggleSafe(row, col)}
            onToggleDog={() => onToggleDog(row, col)}
          />
        ))
      )}
    </div>
  );
}
