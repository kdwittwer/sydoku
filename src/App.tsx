import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Grid from './components/Grid';
import { pickRandomDogImage } from './game/dogImages';
import { requestPuzzle } from './game/generatorClient';
import { createEmptyDogImages, createEmptyMarks, findConflicts, isWon } from './game/logic';
import { GRID_SIZE } from './game/types';
import type { CellMark, Puzzle } from './game/types';

const NEW_PUZZLE_DELAY_MS = 1800;

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<CellMark[][]>(() => createEmptyMarks());
  const [dogImages, setDogImages] = useState<(string | null)[][]>(() => createEmptyDogImages());
  const [isGenerating, setIsGenerating] = useState(true);
  // Snapshot of marks taken the moment "Check Dogs" was last pressed. Kept
  // separate from `marks` so a wrong-dog flag can disappear the instant the
  // user edits that specific cell (see `incorrect` below), without turning
  // this into live validation of every dog the moment it's placed.
  const [checkedSnapshot, setCheckedSnapshot] = useState<CellMark[][] | null>(null);

  const conflicts = useMemo(() => {
    if (puzzle) return findConflicts(puzzle, marks);
    return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(false));
  }, [puzzle, marks]);
  const won = useMemo(() => (puzzle ? isWon(puzzle, marks) : false), [puzzle, marks]);

  const incorrect = useMemo(() => {
    const grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(false));
    if (!checkedSnapshot || !puzzle) return grid;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        // Only still-flagged if the cell was dog-marked at check time AND
        // remains dog-marked now — editing it clears the flag immediately.
        if (checkedSnapshot[r][c] === 'dog' && marks[r][c] === 'dog' && !puzzle.dogs[r][c]) {
          grid[r][c] = true;
        }
      }
    }
    return grid;
  }, [checkedSnapshot, marks, puzzle]);

  const incorrectCount = useMemo(
    () => incorrect.reduce((sum, row) => sum + row.filter(Boolean).length, 0),
    [incorrect]
  );
  const markedDogCount = useMemo(
    () => marks.reduce((sum, row) => sum + row.filter((m) => m === 'dog').length, 0),
    [marks]
  );

  const loadPuzzle = useCallback(async () => {
    setIsGenerating(true);
    const next = await requestPuzzle();
    setPuzzle(next);
    setMarks(createEmptyMarks());
    setDogImages(createEmptyDogImages());
    setCheckedSnapshot(null);
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  useEffect(() => {
    if (!won) return;
    const timer = window.setTimeout(loadPuzzle, NEW_PUZZLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [won, loadPuzzle]);

  const toggleSafe = useCallback((row: number, col: number) => {
    setMarks((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = prev[row][col] === 'empty' ? 'safe' : 'empty';
      return next;
    });
  }, []);

  const toggleDog = useCallback(
    (row: number, col: number) => {
      const willBeDog = marks[row][col] !== 'dog';
      setMarks((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = willBeDog ? 'dog' : 'empty';
        return next;
      });
      setDogImages((prev) => {
        const next = prev.map((r) => [...r]);
        next[row][col] = willBeDog ? pickRandomDogImage() : null;
        return next;
      });
    },
    [marks]
  );

  const setMark = useCallback((row: number, col: number, mark: CellMark) => {
    setMarks((prev) => {
      if (prev[row][col] === mark) return prev;
      const next = prev.map((r) => [...r]);
      next[row][col] = mark;
      return next;
    });
  }, []);

  const handleCheckDogs = useCallback(() => {
    setCheckedSnapshot(marks.map((row) => [...row]));
  }, [marks]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sydoku</h1>
        <p>
          Find all 10 dogs — one per row, column, and section. Click for safe, double-click for
          dog, drag to mark many at once.
        </p>
      </header>

      <div className="app__board">
        {puzzle && !isGenerating ? (
          <Grid
            puzzle={puzzle}
            marks={marks}
            dogImages={dogImages}
            conflicts={conflicts}
            incorrect={incorrect}
            disabled={won}
            onToggleSafe={toggleSafe}
            onToggleDog={toggleDog}
            onSetMark={setMark}
          />
        ) : (
          <div className="app__loading" role="status" aria-live="polite">
            <div className="app__spinner" />
            <p>Generating puzzle&hellip;</p>
          </div>
        )}
      </div>

      <div className="app__footer">
        {won ? (
          <p className="app__won">🐾 You found every dog! New puzzle incoming&hellip;</p>
        ) : (
          <>
            <div className="app__actions">
              <button
                type="button"
                className="app__button"
                onClick={handleCheckDogs}
                disabled={isGenerating}
              >
                Check dogs
              </button>
              <button
                type="button"
                className="app__button"
                onClick={loadPuzzle}
                disabled={isGenerating}
              >
                New puzzle
              </button>
            </div>
            {checkedSnapshot &&
              (incorrectCount > 0 ? (
                <p className="app__check-result app__check-result--bad">
                  {incorrectCount} marked {incorrectCount === 1 ? 'dog is' : 'dogs are'} wrong
                  &mdash; flagged in red.
                </p>
              ) : markedDogCount > 0 ? (
                <p className="app__check-result app__check-result--good">
                  Every marked dog is correct so far!
                </p>
              ) : (
                <p className="app__check-result">No dogs marked yet.</p>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
