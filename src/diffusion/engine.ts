/**
 * Drawing by removing noise. Take points that form a shape and drown them in noise a little at
 * a time, until nothing of the shape is left. A network is trained on one job: given a noisy
 * point and how far along the drowning it is, guess the noise that was added. Run that guess
 * backwards from pure noise, removing a little at each step, and points that form the shape
 * come out. That is a diffusion model, in two dimensions instead of a million pixels, trained
 * by lesson 01's descent with lesson 04's backpropagation. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export type Shape = "ring" | "spiral" | "moons" | "heart";
export const SHAPES: readonly Shape[] = ["ring", "spiral", "moons", "heart"];

export interface Point {
  x: number;
  y: number;
}

/** Points on a shape, scaled to sit within about ±1. */
export function makeShape(shape: Shape, count: number, seed: number): Point[] {
  const random = seededRandom(seed);
  const points: Point[] = [];
  for (let at = 0; at < count; at += 1) {
    const t = random();
    if (shape === "ring") {
      const angle = 2 * Math.PI * t;
      points.push({ x: 0.85 * Math.cos(angle), y: 0.85 * Math.sin(angle) });
    } else if (shape === "spiral") {
      const angle = 0.5 + 2.6 * Math.PI * t;
      const radius = 0.12 + 0.28 * angle;
      points.push({ x: 0.33 * radius * Math.cos(angle), y: 0.33 * radius * Math.sin(angle) });
    } else if (shape === "moons") {
      const angle = Math.PI * t;
      if (at % 2 === 0)
        points.push({ x: Math.cos(angle) * 0.8 - 0.35, y: Math.sin(angle) * 0.8 - 0.25 });
      else points.push({ x: 0.35 - Math.cos(angle) * 0.8, y: 0.25 - Math.sin(angle) * 0.8 });
    } else {
      const angle = 2 * Math.PI * t;
      const x = 16 * Math.sin(angle) ** 3;
      const y =
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle);
      points.push({ x: x / 18, y: y / 18 + 0.1 });
    }
  }
  return points;
}

export const STEPS = 60;

/** How much noise has been mixed in by step t: from almost none to almost all. */
export interface Schedule {
  /** The share of the original point that survives at each step, cumulatively. */
  keep: Float64Array;
  beta: Float64Array;
}

export function makeSchedule(steps = STEPS): Schedule {
  const beta = new Float64Array(steps);
  const keep = new Float64Array(steps);
  let product = 1;
  for (let t = 0; t < steps; t += 1) {
    beta[t] = 0.001 + (0.2 - 0.001) * (t / (steps - 1));
    product *= 1 - beta[t];
    keep[t] = product;
  }
  return { keep, beta };
}

// peek:start noise
/** Drown a point: mix in noise so that a share `keep[t]` of it survives. */
export function drown(point: Point, t: number, schedule: Schedule, noise: Point): Point {
  const signal = Math.sqrt(schedule.keep[t]);
  const spread = Math.sqrt(1 - schedule.keep[t]);
  return { x: signal * point.x + spread * noise.x, y: signal * point.y + spread * noise.y };
}
// peek:end

/** A small network: (x, y, and a few sines of t) → a guess at the noise (two numbers). */
export interface Denoiser {
  hidden: number;
  weights1: Float64Array;
  bias1: Float64Array;
  weights2: Float64Array;
  bias2: Float64Array;
  weights3: Float64Array;
  bias3: Float64Array;
  steps: number;
}

const TIME_FEATURES = 6;
const INPUTS = 2 + TIME_FEATURES;

export function createDenoiser(hidden: number, seed: number): Denoiser {
  const random = seededRandom(seed);
  const fill = (length: number, spread: number) =>
    Float64Array.from({ length }, () => spread * normalRandom(random));
  return {
    hidden,
    weights1: fill(hidden * INPUTS, Math.sqrt(2 / INPUTS)),
    bias1: new Float64Array(hidden),
    weights2: fill(hidden * hidden, Math.sqrt(2 / hidden)),
    bias2: new Float64Array(hidden),
    weights3: fill(2 * hidden, Math.sqrt(1 / hidden)),
    bias3: new Float64Array(2),
    steps: 0,
  };
}

export function knobCount(model: Denoiser): number {
  return (
    model.weights1.length +
    model.bias1.length +
    model.weights2.length +
    model.bias2.length +
    model.weights3.length +
    model.bias3.length
  );
}

function inputsFor(point: Point, t: number, steps: number): Float64Array {
  const inputs = new Float64Array(INPUTS);
  inputs[0] = point.x;
  inputs[1] = point.y;
  const phase = (t / steps) * Math.PI;
  for (let k = 0; k < TIME_FEATURES / 2; k += 1) {
    inputs[2 + 2 * k] = Math.sin(phase * (k + 1));
    inputs[3 + 2 * k] = Math.cos(phase * (k + 1));
  }
  return inputs;
}

