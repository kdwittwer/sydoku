import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Grid from './components/Grid';
import WinCelebration from './components/WinCelebration';
import { pickRandomDogImage } from './game/dogImages';
import { requestPuzzle } from './game/generatorClient';
import { createEmptyDogImages, createEmptyMarks, isWon } from './game/logic';
import { applyLoss, applyWin, loadStats, saveStats, type Stats } from './game/stats';
import type { CellMark, Puzzle } from './game/types';

const MAX_MISTAKES = 3;
const WRONG_FLASH_MS = 500;

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<CellMark[][]>(() => createEmptyMarks());
  const [dogImages, setDogImages] = useState<(string | null)[][]>(() => createEmptyDogImages());
  const [isGenerating, setIsGenerating] = useState(true);
  const [mistakes, setMistakes] = useState(0);
  // The one cell currently showing the brief "wrong" shake/flash — cleared
  // automatically a moment later. Wrong guesses are never written into
  // `marks`, so every 'dog' mark in `marks` is always correct by
  // construction; this is purely a transient visual, not game state.
  const [wrongCell, setWrongCell] = useState<{ row: number; col: number } | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());

  const won = useMemo(() => (puzzle ? isWon(puzzle, marks) : false), [puzzle, marks]);
  const lost = mistakes >= MAX_MISTAKES;

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

  const loadPuzzle = useCallback(async () => {
    setIsGenerating(true);
    const next = await requestPuzzle();
    setPuzzle(next);
    setMarks(createEmptyMarks());
    setDogImages(createEmptyDogImages());
    setMistakes(0);
    setWrongCell(null);
    setIsGenerating(false);
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
        setMarks((prev) => {
          const next = prev.map((r) => [...r]);
          next[row][col] = 'dog';
          return next;
        });
        setDogImages((prev) => {
          const next = prev.map((r) => [...r]);
          next[row][col] = pickRandomDogImage();
          return next;
        });
      } else {
        setMistakes((m) => Math.min(m + 1, MAX_MISTAKES));
        setWrongCell({ row, col });
        window.setTimeout(() => {
          setWrongCell((current) =>
            current && current.row === row && current.col === col ? null : current
          );
        }, WRONG_FLASH_MS);
      }
    },
    [marks, puzzle]
  );

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
          Find all 10 dogs — one per row, column, and section, none touching (even diagonally).
          Click for safe, double-click for dog, drag to mark many at once. 3 wrong guesses and the
          puzzle's lost.
        </p>
      </header>

      <div className="app__board">
        {puzzle && !isGenerating ? (
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
        ) : (
          <div className="app__loading" role="status" aria-live="polite">
            <div className="app__spinner" />
            <p>Generating puzzle&hellip;</p>
          </div>
        )}
      </div>

      <div className="app__footer">
        {won && <p className="app__won">🐾 You found every dog!</p>}
        {lost && <p className="app__lost">❌ Out of guesses! Start a new puzzle to try again.</p>}
        {!won && !lost && (
          <p className="app__mistakes" aria-live="polite">
            Mistakes: {mistakes} / {MAX_MISTAKES}
          </p>
        )}
        <p className="app__stats">
          Wins: {stats.wins} &middot; Losses: {stats.losses} &middot; Streak: {stats.currentStreak}
        </p>
        <button type="button" className="app__button" onClick={loadPuzzle} disabled={isGenerating}>
          New puzzle
        </button>
      </div>

      <WinCelebration active={won && !isGenerating} />
    </div>
  );
}
