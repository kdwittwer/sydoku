import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Grid from './components/Grid';
import { pickRandomDogImage } from './game/dogImages';
import { generatePuzzle } from './game/generator';
import { createEmptyDogImages, createEmptyMarks, findConflicts, isWon } from './game/logic';
import type { CellMark, Puzzle } from './game/types';

const NEW_PUZZLE_DELAY_MS = 1800;

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle>(() => generatePuzzle());
  const [marks, setMarks] = useState<CellMark[][]>(() => createEmptyMarks());
  const [dogImages, setDogImages] = useState<(string | null)[][]>(() => createEmptyDogImages());

  const conflicts = useMemo(() => findConflicts(puzzle, marks), [puzzle, marks]);
  const won = useMemo(() => isWon(puzzle, marks), [puzzle, marks]);

  useEffect(() => {
    if (!won) return;
    const timer = window.setTimeout(() => {
      setPuzzle(generatePuzzle());
      setMarks(createEmptyMarks());
      setDogImages(createEmptyDogImages());
    }, NEW_PUZZLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [won]);

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

  const handleNewPuzzle = useCallback(() => {
    setPuzzle(generatePuzzle());
    setMarks(createEmptyMarks());
    setDogImages(createEmptyDogImages());
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sydoku</h1>
        <p>
          Find all 10 dogs. One per row, one per column, none touching &mdash; and exactly one
          per colored section. Click a cell to mark it safe, double-click to flag a dog. Click and
          drag to mark a whole swath at once.
        </p>
      </header>

      <Grid
        puzzle={puzzle}
        marks={marks}
        dogImages={dogImages}
        conflicts={conflicts}
        disabled={won}
        onToggleSafe={toggleSafe}
        onToggleDog={toggleDog}
        onSetMark={setMark}
      />

      <div className="app__footer">
        {won ? (
          <p className="app__won">🐾 You found every dog! New puzzle incoming&hellip;</p>
        ) : (
          <button type="button" className="app__new-puzzle" onClick={handleNewPuzzle}>
            New puzzle
          </button>
        )}
      </div>
    </div>
  );
}
