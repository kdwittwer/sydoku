import type { CellMark } from '../game/types';

interface CellProps {
  row: number;
  col: number;
  mark: CellMark;
  dogImage: string | null;
  regionColor: string;
  conflict: boolean;
  borderStyle: React.CSSProperties;
  disabled: boolean;
  onPointerDownCell: (row: number, col: number) => void;
  onClickCell: (row: number, col: number) => void;
  onDoubleClickCell: (row: number, col: number) => void;
}

export default function Cell({
  row,
  col,
  mark,
  dogImage,
  regionColor,
  conflict,
  borderStyle,
  disabled,
  onPointerDownCell,
  onClickCell,
  onDoubleClickCell,
}: CellProps) {
  return (
    <button
      type="button"
      data-row={row}
      data-col={col}
      className={`cell${conflict ? ' cell--conflict' : ''}`}
      style={{ backgroundColor: regionColor, ...borderStyle }}
      onPointerDown={(e) => {
        if (e.button === 0) onPointerDownCell(row, col);
      }}
      onClick={() => onClickCell(row, col)}
      onDoubleClick={() => onDoubleClickCell(row, col)}
      disabled={disabled}
      aria-label={mark === 'dog' ? 'Marked as dog' : mark === 'safe' ? 'Marked as safe' : 'Unmarked'}
    >
      {mark === 'dog' && dogImage && <img className="cell__dog-image" src={dogImage} alt="" />}
      {mark === 'dog' && !dogImage && <span className="cell__icon">🐶</span>}
      {mark === 'safe' && <span className="cell__safe">✕</span>}
    </button>
  );
}
