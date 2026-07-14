import { useEffect, useRef } from 'react';
import type { CellMark } from '../game/types';

const CLICK_DELAY_MS = 220;

interface CellProps {
  mark: CellMark;
  regionColor: string;
  conflict: boolean;
  borderStyle: React.CSSProperties;
  disabled: boolean;
  onToggleSafe: () => void;
  onToggleDog: () => void;
}

export default function Cell({
  mark,
  regionColor,
  conflict,
  borderStyle,
  disabled,
  onToggleSafe,
  onToggleDog,
}: CellProps) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (disabled || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      onToggleSafe();
      timerRef.current = null;
    }, CLICK_DELAY_MS);
  };

  const handleDoubleClick = () => {
    if (disabled) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onToggleDog();
  };

  return (
    <button
      type="button"
      className={`cell${conflict ? ' cell--conflict' : ''}`}
      style={{ backgroundColor: regionColor, ...borderStyle }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      disabled={disabled}
      aria-label={mark === 'dog' ? 'Marked as dog' : mark === 'safe' ? 'Marked as safe' : 'Unmarked'}
    >
      {mark === 'dog' && <span className="cell__icon">🐶</span>}
      {mark === 'safe' && <span className="cell__safe">✕</span>}
    </button>
  );
}
