const HARD_MODE_STORAGE_KEY = 'sydoku:hardMode';

export function loadHardMode(): boolean {
  try {
    return localStorage.getItem(HARD_MODE_STORAGE_KEY) === 'true';
  } catch {
    // localStorage unavailable (private browsing, quota, disabled) — default off.
    return false;
  }
}

export function saveHardMode(hardMode: boolean): void {
  try {
    localStorage.setItem(HARD_MODE_STORAGE_KEY, String(hardMode));
  } catch {
    // Same as above — persistence is best-effort, never fatal to gameplay.
  }
}
