/**
 * Times the CPU grid multiply off the main thread, so the page stays responsive while the
 * larger grids run, and posts each size's best time as soon as it has one.
 */

import { enoughRepeats, multiply, randomGrid, type Timing } from "../scale/chip";

export interface CpuRequest {
  id: number;
  sizes: readonly number[];
  /** Grid side whose answer is posted back, for checking the GPU against. */
  checkSize: number;
}

export type CpuReply =
  | { id: number; timing: Timing }
  | { id: number; check: Float32Array }
  | { id: number; done: true };

self.onmessage = (event: MessageEvent<CpuRequest>) => {
  const { id, sizes, checkSize } = event.data;
  const check = new Float32Array(checkSize * checkSize);
  multiply(randomGrid(checkSize, 1), randomGrid(checkSize, 2), checkSize, check);
  self.postMessage({ id, check } satisfies CpuReply);
  for (const size of sizes) {
    const a = randomGrid(size, size);
    const b = randomGrid(size, size + 1);
    const out = new Float32Array(size * size);
    // Warm up, so the JavaScript engine has compiled the loop, and find how many jobs to run
    // back to back so one timing is long enough for the browser's clock to measure.
    let batch = 1;
    for (;;) {
      const start = performance.now();
      for (let job = 0; job < batch; job += 1) multiply(a, b, size, out);
      if (performance.now() - start >= 2) break;
      batch *= 2;
    }
    let best = Infinity;
    let elapsed = 0;
    let repeats = 0;
    while (!enoughRepeats(elapsed, repeats, 0.15, size >= 512 ? 1 : 3)) {
      const start = performance.now();
      for (let job = 0; job < batch; job += 1) multiply(a, b, size, out);
      const seconds = (performance.now() - start) / 1000;
      best = Math.min(best, seconds / batch);
      elapsed += seconds;
      repeats += 1;
    }
    self.postMessage({ id, timing: { size, seconds: Math.max(best, 1e-9) } } satisfies CpuReply);
  }
  self.postMessage({ id, done: true } satisfies CpuReply);
};
