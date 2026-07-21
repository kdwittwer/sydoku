import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Grid from './components/Grid';
import WinCelebration from './components/WinCelebration';
import { DOG_PACKS, getActiveDogImages, pickRandomDogImage } from './game/dogImages';
import { requestPuzzle } from './game/generatorClient';
import { createEmptyDogImages, createEmptyMarks, isWon } from './game/logic';
import {
  loadDisabledDogPacks,
  loadHardMode,
  saveDisabledDogPacks,
  saveHardMode,
} from './game/settings';
import { applyLoss, applyWin, loadStats, saveStats, type Stats } from './game/stats';
import { STANDARD_SIZE, type CellMark, type Puzzle } from './game/types';

const NORMAL_MAX_MISTAKES = 3;
const HARD_MODE_MAX_MISTAKES = 1;
const WRONG_FLASH_MS = 500;

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<CellMark[][]>(() => createEmptyMarks(STANDARD_SIZE));
  const [dogImages, setDogImages] = useState<(string | null)[][]>(() =>
    createEmptyDogImages(STANDARD_SIZE)
  );
  const [isGenerating, setIsGenerating] = useState(true);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  // The one cell currently showing the brief "wrong" shake/flash — cleared
  // automatically a moment later. Wrong guesses are never written into
  // `marks`, so every 'dog' mark in `marks` is always correct by
  // construction; this is purely a transient visual, not game state.
  const [wrongCell, setWrongCell] = useState<{ row: number; col: number } | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [hardMode, setHardMode] = useState<boolean>(() => loadHardMode());
  const [disabledDogPacks, setDisabledDogPacks] = useState<Set<string>>(() =>
    loadDisabledDogPacks()
  );
  const [showDogPackMenu, setShowDogPackMenu] = useState(false);
  const dogPackDialogRef = useRef<HTMLDialogElement>(null);
  // Images already shown for a correct find this puzzle — pickRandomDogImage
  // avoids repeats against this set as long as an unused image remains, so
  // duplicates within a puzzle only happen when the active pool is smaller
  // than the puzzle's dog count and repeats become unavoidable.
  const [usedDogImages, setUsedDogImages] = useState<Set<string>>(new Set());

  const won = useMemo(() => (puzzle ? isWon(puzzle, marks) : false), [puzzle, marks]);
  const maxMistakes = hardMode ? HARD_MODE_MAX_MISTAKES : NORMAL_MAX_MISTAKES;
  const lost = mistakes >= maxMistakes;
  // Once a dog's been correctly found, hard mode can no longer be toggled —
  // otherwise a player could flip it off right before a risky guess. Marks
  // reset to empty on every new puzzle, so this naturally reappears then.
  const hardModeLocked = useMemo(() => marks.some((row) => row.includes('dog')), [marks]);
  // Which photo shows up for a correctly-found dog is purely cosmetic, so
  // (unlike hard mode) pack selection stays toggleable for the whole game,
  // not just before the first find.
  const activeDogImages = useMemo(
    () => getActiveDogImages(disabledDogPacks),
    [disabledDogPacks]
  );

  // Fires exactly once per game: `won`/`lost` only flip true -> false again
  // when loadPuzzle() resets marks/mistakes for the next puzzle, so this
  // never double-counts a single completion. Persisting is a separate
  // effect keyed on `stats` itself, so the win/loss transforms above stay
  // pure state updaters with no side effect buried inside them.
  useEffect(() => {
    if (won) setStats(applyWin);
  }, [won]);

  useEffect(() => {
    if (lost) setStats(applyLoss);
  }, [lost]);

  useEffect(() => {
    saveStats(stats);
  }, [stats]);

  useEffect(() => {
    saveHardMode(hardMode);
  }, [hardMode]);

  useEffect(() => {
    saveDisabledDogPacks(disabledDogPacks);
  }, [disabledDogPacks]);

  // <dialog> is opened/closed imperatively (showModal()/close()), not via a
  // prop, so this effect is what keeps it in sync with React state — both
  // for our own "Dog packs" button and for native dismissal (Esc, or the
  // backdrop click handled below), which fires the dialog's 'close' event
  // rather than going through our click handler.
  useEffect(() => {
    const dialog = dogPackDialogRef.current;
    if (!dialog) return;
    if (showDogPackMenu && !dialog.open) dialog.showModal();
    else if (!showDogPackMenu && dialog.open) dialog.close();
  }, [showDogPackMenu]);

  const loadPuzzle = useCallback(async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const next = await requestPuzzle();
      setPuzzle(next);
      setMarks(createEmptyMarks(next.size));
      setDogImages(createEmptyDogImages(next.size));
      setMistakes(0);
      setWrongCell(null);
      setUsedDogImages(new Set());
    } catch (err) {
      // Without this, a worker that fails to load or never responds (seen
      // on some Android browsers/WebViews) left the UI stuck showing
      // "Generating puzzle..." forever — the promise rejected, but nothing
      // ever caught it. The fallback message must never be an empty string:
      // browsers often withhold detail on a worker load failure (err.message
      // === ''), which is falsy and would be indistinguishable from "no
      // error" wherever this state is checked.
      setGenerationError(
        err instanceof Error && err.message ? err.message : 'Something went wrong generating the puzzle.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  const toggleSafe = useCallback((row: number, col: number) => {
    setMarks((prev) => {
      if (prev[row][col] === 'dog') return prev; // a correctly-placed dog is locked in
      const next = prev.map((r) => [...r]);
      next[row][col] = prev[row][col] === 'empty' ? 'safe' : 'empty';
      return next;
    });
  }, []);

  const attemptDog = useCallback(
    (row: number, col: number) => {
      if (!puzzle) return;
      if (marks[row][col] === 'dog') return; // already correct — can't be undone

      if (puzzle.dogs[row][col]) {
        const chosen = pickRandomDogImage(activeDogImages, usedDogImages);
        setMarks((prev) => {
          const next = prev.map((r) => [...r]);
          next[row][col] = 'dog';
          return next;
        });
        setDogImages((prev) => {
          const next = prev.map((r) => [...r]);
          next[row][col] = chosen;
          return next;
        });
        if (chosen) {
          setUsedDogImages((used) => new Set(used).add(chosen));
        }
      } else {
        setMistakes((m) => Math.min(m + 1, maxMistakes));
        setWrongCell({ row, col });
        window.setTimeout(() => {
          setWrongCell((current) =>
            current && current.row === row && current.col === col ? null : current
          );
        }, WRONG_FLASH_MS);
      }
    },
    [marks, puzzle, maxMistakes, activeDogImages, usedDogImages]
  );

  const toggleDogPack = useCallback((name: string) => {
    setDisabledDogPacks((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const setMark = useCallback((row: number, col: number, mark: CellMark) => {
    setMarks((prev) => {
      if (prev[row][col] === mark) return prev;
      const next = prev.map((r) => [...r]);
      next[row][col] = mark;
      return next;
    });
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sydoku</h1>
        <p>
          Find all {STANDARD_SIZE} dogs — one per row, column, and section, none touching (even
          diagonally). Click for safe, double-click for dog, drag to mark many at once.{' '}
          {hardMode
            ? 'Hard mode: one wrong guess and the puzzle is lost.'
            : `${NORMAL_MAX_MISTAKES} wrong guesses and the puzzle's lost.`}
        </p>
      </header>

      <div className="app__board">
        {isGenerating ? (
          <div className="app__loading" role="status" aria-live="polite">
            <div className="app__spinner" />
            <p>Generating puzzle&hellip;</p>
          </div>
        ) : generationError !== null ? (
          <div className="app__loading" role="alert">
            <p>😕 Couldn't generate a puzzle: {generationError}</p>
            <button type="button" className="app__button" onClick={() => loadPuzzle()}>
              Retry
            </button>
          </div>
        ) : puzzle ? (
          <Grid
            puzzle={puzzle}
            marks={marks}
            dogImages={dogImages}
            wrongCell={wrongCell}
            disabled={won || lost}
            onToggleSafe={toggleSafe}
            onAttemptDog={attemptDog}
            onSetMark={setMark}
          />
        ) : null}
      </div>

      <div className="app__footer">
        <p
          className={`app__status${won ? ' app__status--won' : ''}${lost ? ' app__status--lost' : ''}`}
          aria-live="polite"
        >
          {won
            ? '🐾 You found every dog!'
            : lost
              ? '❌ Out of guesses! Start a new puzzle to try again.'
              : `Mistakes: ${mistakes} / ${maxMistakes}`}
        </p>
        <p className="app__stats">
          <span className="app__stat app__stat--wins">Wins: {stats.wins}</span>
          <span className="app__stat-sep">&middot;</span>
          <span className="app__stat app__stat--losses">Losses: {stats.losses}</span>
          <span className="app__stat-sep">&middot;</span>
          <span className="app__stat app__stat--streak">Streak: {stats.currentStreak}</span>
        </p>
        <div className="app__actions">
          <button type="button" className="app__button" onClick={() => loadPuzzle()} disabled={isGenerating}>
            New puzzle
          </button>
          {DOG_PACKS.length > 0 && (
            <button type="button" className="app__button" onClick={() => setShowDogPackMenu(true)}>
              Dog packs
            </button>
          )}
        </div>
        <label className={`app__hard-mode${hardModeLocked ? ' app__hard-mode--hidden' : ''}`}>
          <input
            type="checkbox"
            checked={hardMode}
            onChange={(e) => setHardMode(e.target.checked)}
            disabled={isGenerating || hardModeLocked}
            tabIndex={hardModeLocked ? -1 : undefined}
          />
          Hard mode (no mistakes allowed)
        </label>
      </div>

      <dialog
        ref={dogPackDialogRef}
        className="app__pack-dialog"
        onClose={() => setShowDogPackMenu(false)}
        onClick={(e) => {
          if (e.target === dogPackDialogRef.current) setShowDogPackMenu(false);
        }}
      >
        <h2>Dog packs</h2>
        <p className="app__pack-dialog-hint">
          Play with only the dogs you care about. One picture of Syd is included, no matter what.
        </p>
        <ul className="app__pack-list">
          {DOG_PACKS.map((pack) => (
            <li key={pack.name}>
              <label>
                <input
                  type="checkbox"
                  checked={!disabledDogPacks.has(pack.name)}
                  onChange={() => toggleDogPack(pack.name)}
                />
                {pack.name} ({pack.images.length})
              </label>
            </li>
          ))}
        </ul>
        <button type="button" className="app__button" onClick={() => setShowDogPackMenu(false)}>
          Done
        </button>
      </dialog>

      <WinCelebration active={won && !isGenerating} images={activeDogImages} />
    </div>
  );
}
