const STORAGE_KEY = 'sydoku:stats';

export interface Stats {
  wins: number;
  losses: number;
  currentStreak: number;
}

const DEFAULT_STATS: Stats = { wins: 0, losses: 0, currentStreak: 0 };

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      wins: Number.isFinite(parsed.wins) ? parsed.wins : 0,
      losses: Number.isFinite(parsed.losses) ? parsed.losses : 0,
      currentStreak: Number.isFinite(parsed.currentStreak) ? parsed.currentStreak : 0,
    };
  } catch {
    // Corrupted JSON, or localStorage unavailable (private browsing, quota,
    // disabled) — fall back to a fresh count rather than throwing.
    return { ...DEFAULT_STATS };
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Same as above — persistence is best-effort, never fatal to gameplay.
  }
}

export function applyWin(stats: Stats): Stats {
  return { wins: stats.wins + 1, losses: stats.losses, currentStreak: stats.currentStreak + 1 };
}

export function applyLoss(stats: Stats): Stats {
  return { wins: stats.wins, losses: stats.losses + 1, currentStreak: 0 };
}
