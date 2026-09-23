/**
 * Finding groups nobody labelled. K-means is given points and a number k, and nothing else.
 * It guesses k centres, gives every point to its nearest centre, moves each centre to the
 * middle of its points, and repeats until nothing moves. Each round lowers one number, the
 * total squared distance from points to their centres, so it is descent of a kind, with no
 * gradient and no labels. The invented data here has a true grouping, which the lab uses only
 * to score the result; the algorithm never sees it. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export interface Point {
  x: number;
  y: number;
  /** The group the point was generated in. Known only because the data is invented. */
  truth: number;
}

export type Shape = "three" | "uneven" | "rings" | "stripes";
export type Start = "random" | "spread";

export const PLANE = [-1.2, 1.2] as const;

/** Four unlabelled puzzles: three round groups, groups of unequal size, two rings, two stripes. */
export function makePoints(shape: Shape, seed: number, count = 240): Point[] {
  const random = seededRandom(seed);
  const points: Point[] = [];
  const clamp = (value: number) => Math.max(PLANE[0], Math.min(PLANE[1], value));
  for (let index = 0; index < count; index += 1) {
    let x = 0;
    let y = 0;
    let truth = 0;
    if (shape === "three") {
      truth = index % 3;
      const centre = [
        [-0.6, -0.5],
        [0.6, -0.4],
        [0, 0.6],
      ][truth];
      x = centre[0] + 0.22 * normalRandom(random);
      y = centre[1] + 0.22 * normalRandom(random);
    } else if (shape === "uneven") {
      truth = index % 6 === 0 ? 1 : 0;
      x = (truth ? 0.75 : -0.3) + (truth ? 0.12 : 0.4) * normalRandom(random);
      y = (truth ? 0.7 : -0.1) + (truth ? 0.12 : 0.4) * normalRandom(random);
    } else if (shape === "rings") {
      truth = index % 2;
      const radius = truth ? 0.85 + 0.08 * normalRandom(random) : 0.3 * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      x = radius * Math.cos(angle);
      y = radius * Math.sin(angle);
    } else {
      truth = index % 2;
      const along = -1 + 2 * random();
      x = along + 0.08 * normalRandom(random);
      y = along + (truth ? 0.45 : -0.45) + 0.08 * normalRandom(random);
    }
    points.push({ x: clamp(x), y: clamp(y), truth });
  }
  return points;
}

export interface Centre {
  x: number;
  y: number;
}

export interface Round {
  centres: Centre[];
  /** Index of the nearest centre for each point. */
  assignment: number[];
  /** Total squared distance from every point to its centre: the number each round lowers. */
  loss: number;
}

const squaredDistance = (point: Point | Centre, centre: Centre): number =>
  (point.x - centre.x) ** 2 + (point.y - centre.y) ** 2;

function assign(
  points: readonly Point[],
  centres: readonly Centre[],
): { assignment: number[]; loss: number } {
  let loss = 0;
  const assignment = points.map((point) => {
    let best = 0;
    let nearest = Infinity;
    centres.forEach((centre, at) => {
      const distance = squaredDistance(point, centre);
      if (distance < nearest) {
        nearest = distance;
        best = at;
      }
    });
    loss += nearest;
    return best;
  });
  return { assignment, loss };
}

/** Either k points picked at random, or picked far apart from each other (k-means++). */
export function startingCentres(
  points: readonly Point[],
  k: number,
  start: Start,
  random: Random,
): Centre[] {
  const pick = (at: number): Centre => ({ x: points[at].x, y: points[at].y });
  const centres: Centre[] = [pick(Math.floor(random() * points.length))];
  while (centres.length < k) {
    if (start === "random") {
      centres.push(pick(Math.floor(random() * points.length)));
      continue;
    }
    // Spread: a point's chance of being chosen grows with its distance from the centres so far.
    const weights = points.map((point) =>
      Math.min(...centres.map((centre) => squaredDistance(point, centre))),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let remaining = random() * total;
    let chosen = points.length - 1;
    for (let at = 0; at < points.length; at += 1) {
      remaining -= weights[at];
      if (remaining <= 0) {
        chosen = at;
        break;
      }
    }
    centres.push(pick(chosen));
  }
  return centres;
}

// peek:start kmeans
/**
 * Run k-means to a standstill, keeping every round so the lab can step through them. A round
 * is: give each point to its nearest centre, then move each centre to the middle of its points.
 */
export function kMeans(
  points: readonly Point[],
  k: number,
  start: Start,
  seed: number,
  maxRounds = 30,
): Round[] {
  const random = seededRandom(seed);
  let centres = startingCentres(points, k, start, random);
  const rounds: Round[] = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const { assignment, loss } = assign(points, centres);
    rounds.push({ centres, assignment, loss });
    const moved = centres.map((centre, at) => {
      const members = points.filter((_, index) => assignment[index] === at);
      if (members.length === 0) return centre;
      return {
        x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
        y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
      };
    });
    const settled = moved.every((centre, at) => squaredDistance(centre, centres[at]) < 1e-10);
    centres = moved;
    if (settled) break;
  }
  return rounds;
}
// peek:end

/** The best of several runs from different starts: the loss says which, and needs no labels. */
export function bestOfRuns(
  points: readonly Point[],
  k: number,
  start: Start,
  seed: number,
  runs: number,
): Round[] {
  let best: Round[] | undefined;
  for (let run = 0; run < runs; run += 1) {
    const rounds = kMeans(points, k, start, seed + run);
    const last = rounds[rounds.length - 1];
    if (!best || last.loss < best[best.length - 1].loss) best = rounds;
  }
  return best ?? [];
}

/** Final loss for every k in a range: the curve people look at for an "elbow". */
export function elbow(
  points: readonly Point[],
  start: Start,
  seed: number,
  upTo = 8,
  runs = 5,
): number[] {
  return Array.from({ length: upTo }, (_, at) => {
    const rounds = bestOfRuns(points, at + 1, start, seed, runs);
    return rounds[rounds.length - 1].loss;
  });
}

/**
 * How well the found groups match the true ones: the share of points whose cluster's majority
 * true group is their own. Available here only because the data is invented.
 */
export function purity(points: readonly Point[], assignment: readonly number[], k: number): number {
  let right = 0;
  for (let cluster = 0; cluster < k; cluster += 1) {
    const counts = new Map<number, number>();
    points.forEach((point, at) => {
      if (assignment[at] === cluster) counts.set(point.truth, (counts.get(point.truth) ?? 0) + 1);
    });
    right += Math.max(0, ...counts.values());
  }
  return right / points.length;
}
