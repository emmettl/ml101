/**
 * The bridge from lesson 07 to lesson 08: the same job as the count table (odds for the next
 * character, given the last few) done by a small neural network instead.
 *
 * Each character gets a learned position (an embedding, lesson 05). The positions of the last
 * few characters are laid side by side and fed through one hidden layer (lesson 04) to a score
 * for every possible next character, squashed into odds. Every knob is trained by descent
 * (lesson 01) on the usual loss: surprise at what actually came next (lesson 03).
 *
 * This is, in miniature, the design of Bengio et al.'s 2003 neural language model. A
 * transformer replaces "lay the last few side by side" with attention; nothing else changes.
 * No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export interface Alphabet {
  symbols: string[];
  index: Map<string, number>;
}

export function alphabetOf(text: string): Alphabet {
  const symbols = [...new Set(text)].sort();
  return { symbols, index: new Map(symbols.map((symbol, id) => [symbol, id])) };
}

export function encode(text: string, alphabet: Alphabet): Uint8Array {
  return Uint8Array.from(text, (symbol) => alphabet.index.get(symbol) ?? 0);
}

export interface NeuralModel {
  context: number;
  dimensions: number;
  hidden: number;
  vocabulary: number;
  /** One row of `dimensions` numbers per character. */
  embeddings: Float32Array;
  inputWeights: Float32Array;
  inputBias: Float32Array;
  outputWeights: Float32Array;
  outputBias: Float32Array;
  steps: number;
}

export function createNeuralModel(
  vocabulary: number,
  context: number,
  dimensions: number,
  hidden: number,
  seed: number,
): NeuralModel {
  const random = seededRandom(seed);
  const filled = (length: number, spread: number) =>
    Float32Array.from({ length }, () => spread * normalRandom(random));
  const width = context * dimensions;
  return {
    context,
    dimensions,
    hidden,
    vocabulary,
    embeddings: filled(vocabulary * dimensions, 0.3),
    inputWeights: filled(hidden * width, Math.sqrt(1 / width)),
    inputBias: new Float32Array(hidden),
    outputWeights: filled(vocabulary * hidden, Math.sqrt(1 / hidden) * 0.5),
    outputBias: new Float32Array(vocabulary),
    steps: 0,
  };
}

export function knobCount(model: NeuralModel): number {
  return (
    model.embeddings.length +
    model.inputWeights.length +
    model.inputBias.length +
    model.outputWeights.length +
    model.outputBias.length
  );
}

/** Scratch space reused on every call, so training allocates nothing. */
interface Workspace {
  input: Float32Array;
  hiddenOut: Float32Array;
  odds: Float32Array;
  blameHidden: Float32Array;
  blameInput: Float32Array;
}

const workspaces = new WeakMap<NeuralModel, Workspace>();

function workspaceFor(model: NeuralModel): Workspace {
  let space = workspaces.get(model);
  if (!space) {
    space = {
      input: new Float32Array(model.context * model.dimensions),
      hiddenOut: new Float32Array(model.hidden),
      odds: new Float32Array(model.vocabulary),
      blameHidden: new Float32Array(model.hidden),
      blameInput: new Float32Array(model.context * model.dimensions),
    };
    workspaces.set(model, space);
  }
  return space;
}

// peek:start neural
/** Odds for the next character, given the ids of the last `context` characters. */
function forward(model: NeuralModel, ids: ArrayLike<number>, at: number, space: Workspace): void {
  const { context, dimensions: size, hidden, vocabulary } = model;
  const width = context * size;
  // 1. Look up each character's position and lay them side by side.
  for (let slot = 0; slot < context; slot += 1) {
    const from = ids[at - context + slot] * size;
    for (let d = 0; d < size; d += 1) space.input[slot * size + d] = model.embeddings[from + d];
  }
  // 2. One hidden layer: weighted sums, then a bend.
  for (let j = 0; j < hidden; j += 1) {
    let sum = model.inputBias[j];
    const row = j * width;
    for (let i = 0; i < width; i += 1) sum += model.inputWeights[row + i] * space.input[i];
    space.hiddenOut[j] = Math.tanh(sum);
  }
  // 3. A score for every possible next character, squashed into odds that add up to one.
  let top = -Infinity;
  for (let k = 0; k < vocabulary; k += 1) {
    let sum = model.outputBias[k];
    const row = k * hidden;
    for (let j = 0; j < hidden; j += 1) sum += model.outputWeights[row + j] * space.hiddenOut[j];
    space.odds[k] = sum;
    if (sum > top) top = sum;
  }
  let total = 0;
  for (let k = 0; k < vocabulary; k += 1) total += space.odds[k] = Math.exp(space.odds[k] - top);
  for (let k = 0; k < vocabulary; k += 1) space.odds[k] /= total;
}

