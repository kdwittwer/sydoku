const TAP_VIBRATION_MS = 10;

/**
 * Short haptic tick for a single cell interaction — a tap, one square
 * crossed while drag-painting, or a dog attempt. Silently does nothing
 * wherever the Vibration API isn't available (notably iOS Safari, which
 * doesn't implement it at all, even installed as a PWA) or isn't allowed in
 * the current context (e.g. requires a user gesture, which every call site
 * here already is).
 */
export function vibrateTap(): void {
  navigator.vibrate?.(TAP_VIBRATION_MS);
}
