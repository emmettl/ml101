/**
 * Decision trees, and two ways of combining many of them. A tree asks a question about one
 * input ("is input 1 below 0.3?"), then another in each branch, until it reaches a leaf that
 * gives an answer. Nothing is trained by descent: each question is chosen greedily, as the
 * single split that best sorts the examples it sees. That makes a tree readable, quick, and
 * prone to memorising, and it makes the boundary it draws a set of boxes.
 *
 * A forest grows many trees on reshuffled copies of the data and averages them. Boosting grows
 * them one after another, each fitted to the mistakes of the ones before. Works on the same
 * two-class puzzles as the Network Playground. No browser globals.
 */

import type { LabelledPoint } from "../network/engine";
import { seededRandom } from "../shared/random";

export type Tree =
  | { leaf: true; value: number; count: number }
  | { leaf: false; feature: 0 | 1; split: number; left: Tree; right: Tree; count: number };

export const FEATURE_NAMES = ["input 1", "input 2"] as const;

const featureOf = (point: LabelledPoint, feature: 0 | 1): number =>
  feature === 0 ? point.x : point.y;

/** Squared error of predicting the mean, times the count: what a split tries to reduce. */
function impurity(targets: readonly number[]): number {
  if (targets.length === 0) return 0;
  const mean = targets.reduce((sum, value) => sum + value, 0) / targets.length;
  return targets.reduce((sum, value) => sum + (value - mean) ** 2, 0);
}

// peek:start tree
/**
 * Grow a tree that predicts `targets` (0/1 labels, or residuals when boosting) from the points.
 * At every node try every midpoint between neighbouring values of each input, keep the split
 * that leaves the two sides purest, and recurse until the depth runs out or a side is too small.
 */
export function growTree(
  points: readonly LabelledPoint[],
  targets: readonly number[],
  maxDepth: number,
  minLeaf = 2,
  depth = 0,
): Tree {
  const count = points.length;
  const mean = targets.reduce((sum, value) => sum + value, 0) / (count || 1);
  const leaf: Tree = { leaf: true, value: mean, count };
  if (depth >= maxDepth || count < 2 * minLeaf) return leaf;
  const before = impurity(targets);
  let best: { feature: 0 | 1; split: number; gain: number } | undefined;
  for (const feature of [0, 1] as const) {
    const order = points
      .map((_, at) => at)
      .sort((a, b) => featureOf(points[a], feature) - featureOf(points[b], feature));
    // Walk the sorted points once, moving one at a time from the right side to the left.
    let leftSum = 0;
    let leftSquares = 0;
    let rightSum = targets.reduce((sum, value) => sum + value, 0);
    let rightSquares = targets.reduce((sum, value) => sum + value * value, 0);
    for (let taken = 1; taken < count; taken += 1) {
      const moved = targets[order[taken - 1]];
      leftSum += moved;
      leftSquares += moved * moved;
      rightSum -= moved;
      rightSquares -= moved * moved;
      if (taken < minLeaf || count - taken < minLeaf) continue;
      const here = featureOf(points[order[taken - 1]], feature);
      const next = featureOf(points[order[taken]], feature);
      if (here === next) continue;
      const after =
        leftSquares -
        (leftSum * leftSum) / taken +
        (rightSquares - (rightSum * rightSum) / (count - taken));
      const gain = before - after;
      if (!best || gain > best.gain) best = { feature, split: (here + next) / 2, gain };
    }
  }
  if (!best || best.gain <= 1e-9) return leaf;
  const chosen = best;
  const goesLeft = points.map((point) => featureOf(point, chosen.feature) < chosen.split);
  const side = (left: boolean) => ({
    points: points.filter((_, at) => goesLeft[at] === left),
    targets: targets.filter((_, at) => goesLeft[at] === left),
  });
  const left = side(true);
  const right = side(false);
  return {
    leaf: false,
    feature: chosen.feature,
    split: chosen.split,
    count,
    left: growTree(left.points, left.targets, maxDepth, minLeaf, depth + 1),
    right: growTree(right.points, right.targets, maxDepth, minLeaf, depth + 1),
  };
}

