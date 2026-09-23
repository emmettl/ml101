/**
 * Trains the denoiser off the main thread and posts its knobs back every few hundred steps,
 * so the lab can draw with a half-trained network and show the drawings sharpening.
 */

import {
  BATCH,
  RATE,
  createDenoiser,
  makeSchedule,
  makeShape,
  trainStep,
  type TrainProgress,
  type TrainRequest,
} from "../diffusion/engine";
import { seededRandom } from "../shared/random";

const CHUNK = 250;
let current = 0;

const channel = new MessageChannel();
let resume: (() => void) | undefined;
channel.port1.onmessage = () => resume?.();
function yieldThen(next: () => void): void {
  resume = next;
  channel.port2.postMessage(0);
}

self.onmessage = (event: MessageEvent<TrainRequest | { stop: true }>) => {
  if ("stop" in event.data) {
    current += 1;
    return;
  }
  const request = event.data;
  current = request.id;
  const points = makeShape(request.shape, 600, request.seed);
  const schedule = makeSchedule();
  const model = createDenoiser(request.hidden, request.seed + 7);
  const random = seededRandom(request.seed + 11);
  let loss = 0;
  const report = (done: boolean): void => {
    const progress: TrainProgress = { id: request.id, done, steps: model.steps, loss, model };
    self.postMessage(progress);
  };
  const run = (): void => {
    if (current !== request.id) return;
    if (model.steps >= request.budget) {
      report(true);
      return;
    }
    let total = 0;
    for (let step = 0; step < CHUNK && model.steps < request.budget; step += 1)
      total += trainStep(model, points, schedule, BATCH, RATE, random);
    loss = total / CHUNK;
    report(false);
    yieldThen(run);
  };
  run();
};