interface Pass {
  inputs: Float64Array;
  h1: Float64Array;
  h2: Float64Array;
  out: Float64Array;
}

function forward(model: Denoiser, inputs: Float64Array): Pass {
  const { hidden } = model;
  const h1 = new Float64Array(hidden);
  const h2 = new Float64Array(hidden);
  const out = new Float64Array(2);
  for (let j = 0; j < hidden; j += 1) {
    let sum = model.bias1[j];
    for (let i = 0; i < INPUTS; i += 1) sum += model.weights1[j * INPUTS + i] * inputs[i];
    h1[j] = Math.max(0, sum);
  }
  for (let j = 0; j < hidden; j += 1) {
    let sum = model.bias2[j];
    for (let i = 0; i < hidden; i += 1) sum += model.weights2[j * hidden + i] * h1[i];
    h2[j] = Math.max(0, sum);
  }
  for (let k = 0; k < 2; k += 1) {
    let sum = model.bias3[k];
    for (let j = 0; j < hidden; j += 1) sum += model.weights3[k * hidden + j] * h2[j];
    out[k] = sum;
  }
  return { inputs, h1, h2, out };
}

/** The network's guess at the noise in a drowned point. */
export function guessNoise(model: Denoiser, point: Point, t: number, steps = STEPS): Point {
  const { out } = forward(model, inputsFor(point, t, steps));
  return { x: out[0], y: out[1] };
}

// peek:start denoise
/**
 * One training step on a batch. For each shape point: pick a random step, drown the point in
 * fresh noise, ask the network what the noise was, and nudge every knob to make the guess
 * closer. The loss is lesson 00's squared error, between the noise added and the noise guessed.
 */
export function trainStep(
  model: Denoiser,
  points: readonly Point[],
  schedule: Schedule,
  batch: number,
  rate: number,
  random: Random,
): number {
  const { hidden } = model;
  const steps = schedule.keep.length;
  const g1 = new Float64Array(model.weights1.length);
  const gb1 = new Float64Array(hidden);
  const g2 = new Float64Array(model.weights2.length);
  const gb2 = new Float64Array(hidden);
  const g3 = new Float64Array(model.weights3.length);
  const gb3 = new Float64Array(2);
  let loss = 0;
  for (let b = 0; b < batch; b += 1) {
    const point = points[Math.floor(random() * points.length)];
    const t = Math.floor(random() * steps);
    const noise = { x: normalRandom(random), y: normalRandom(random) };
    const pass = forward(model, inputsFor(drown(point, t, schedule, noise), t, steps));
    const blameOut = [pass.out[0] - noise.x, pass.out[1] - noise.y];
    loss += (blameOut[0] ** 2 + blameOut[1] ** 2) / 2;
    const blameH2 = new Float64Array(hidden);
    for (let k = 0; k < 2; k += 1) {
      gb3[k] += blameOut[k];
      for (let j = 0; j < hidden; j += 1) {
        g3[k * hidden + j] += blameOut[k] * pass.h2[j];
        blameH2[j] += blameOut[k] * model.weights3[k * hidden + j];
      }
    }
    const blameH1 = new Float64Array(hidden);
    for (let j = 0; j < hidden; j += 1) {
      if (pass.h2[j] <= 0) continue;
      gb2[j] += blameH2[j];
      for (let i = 0; i < hidden; i += 1) {
        g2[j * hidden + i] += blameH2[j] * pass.h1[i];
        blameH1[i] += blameH2[j] * model.weights2[j * hidden + i];
      }
    }
    for (let j = 0; j < hidden; j += 1) {
      if (pass.h1[j] <= 0) continue;
      gb1[j] += blameH1[j];
      for (let i = 0; i < INPUTS; i += 1) g1[j * INPUTS + i] += blameH1[j] * pass.inputs[i];
    }
  }
  model.steps += 1;
  const state = momentsFor(model);
  adam(model.weights1, g1, state.weights1, batch, rate, model.steps);
  adam(model.bias1, gb1, state.bias1, batch, rate, model.steps);
  adam(model.weights2, g2, state.weights2, batch, rate, model.steps);
  adam(model.bias2, gb2, state.bias2, batch, rate, model.steps);
  adam(model.weights3, g3, state.weights3, batch, rate, model.steps);
  adam(model.bias3, gb3, state.bias3, batch, rate, model.steps);
  return loss / batch;
}

