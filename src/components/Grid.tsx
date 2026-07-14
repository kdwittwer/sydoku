import { useCallback, useEffect, useRef } from 'react';
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
const CLICK_DELAY_MS = 220;

interface GridProps {
  puzzle: Puzzle;
  marks: CellMark[][];
  dogImages: (string | null)[][];
  conflicts: boolean[][];
  incorrect: boolean[][];
  disabled: boolean;
  onToggleSafe: (row: number, col: number) => void;
  onToggleDog: (row: number, col: number) => void;
  onSetMark: (row: number, col: number, mark: CellMark) => void;
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

function cellKey(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

interface DragState {
  paintMark: CellMark;
  visited: Set<number>;
  isDragging: boolean;
}

/**
 * Click-and-drag mass marking: pressing on a cell and dragging across
 * others paints every cell it crosses with the same mark, so a swath can be
 * cleared (or X'd out) in one gesture instead of many individual clicks.
 * The paint value is decided by the starting cell (empty -> paints safe,
 * safe -> paints empty) and dog cells are never touched by a drag.
 *
 * This has to live above Cell because detecting "did the pointer leave this
 * cell" requires tracking pointer position across the whole grid, not just
 * one cell's own events. A plain click (no movement) still falls through to
 * the existing debounced single/double-click behavior — the debounce lets a
 * following double-click cancel it before it fires, so double-clicking
 * never visibly flickers to "safe" before landing on "dog".
 */
export default function Grid({
  puzzle,
  marks,
  dogImages,
  conflicts,
  incorrect,
  disabled,
  onToggleSafe,
  onToggleDog,
  onSetMark,
}: GridProps) {
  const dragStateRef = useRef<DragState | null>(null);
  const pendingClickRef = useRef<{ row: number; col: number } | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  // The one cell whose next click should be swallowed because a drag that
  // just ended there already applied the mark — NOT a global "a drag just
  // happened" flag, which would wrongly eat an unrelated later click (e.g.
  // a keyboard Enter on a different cell) if it fired before anything else
  // reset it.
  const suppressClickCellRef = useRef<{ row: number; col: number } | null>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const scheduleSingleClick = useCallback(
    (row: number, col: number) => {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = window.setTimeout(() => {
        onToggleSafe(row, col);
        clickTimerRef.current = null;
      }, CLICK_DELAY_MS);
    },
    [onToggleSafe]
  );

  const handlePointerDownCell = useCallback((row: number, col: number) => {
    suppressClickCellRef.current = null;
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    pendingClickRef.current = { row, col };

    const mark = marksRef.current[row][col];
    if (mark === 'dog') {
      dragStateRef.current = null; // dragging never starts from (or paints over) a dog cell
    } else {
      dragStateRef.current = {
        paintMark: mark === 'empty' ? 'safe' : 'empty',
        visited: new Set([cellKey(row, col)]),
        isDragging: false,
      };
    }
  }, []);

  const handleClickCell = useCallback(
    (row: number, col: number) => {
      const suppress = suppressClickCellRef.current;
      suppressClickCellRef.current = null; // one-shot, regardless of match
      if (suppress && suppress.row === row && suppress.col === col) {
        // A drag gesture that ended back on its starting cell still fires a
        // native click (mousedown/mouseup targeted the same element) — the
        // drag already applied the mark, so this click is a no-op.
        return;
      }
      scheduleSingleClick(row, col);
    },
    [scheduleSingleClick]
  );

  const handleDoubleClickCell = useCallback(
    (row: number, col: number) => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onToggleDog(row, col);
    },
    [onToggleDog]
  );

  useEffect(() => {
    function resolveCellFromPoint(clientX: number, clientY: number): { row: number; col: number } | null {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const target = el?.closest<HTMLElement>('[data-row]');
      if (!target) return null;
      const row = Number(target.dataset.row);
      const col = Number(target.dataset.col);
      if (Number.isNaN(row) || Number.isNaN(col)) return null;
      return { row, col };
    }

    function handlePointerMove(e: PointerEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const cell = resolveCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;

      const key = cellKey(cell.row, cell.col);
      if (drag.visited.has(key)) return;
      drag.visited.add(key);
      drag.isDragging = true;

      // First real movement confirms this is a drag, not a click — paint
      // the starting cell too, and stop the debounced click for it.
      if (pendingClickRef.current) {
        const { row: sr, col: sc } = pendingClickRef.current;
        const startMark = marksRef.current[sr][sc];
        if (startMark !== 'dog' && startMark !== drag.paintMark) {
          onSetMark(sr, sc, drag.paintMark);
        }
        pendingClickRef.current = null;
      }

      const mark = marksRef.current[cell.row][cell.col];
      if (mark !== 'dog' && mark !== drag.paintMark) {
        onSetMark(cell.row, cell.col, drag.paintMark);
      }
    }

    function handlePointerUp(e: PointerEvent) {
      const wasDragging = dragStateRef.current?.isDragging ?? false;
      dragStateRef.current = null;
      pendingClickRef.current = null;
      suppressClickCellRef.current = wasDragging ? resolveCellFromPoint(e.clientX, e.clientY) : null;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [onSetMark]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

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
            row={row}
            col={col}
            mark={mark}
            dogImage={dogImages[row][col]}
            regionColor={REGION_COLORS[puzzle.regions[row][col]]}
            conflict={conflicts[row][col]}
            incorrect={incorrect[row][col]}
            borderStyle={borderStyleFor(puzzle, row, col)}
            disabled={disabled}
            onPointerDownCell={handlePointerDownCell}
            onClickCell={handleClickCell}
            onDoubleClickCell={handleDoubleClickCell}
          />
        ))
      )}
    </div>
  );
}
