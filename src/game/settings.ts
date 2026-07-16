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

const DISABLED_DOG_PACKS_STORAGE_KEY = 'sydoku:disabledDogPacks';

// Stored as the *disabled* set (not enabled) so a newly added pack — one
// this stored value predates and has no opinion on — defaults to included
// rather than silently invisible until the player finds and enables it.
export function loadDisabledDogPacks(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_DOG_PACKS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((p): p is string => typeof p === 'string'));
  } catch {
    return new Set();
  }
}

export function saveDisabledDogPacks(disabledPacks: ReadonlySet<string>): void {
  try {
    localStorage.setItem(DISABLED_DOG_PACKS_STORAGE_KEY, JSON.stringify([...disabledPacks]));
  } catch {
    // Same as above — persistence is best-effort, never fatal to gameplay.
  }
}