/** Follow the questions down to a leaf. */
export function treeValue(tree: Tree, x: number, y: number): number {
  let node = tree;
  while (!node.leaf) node = (node.feature === 0 ? x : y) < node.split ? node.left : node.right;
  return node.value;
}
// peek:end

/** The questions asked on the way to a leaf, for showing a tree's reasoning about one point. */
export function pathOf(tree: Tree, x: number, y: number): string[] {
  const steps: string[] = [];
  let node = tree;
  while (!node.leaf) {
    const value = node.feature === 0 ? x : y;
    const left = value < node.split;
    steps.push(
      `${FEATURE_NAMES[node.feature]} ${left ? "below" : "at least"} ${node.split.toFixed(2)}`,
    );
    node = left ? node.left : node.right;
  }
  return steps;
}

export function leafCount(tree: Tree): number {
  return tree.leaf ? 1 : leafCount(tree.left) + leafCount(tree.right);
}

export function depthOf(tree: Tree): number {
  return tree.leaf ? 0 : 1 + Math.max(depthOf(tree.left), depthOf(tree.right));
}

export type Method = "tree" | "forest" | "boosting";

export interface Ensemble {
  method: Method;
  trees: Tree[];
  /** Boosting: the log-odds every prediction starts from, and the step size per tree. */
  base: number;
  rate: number;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** A single tree on the labels themselves. */
export function fitTree(points: readonly LabelledPoint[], depth: number): Ensemble {
  const labels = points.map((point) => point.label);
  return { method: "tree", trees: [growTree(points, labels, depth)], base: 0, rate: 1 };
}

/** Many trees, each on a bootstrap sample (drawn with replacement) of the training points. */
export function fitForest(
  points: readonly LabelledPoint[],
  depth: number,
  count: number,
  seed = 3,
): Ensemble {
  const random = seededRandom(seed);
  const trees: Tree[] = [];
  for (let at = 0; at < count; at += 1) {
    const sample = Array.from(
      { length: points.length },
      () => points[Math.floor(random() * points.length)],
    );
    trees.push(
      growTree(
        sample,
        sample.map((point) => point.label),
        depth,
      ),
    );
  }
  return { method: "forest", trees, base: 0, rate: 1 };
}

// peek:start boosting
/**
 * Gradient boosting. Start from the base rate. Then, over and over: see how far each prediction
 * is from its label (the residual, which is the slope of the loss, as in lesson 03), fit a small
 * tree to those residuals, and take a step in its direction. Each tree corrects the ones before.
 */
export function fitBoosting(
  points: readonly LabelledPoint[],
  depth: number,
  count: number,
  rate: number,
): Ensemble {
  const positives = points.filter((point) => point.label === 1).length;
  const base = Math.log((positives + 0.5) / (points.length - positives + 0.5));
  const scores = points.map(() => base);
  const trees: Tree[] = [];
  for (let at = 0; at < count; at += 1) {
    const residuals = points.map((point, index) => point.label - sigmoid(scores[index]));
    const tree = growTree(points, residuals, depth);
    trees.push(tree);
    points.forEach((point, index) => (scores[index] += rate * treeValue(tree, point.x, point.y)));
  }
  return { method: "boosting", trees, base, rate };
}
// peek:end

/** Probability of class 1 at a point, using the first `upTo` trees (all by default). */
export function ensembleProbability(
  model: Ensemble,
  x: number,
  y: number,
  upTo = model.trees.length,
): number {
  const used = model.trees.slice(0, upTo);
  if (model.method === "boosting") {
    let score = model.base;
    for (const tree of used) score += model.rate * treeValue(tree, x, y);
    return sigmoid(score);
  }
  let total = 0;
  for (const tree of used) total += treeValue(tree, x, y);
  return used.length ? total / used.length : 0.5;
}

export function ensembleAccuracy(
  model: Ensemble,
  points: readonly LabelledPoint[],
  upTo?: number,
): number {
  let right = 0;
  for (const point of points)
    if ((ensembleProbability(model, point.x, point.y, upTo) >= 0.5 ? 1 : 0) === point.label)
      right += 1;
  return right / points.length;
}

/** Total questions (internal nodes) across all trees: the size of the machine. */
export function questionCount(model: Ensemble): number {
  return model.trees.reduce((sum, tree) => sum + leafCount(tree) - 1, 0);
}
