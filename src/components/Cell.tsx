import type { CellMark } from '../game/types';

interface CellProps {
  row: number;
  col: number;
  mark: CellMark;
  dogImage: string | null;
  regionColor: string;
  wrong: boolean;
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
  wrong,
  borderStyle,
  disabled,
  onPointerDownCell,
  onClickCell,
  onDoubleClickCell,
}: CellProps) {
  const label = wrong
    ? 'Wrong — no dog here'
    : mark === 'dog'
      ? 'Marked as dog'
      : mark === 'safe'
        ? 'Marked as safe'
        : 'Unmarked';

  return (
    // A real tap needs to land on the invisible switch below for iOS's native
    // haptic tick to fire (see cell__haptic-switch) — that switch has to be a
    // sibling of the button, not nested inside it (a <button> can't contain
    // another interactive control), so the interaction handlers live here on
    // the shared wrapper instead of on the button itself. Native click events
    // — from a real tap on either child, or a keyboard Enter/Space on the
    // focused button — bubble up to this wrapper either way, so moving the
    // handlers here doesn't change behavior; it just stops the button from
    // also firing its own (which would double-invoke every interaction).
    <div
      className="cell-wrap"
      data-row={row}
      data-col={col}
      onPointerDown={(e) => {
        if (!disabled && e.button === 0) onPointerDownCell(row, col);
      }}
      onClick={() => {
        if (!disabled) onClickCell(row, col);
      }}
      onDoubleClick={() => {
        if (!disabled) onDoubleClickCell(row, col);
      }}
    >
      <button
        type="button"
        className={`cell${wrong ? ' cell--wrong' : ''}`}
        style={{ backgroundColor: regionColor, ...borderStyle }}
        disabled={disabled}
        aria-label={label}
      >
        {mark === 'dog' && dogImage && <img className="cell__dog-image" src={dogImage} alt="" />}
        {mark === 'dog' && !dogImage && <span className="cell__icon">🐶</span>}
        {mark === 'safe' && <span className="cell__safe" aria-hidden="true" />}
      </button>
      {!disabled && (
        // Real native switch control (Safari 17.4+ `switch` attribute) that a
        // genuine touch toggles, which iOS plays a Taptic Engine tick for —
        // the same mechanism a real Settings-app toggle uses. This only
        // works for an actual finger contact, not a JS-simulated one (Apple
        // closed that loophole in iOS 26.5), which is exactly why this has
        // to be a real, on-screen (if invisible) hit target instead of
        // something triggered from the click handlers above. Unrelated to
        // and inert on every other platform — Android's buzz comes from
        // navigator.vibrate() in haptics.ts instead.
        <input
          type="checkbox"
          // @ts-expect-error non-standard WebKit attribute, no React/DOM typing for it
          switch=""
          className="cell__haptic-switch"
          tabIndex={-1}
          aria-hidden="true"
          // Left uncontrolled and toggling freely — its checked state is
          // meaningless to us, only the native toggle side-effect matters.
          onChange={() => {}}
        />
      )}
    </div>
  );
}
