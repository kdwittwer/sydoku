import type { Puzzle } from './types';

// Puzzle generation can take several seconds in the worst case (see
// generator.ts) — running it on the main thread would freeze the whole page,
// including any loading indicator. A single persistent worker (rather than
// one per request) also keeps generator.ts's memoized allValidPlacements()
// cache warm across regenerations instead of paying that cost every time.
let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function requestPuzzle(): Promise<Puzzle> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const handleMessage = (e: MessageEvent<Puzzle>) => {
      cleanup();
      resolve(e.data);
    };
    const handleError = (e: ErrorEvent) => {
      cleanup();
      reject(e.error ?? new Error(e.message));
    };
    function cleanup() {
      w.removeEventListener('message', handleMessage);
      w.removeEventListener('error', handleError);
    }
    w.addEventListener('message', handleMessage);
    w.addEventListener('error', handleError);
    w.postMessage(null);
  });
}
