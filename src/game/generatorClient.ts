import type { GenerateRequest, GenerateResponse, GenerationProgress } from './generator';
import type { Puzzle } from './types';

// Puzzle generation can take several seconds (up to ~25-30s for a large,
// best-effort puzzle) — running it on the main thread would freeze the
// whole page, including any loading/progress indicator. A single
// persistent worker (rather than one per request) also keeps generator.ts's
// memoized allValidPlacements() cache warm across regenerations instead of
// paying that cost every time.
let worker: Worker | null = null;
let nextRequestId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function requestPuzzle(
  size: number,
  onProgress?: (progress: GenerationProgress) => void
): Promise<Puzzle> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const requestId = nextRequestId++;
    const handleMessage = (e: MessageEvent<GenerateResponse>) => {
      // The worker is a shared, persistent instance — e.g. React Strict
      // Mode's double-invoked mount effect can leave an earlier request's
      // messages still in flight when a later one is posted. Every listener
      // sees every message, so it must ignore any whose requestId isn't its
      // own rather than assuming the first 'done' it sees belongs to it.
      if (e.data.requestId !== requestId) return;
      if (e.data.type === 'progress') {
        onProgress?.(e.data.progress);
        return;
      }
      cleanup();
      resolve(e.data.puzzle);
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
    const request: GenerateRequest = { requestId, size };
    w.postMessage(request);
  });
}
