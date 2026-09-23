import { describe, expect, it } from "vitest";
import { makeDataset, splitDataset, type DatasetKind } from "../network/engine";
import { seededRandom } from "../shared/random";
import {
  depthOf,
  ensembleAccuracy,
  ensembleProbability,
  fitBoosting,
  fitForest,
  fitTree,
  growTree,
  leafCount,
  pathOf,
  questionCount,
  treeValue,
} from "./engine";

const SEED = 20260920;
function puzzle(kind: DatasetKind, flipped = 0.1) {
  const random = seededRandom(SEED + 1);
  const all = makeDataset(kind, SEED, 400, 0.15).map((point) =>
    random() < flipped ? { ...point, label: 1 - point.label } : point,
  );
  return splitDataset(all);
}
const scores = (model: ReturnType<typeof fitTree>, data: ReturnType<typeof puzzle>) => ({
  seen: ensembleAccuracy(model, data.train),
  unseen: ensembleAccuracy(model, data.heldOut),
});

describe("growing a tree", () => {
  it("splits where the classes part, and predicts the leaf's share", () => {
    const points = [-1, -0.5, -0.2, 0.3, 0.6, 1].map((x, at) => ({
      x,
      y: 0,
      label: at < 3 ? 0 : 1,
    }));
    const tree = growTree(
      points,
      points.map((point) => point.label),
      3,
      1,
    );
    expect(tree.leaf).toBe(false);
    if (tree.leaf) return;
    expect(tree.feature).toBe(0);
    expect(tree.split).toBeCloseTo(0.05, 6);
    expect(treeValue(tree, -0.9, 0)).toBe(0);
    expect(treeValue(tree, 0.9, 0)).toBe(1);
    expect(leafCount(tree)).toBe(2);
    expect(pathOf(tree, 0.9, 0)).toEqual(["input 1 at least 0.05"]);
  });

  it("respects the depth limit and stops when nothing is gained", () => {
    const { train } = puzzle("spiral");
    for (const depth of [1, 3, 6])
      expect(depthOf(fitTree(train, depth).trees[0])).toBeLessThanOrEqual(depth);
    const pure = train.map((point) => ({ ...point, label: 1 }));
    expect(
      growTree(
        pure,
        pure.map(() => 1),
        5,
      ).leaf,
    ).toBe(true);
  });

  it("is deterministic, including the forest's reshuffling", () => {
    const { train } = puzzle("xor");
    expect(fitForest(train, 3, 10)).toEqual(fitForest(train, 3, 10));
    expect(fitBoosting(train, 2, 10, 0.3)).toEqual(fitBoosting(train, 2, 10, 0.3));
  });
});

describe("what the lesson and lab claim", () => {
  it("one question is one axis-parallel cut, and cannot solve opposite corners", () => {
    const data = puzzle("xor");
    const stump = fitTree(data.train, 1);
    expect(questionCount(stump)).toBe(1);
    expect(scores(stump, data).unseen).toBeLessThan(0.6);
  });

  it("a deep tree memorises flipped labels; a forest of equally deep trees recovers", () => {
    for (const kind of ["xor", "circle", "spiral"] as const) {
      const data = puzzle(kind);
      const shallow = scores(fitTree(data.train, 4), data);
      const deep = scores(fitTree(data.train, 12), data);
      const forest = scores(fitForest(data.train, 12, 50), data);
      expect(deep.seen, kind).toBeGreaterThan(shallow.seen);
      expect(deep.seen - deep.unseen, kind).toBeGreaterThan(0.08);
      const bigger = scores(fitForest(data.train, 12, 200), data);
      expect(Math.abs(bigger.unseen - forest.unseen), kind).toBeLessThanOrEqual(0.03);
      // The spiral is too twisted for four questions, so there the deep tree still scores
      // higher, and a forest of deep trees does not beat it. The lab's prose makes no claim
      // for the spiral; these claims are for the ring and opposite corners.
      if (kind === "spiral") continue;
      expect(deep.unseen, kind).toBeLessThan(shallow.unseen);
      expect(deep.seen - deep.unseen, kind).toBeGreaterThan(shallow.seen - shallow.unseen + 0.05);
      expect(forest.unseen, kind).toBeGreaterThan(deep.unseen + 0.04);
    }
  });

  it("boosted stumps draw the ring but never opposite corners; a second question fixes that", () => {
    const ring = puzzle("circle", 0);
    expect(scores(fitBoosting(ring.train, 1, 100, 0.3), ring).unseen).toBeGreaterThan(0.9);
    const corners = puzzle("xor", 0);
    expect(scores(fitBoosting(corners.train, 1, 200, 0.3), corners).unseen).toBeLessThan(0.6);
    expect(scores(fitBoosting(corners.train, 2, 200, 0.3), corners).unseen).toBeGreaterThan(0.88);
  });

  it("gives probabilities between 0 and 1 that use only the trees asked for", () => {
    const { train } = puzzle("circle");
    const model = fitBoosting(train, 2, 30, 0.3);
    const p = ensembleProbability(model, 0, 0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(ensembleProbability(model, 0, 0, 1)).not.toBe(p);
    expect(ensembleProbability(model, 0, 0, 30)).toBe(p);
  });
});