/**
 * One step of learning on one position in the text. Blame starts as (odds − what happened) and
 * flows backwards through the output layer, the hidden layer and into the embeddings of the
 * very characters that were read, moving every knob a little way downhill.
 * Returns the surprise at the true next character, before the update.
 */
function learnFrom(
  model: NeuralModel,
  ids: ArrayLike<number>,
  at: number,
  rate: number,
  space: Workspace,
): number {
  const { context, dimensions: size, hidden, vocabulary } = model;
  const width = context * size;
  forward(model, ids, at, space);
  const answer = ids[at];
  const surprise = -Math.log(Math.max(space.odds[answer], 1e-12));

  space.blameHidden.fill(0);
  for (let k = 0; k < vocabulary; k += 1) {
    const blame = space.odds[k] - (k === answer ? 1 : 0);
    const row = k * hidden;
    for (let j = 0; j < hidden; j += 1) {
      space.blameHidden[j] += blame * model.outputWeights[row + j];
      model.outputWeights[row + j] -= rate * blame * space.hiddenOut[j];
    }
    model.outputBias[k] -= rate * blame;
  }
  space.blameInput.fill(0);
  for (let j = 0; j < hidden; j += 1) {
    const blame = space.blameHidden[j] * (1 - space.hiddenOut[j] * space.hiddenOut[j]);
    const row = j * width;
    for (let i = 0; i < width; i += 1) {
      space.blameInput[i] += blame * model.inputWeights[row + i];
      model.inputWeights[row + i] -= rate * blame * space.input[i];
    }
    model.inputBias[j] -= rate * blame;
  }
  for (let slot = 0; slot < context; slot += 1) {
    const from = ids[at - context + slot] * size;
    for (let d = 0; d < size; d += 1)
      model.embeddings[from + d] -= rate * space.blameInput[slot * size + d];
  }
  return surprise;
}
// peek:end

/** Train on `count` random positions from `ids[0, limit)`. Returns the average surprise seen. */
export function trainNeural(
  model: NeuralModel,
  ids: ArrayLike<number>,
  limit: number,
  count: number,
  rate: number,
  random: Random,
): number {
  const space = workspaceFor(model);
  let total = 0;
  for (let step = 0; step < count; step += 1) {
    const at = model.context + Math.floor(random() * (limit - model.context));
    total += learnFrom(model, ids, at, rate, space);
  }
  model.steps += count;
  return total / count;
}

/** The model's odds for every next character after `history` (ids), as a plain array. */
export function neuralOdds(model: NeuralModel, history: ArrayLike<number>): number[] {
  const space = workspaceFor(model);
  const padded = new Uint8Array(model.context + 1);
  const take = Math.min(model.context, history.length);
  for (let i = 0; i < take; i += 1)
    padded[model.context - take + i] = history[history.length - take + i];
  forward(model, padded, model.context, space);
  return Array.from(space.odds);
}

/** Average surprise over positions `from`…`to` of the text: the loss, on text of your choosing. */
export function neuralSurprise(
  model: NeuralModel,
  ids: ArrayLike<number>,
  from: number,
  to: number,
  keep?: (at: number) => boolean,
): { surprise: number; count: number } {
  const space = workspaceFor(model);
  let total = 0;
  let count = 0;
  for (let at = Math.max(from, model.context); at < to; at += 1) {
    if (keep && !keep(at)) continue;
    forward(model, ids, at, space);
    total -= Math.log(Math.max(space.odds[ids[at]], 1e-12));
    count += 1;
  }
  return { surprise: count ? total / count : 0, count };
}

/** Characters ranked by how close their learned positions are to `symbol`'s. */
export function nearestCharacters(model: NeuralModel, alphabet: Alphabet, symbol: string) {
  const size = model.dimensions;
  const row = (id: number) => model.embeddings.subarray(id * size, id * size + size);
  const target = row(alphabet.index.get(symbol) ?? 0);
  const cosine = (a: Float32Array, b: Float32Array) => {
    let dot = 0;
    let aa = 0;
    let bb = 0;
    for (let d = 0; d < size; d += 1) {
      dot += a[d] * b[d];
      aa += a[d] * a[d];
      bb += b[d] * b[d];
    }
    return dot / (Math.sqrt(aa * bb) || 1);
  };
  return alphabet.symbols
    .filter((other) => other !== symbol)
    .map((other) => ({
      symbol: other,
      similarity: cosine(target, row(alphabet.index.get(other) ?? 0)),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

/** The lab's fixed design, and the messages it exchanges with its training worker. */
export const HELD_OUT_SHARE = 0.1;
export const EMBEDDING_SIZE = 8;
export const HIDDEN_UNITS = 64;

export interface TrainRequest {
  id: number;
  text: string;
  context: number;
  budget: number;
  seed: number;
}

export interface TrainProgress {
  id: number;
  done: boolean;
  /** Characters read so far. */
  seen: number;
  trainSurprise: number;
  heldSurprise: number;
  model: NeuralModel;
}
