import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Grid from './components/Grid';
import WinCelebration from './components/WinCelebration';
import { pickRandomDogImage } from './game/dogImages';
import type { GenerationProgress } from './game/generator';
import { requestPuzzle } from './game/generatorClient';
import { createEmptyDogImages, createEmptyMarks, isWon } from './game/logic';
import { applyLoss, applyWin, loadStats, saveStats, type Stats } from './game/stats';
import { LARGE_SIZE, STANDARD_SIZE, type CellMark, type Puzzle } from './game/types';

const MAX_MISTAKES = 3;
const WRONG_FLASH_MS = 500;

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [marks, setMarks] = useState<CellMark[][]>(() => createEmptyMarks(STANDARD_SIZE));
  const [dogImages, setDogImages] = useState<(string | null)[][]>(() =>
    createEmptyDogImages(STANDARD_SIZE)
  );
  const [isGenerating, setIsGenerating] = useState(true);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [mistakes, setMistakes] = useState(0);
  // The one cell currently showing the brief "wrong" shake/flash — cleared
  // automatically a moment later. Wrong guesses are never written into
  // `marks`, so every 'dog' mark in `marks` is always correct by
  // construction; this is purely a transient visual, not game state.
  const [wrongCell, setWrongCell] = useState<{ row: number; col: number } | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());

  const won = useMemo(() => (puzzle ? isWon(puzzle, marks) : false), [puzzle, marks]);
  const lost = mistakes >= MAX_MISTAKES;
  // Large puzzles are generated best-effort (see generator.ts) and aren't
  // verified solvable by pure deduction the way standard puzzles are — a
  // player can get stuck with no logical next move. "Reveal a dog" below is
  // the honest fallback for that, rather than pretending every large puzzle
  // is crackable by logic alone.
  const isLarge = puzzle ? puzzle.size > STANDARD_SIZE : false;

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

  const loadPuzzle = useCallback(async (size: number) => {
    setIsGenerating(true);
    setGenerationProgress(null);
    const next = await requestPuzzle(size, setGenerationProgress);
    setPuzzle(next);
    setMarks(createEmptyMarks(next.size));
    setDogImages(createEmptyDogImages(next.size));
    setMistakes(0);
    setWrongCell(null);
    setIsGenerating(false);
    setGenerationProgress(null);
  }, []);

  useEffect(() => {
    loadPuzzle(STANDARD_SIZE);
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

  const revealDog = useCallback(() => {
    if (!puzzle) return;
    const candidates: { row: number; col: number }[] = [];
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        if (puzzle.dogs[row][col] && marks[row][col] !== 'dog') {
          candidates.push({ row, col });
        }
      }
    }
    if (candidates.length === 0) return;
    const { row, col } = candidates[Math.floor(Math.random() * candidates.length)];
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
  }, [puzzle, marks]);

  const setMark = useCallback((row: number, col: number, mark: CellMark) => {
    setMarks((prev) => {
      if (prev[row][col] === mark) return prev;
      const next = prev.map((r) => [...r]);
      next[row][col] = mark;
      return next;
    });
  }, []);

  const progressPercent = generationProgress
    ? Math.min(100, Math.round((generationProgress.elapsedMs / generationProgress.budgetMs) * 100))
    : 0;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sydoku</h1>
        <p>
          Find all {puzzle?.size ?? STANDARD_SIZE} dogs — one per row, column, and section, none
          touching (even diagonally). Click for safe, double-click for dog, drag to mark many at
          once. 3 wrong guesses and the puzzle's lost.
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
            {generationProgress ? (
              <>
                <p>
                  Generating large puzzle&hellip; ({generationProgress.cellsAssigned}/
                  {generationProgress.totalCells} sections placed)
                </p>
                <div className="app__progress-track">
                  <div className="app__progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              </>
            ) : (
              <p>Generating puzzle&hellip;</p>
            )}
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
        <div className="app__actions">
          <button
            type="button"
            className="app__button"
            onClick={() => loadPuzzle(STANDARD_SIZE)}
            disabled={isGenerating}
          >
            New puzzle
          </button>
          <button
            type="button"
            className="app__button"
            onClick={() => loadPuzzle(LARGE_SIZE)}
            disabled={isGenerating}
            title="20x20, 20 dogs, 20 sections — best-effort generation. Not verified solvable by logic alone; use Reveal a dog if you get stuck."
          >
            New large puzzle (beta)
          </button>
        </div>
        {isLarge && !won && !lost && (
          <div className="app__hint">
            <p className="app__hint-text">
              Large puzzles aren't guaranteed solvable by logic alone.
            </p>
            <button
              type="button"
              className="app__button app__button--hint"
              onClick={revealDog}
              disabled={isGenerating}
            >
              Reveal a dog
            </button>
          </div>
        )}
      </div>

      <WinCelebration active={won && !isGenerating} />
    </div>
  );
}
