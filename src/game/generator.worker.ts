/// <reference lib="webworker" />
import { generatePuzzle, type GenerateRequest, type GenerateResponse } from './generator';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { requestId, size } = e.data;
  const puzzle = generatePuzzle(size, (progress) => {
    const message: GenerateResponse = { type: 'progress', requestId, progress };
    self.postMessage(message);
  });
  const message: GenerateResponse = { type: 'done', requestId, puzzle };
  self.postMessage(message);
};
