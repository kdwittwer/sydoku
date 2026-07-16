/// <reference lib="webworker" />
import { generatePuzzle, type GenerateRequest, type GenerateResponse } from './generator';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { requestId } = e.data;
  const puzzle = generatePuzzle();
  const message: GenerateResponse = { requestId, puzzle };
  self.postMessage(message);
};
