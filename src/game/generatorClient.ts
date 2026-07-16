import type { GenerateRequest, GenerateResponse } from './generator';
import type { Puzzle } from './types';

// Puzzle generation takes a couple seconds — running it on the main thread
// would freeze the whole page, including the loading indicator. A single
// persistent worker (rather than one per request) also keeps generator.ts's
// memoized allValidPlacements() cache warm across regenerations instead of
// paying that cost every time.
let worker: Worker | null = null;
let nextRequestId = 1;

// Backstop for a worker that never responds at all (module workers aren't
// supported in some Android browsers/WebViews, or a stale service-worker
// cache can point at an asset hash a prior deploy already deleted) — without
// this, a silently-dead worker leaves the caller's promise pending forever
// and the UI stuck on its loading state.
const SILENCE_TIMEOUT_MS = 20000;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

// A worker whose script failed to load (or that's gone silent) never
// recovers on its own — a failed module load doesn't fire a second 'error'
// event on a later postMessage, it just goes nowhere forever. Discarding it
// so the next call gets a fresh instance is what makes "Retry" actually able
// to succeed instead of repeating the same dead request.
function discardWorker() {
  worker?.terminate();
  worker = null;
}

export function requestPuzzle(): Promise<Puzzle> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const requestId = nextRequestId++;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      discardWorker();
      reject(new Error('Puzzle generation timed out — the worker may have failed to start or become unresponsive.'));
    }, SILENCE_TIMEOUT_MS);

    const handleMessage = (e: MessageEvent<GenerateResponse>) => {
      // The worker is a shared, persistent instance — e.g. React Strict
      // Mode's double-invoked mount effect can leave an earlier request's
      // messages still in flight when a later one is posted. Every listener
      // sees every message, so it must ignore any whose requestId isn't its
      // own rather than assuming the first message it sees belongs to it.
      if (e.data.requestId !== requestId) return;
      cleanup();
      resolve(e.data.puzzle);
    };
    const handleError = (e: ErrorEvent) => {
      cleanup();
      discardWorker();
      // Browsers often withhold detail on a worker script load failure (e.g.
      // e.message is ''), so fall back to a message that's never empty —
      // an empty string is falsy and would otherwise be indistinguishable
      // from "no error" to a caller checking truthiness.
      reject(e.error ?? new Error(e.message || 'The puzzle worker failed to load or crashed.'));
    };
    function cleanup() {
      window.clearTimeout(timeoutId);
      w.removeEventListener('message', handleMessage);
      w.removeEventListener('error', handleError);
    }
    w.addEventListener('message', handleMessage);
    w.addEventListener('error', handleError);
    const request: GenerateRequest = { requestId };
    w.postMessage(request);
  });
}