/**
 * Adam: descent with a running average of the slope and of its square, so each knob takes
 * steps of about `rate` whatever the scale of its slope. Plain descent works here too, but
 * needs several times as many steps.
 */
interface Moments {
  mean: Float64Array;
  square: Float64Array;
}
type ModelMoments = Record<
  "weights1" | "bias1" | "weights2" | "bias2" | "weights3" | "bias3",
  Moments
>;
const moments = new WeakMap<Denoiser, ModelMoments>();

function momentsFor(model: Denoiser): ModelMoments {
  let state = moments.get(model);
  if (!state) {
    const blank = (length: number): Moments => ({
      mean: new Float64Array(length),
      square: new Float64Array(length),
    });
    state = {
      weights1: blank(model.weights1.length),
      bias1: blank(model.bias1.length),
      weights2: blank(model.weights2.length),
      bias2: blank(model.bias2.length),
      weights3: blank(model.weights3.length),
      bias3: blank(model.bias3.length),
    };
    moments.set(model, state);
  }
  return state;
}

function adam(
  knobs: Float64Array,
  slope: Float64Array,
  state: Moments,
  batch: number,
  rate: number,
  step: number,
): void {
  const b1 = 0.9;
  const b2 = 0.999;
  const fix1 = 1 - b1 ** step;
  const fix2 = 1 - b2 ** step;
  for (let at = 0; at < knobs.length; at += 1) {
    const g = slope[at] / batch;
    state.mean[at] = b1 * state.mean[at] + (1 - b1) * g;
    state.square[at] = b2 * state.square[at] + (1 - b2) * g * g;
    knobs[at] -= (rate * (state.mean[at] / fix1)) / (Math.sqrt(state.square[at] / fix2) + 1e-8);
  }
}

/**
 * Drawing: start from pure noise and, step by step from the last to the first, subtract the
 * network's guess at the noise, then add a little fresh noise so the points keep exploring.
 * Returns every intermediate cloud, so the drawing can be watched.
 */
export function sample(
  model: Denoiser,
  schedule: Schedule,
  count: number,
  random: Random,
): Point[][] {
  const steps = schedule.keep.length;
  let cloud: Point[] = Array.from({ length: count }, () => ({
    x: normalRandom(random),
    y: normalRandom(random),
  }));
  const clouds: Point[][] = [cloud.map((point) => ({ ...point }))];
  for (let t = steps - 1; t >= 0; t -= 1) {
    const beta = schedule.beta[t];
    const keep = schedule.keep[t];
    cloud = cloud.map((point) => {
      const guess = guessNoise(model, point, t, steps);
      const scale = 1 / Math.sqrt(1 - beta);
      const pull = beta / Math.sqrt(1 - keep);
      const next = { x: scale * (point.x - pull * guess.x), y: scale * (point.y - pull * guess.y) };
      if (t > 0) {
        // Fresh noise on the scale the drowning itself used at this step: large early, when the
        // cloud is still shapeless, and vanishing as the drawing finishes.
        const jitter = Math.sqrt((beta * (1 - schedule.keep[t - 1])) / (1 - keep));
        next.x += jitter * normalRandom(random);
        next.y += jitter * normalRandom(random);
      }
      return next;
    });
    clouds.push(cloud.map((point) => ({ ...point })));
  }
  return clouds;
}
// peek:end

/** Average distance from each drawn point to the nearest point of the shape: how well it drew. */
export function distanceToShape(drawn: readonly Point[], shape: readonly Point[]): number {
  let total = 0;
  for (const point of drawn) {
    let nearest = Infinity;
    for (const target of shape)
      nearest = Math.min(nearest, (point.x - target.x) ** 2 + (point.y - target.y) ** 2);
    total += Math.sqrt(nearest);
  }
  return total / drawn.length;
}

/** Share of drawn points that land within `radius` of the shape. */
export function shareNearShape(
  drawn: readonly Point[],
  shape: readonly Point[],
  radius = 0.1,
): number {
  let near = 0;
  for (const point of drawn) {
    let nearest = Infinity;
    for (const target of shape)
      nearest = Math.min(nearest, Math.hypot(point.x - target.x, point.y - target.y));
    if (nearest < radius) near += 1;
  }
  return near / drawn.length;
}

/** The lab's fixed design, and the messages it exchanges with its training worker. */
export const HIDDEN_CHOICES = [32, 64] as const;
export const BATCH = 64;
export const RATE = 0.005;

export interface TrainRequest {
  id: number;
  shape: Shape;
  hidden: number;
  budget: number;
  seed: number;
}

export interface TrainProgress {
  id: number;
  done: boolean;
  steps: number;
  /** Average loss over the last chunk of training. */
  loss: number;
  model: Denoiser;
}
