/// <reference lib="webworker" />
import { generatePuzzle } from './generator';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = () => {
  self.postMessage(generatePuzzle());
};
