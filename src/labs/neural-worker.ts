/**
 * Trains the neural language model off the main thread, so the page stays responsive, and
 * posts the knobs back every few thousand characters so the lab can show it learning.
 */

import { normalise } from "../language/ngram";
import {
  EMBEDDING_SIZE,
  HELD_OUT_SHARE,
  HIDDEN_UNITS,
  alphabetOf,
  createNeuralModel,
  encode,
  neuralSurprise,
  trainNeural,
  type TrainProgress,
  type TrainRequest,
} from "../language/neural";
import { seededRandom } from "../shared/random";

const CHUNK = 20_000;
const PEAK_RATE = 0.012;

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
  const text = normalise(request.text);
  const alphabet = alphabetOf(text);
  const ids = encode(text, alphabet);
  const split = Math.floor(ids.length * (1 - HELD_OUT_SHARE));
  const model = createNeuralModel(
    alphabet.symbols.length,
    request.context,
    EMBEDDING_SIZE,
    HIDDEN_UNITS,
    request.seed,
  );
  const random = seededRandom(request.seed + 4);
  let seen = 0;

  const report = (done: boolean): void => {
    const heldTo = done ? ids.length : Math.min(ids.length, split + 1500);
    const studiedTo = done ? 5000 : 2500;
    const progress: TrainProgress = {
      id: request.id,
      done,
      seen,
      // A fixed, small slice of each while training: comparable from report to report, and cheap.
      // The final report scores the whole held-out text.
      trainSurprise: neuralSurprise(model, ids, 1000, studiedTo).surprise,
      heldSurprise: neuralSurprise(model, ids, split, heldTo).surprise,
      model,
    };
    self.postMessage(progress);
  };

  const run = (): void => {
    if (current !== request.id) return;
    if (seen >= request.budget) {
      report(true);
      return;
    }
    // The stride shrinks as training goes on, as in lesson 01: big steps first, careful ones last.
    const rate = PEAK_RATE * (1 - (0.9 * seen) / request.budget);
    trainNeural(model, ids, split, CHUNK, rate, random);
    seen += CHUNK;
    report(false);
    // Yield between chunks so a "stop" message can be heard. A message channel, not a timer:
    // browsers throttle timers in background tabs to one a second, which would stall training.
    yieldThen(run);
  };
  report(false);
  run();
};
