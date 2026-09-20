/**
 * The confusable names of machine learning, decoded. Two families cause most of the trouble:
 * which NUMBER is being talked about (a parameter or a hyperparameter), and which DATA a score
 * came from (training, validation or test). Both are settled by one question each.
 * No browser globals.
 */

import { seededRandom } from "../shared/random";

export type SetBy = "descent" | "person";
export type Pile = "training" | "validation" | "test";
export type TestUse = "once" | "pick" | "tune";

export interface Item {
  id: string;
  name: string;
  setBy: SetBy;
  /** The data that is allowed to influence it. */
  judgedOn: Pile;
  example: string;
  why: string;
}

export const ITEMS: readonly Item[] = [
  {
    id: "weights",
    name: "The weights of a network",
    setBy: "descent",
    judgedOn: "training",
    example: "The 105 numbers in the Network Playground.",
    why: "Gradient descent moves them, a little at every step, to lower the loss on training examples. Nobody types them in.",
  },
  {
    id: "embedding",
    name: "A word's embedding",
    setBy: "descent",
    judgedOn: "training",
    example: "The eight numbers that place “queen” in the Embedding Lab.",
    why: "They look like data, but they are knobs like any others: random at first, then moved by descent.",
  },
  {
    id: "learning-rate",
    name: "The learning rate",
    setBy: "person",
    judgedOn: "validation",
    example: "0.05 in the Descent Lab; 0.229 was the edge.",
    why: "Descent cannot choose its own stride. A person tries several and keeps the one that does best on validation data.",
  },
  {
    id: "layers",
    name: "How many layers and neurons",
    setBy: "person",
    judgedOn: "validation",
    example: "One layer of eight, or two?",
    why: "The shape of the machine is decided before training starts. Different shapes are compared on validation data.",
  },
  {
    id: "degree",
    name: "The flexibility of the curve",
    setBy: "person",
    judgedOn: "validation",
    example: "Degree 6 or degree 12 in the Overfitting Lab.",
    why: "Training error always prefers more flexibility, so training data cannot be allowed to choose it.",
  },
  {
    id: "threshold",
    name: "The cut-off for saying yes",
    setBy: "person",
    judgedOn: "validation",
    example: "Flag a customer at 30% confidence, or 50%?",
    why: "It encodes what each kind of mistake costs, which is a fact about the business, not about the data.",
  },
  {
    id: "stopping",
    name: "When to stop training",
    setBy: "person",
    judgedOn: "validation",
    example: "Stop when held-out surprise starts to rise.",
    why: "Training loss keeps falling long after the model has started to memorise. Only unseen data shows the turn.",
  },
];

export interface ItemVerdict {
  kind: "parameter" | "hyperparameter";
  setBy: string;
  judgedOn: string;
  never: string;
}

export function decode(item: Item): ItemVerdict {
  const parameter = item.setBy === "descent";
  return {
    kind: parameter ? "parameter" : "hyperparameter",
    setBy: parameter
      ? "Gradient descent, from training examples"
      : "A person, before or around training",
    judgedOn: parameter
      ? "The training pile shapes it directly"
      : "Compared on the validation pile, never on training error",
    never: "The test pile. Nothing is ever chosen by looking at it.",
  };
}

export interface BiasResult {
  /** The accuracy every candidate really has. */
  truth: number;
  /** The best score seen among the candidates on this test set. */
  reported: number;
  /** How that winner does on a fresh test set of the same size. */
  fresh: number;
  candidates: number;
  testSize: number;
}

/**
 * Twenty models that are all exactly as good as each other are scored on one test set. Each
 * score wobbles by chance. Report the best, and you have reported the luckiest wobble.
 */
export function selectionBias(candidates: number, testSize: number, seed: number, truth = 0.8) {
  const random = seededRandom(seed);
  const scoreOnce = () => {
    let right = 0;
    for (let index = 0; index < testSize; index += 1) if (random() < truth) right += 1;
    return right / testSize;
  };
  let reported = 0;
  for (let candidate = 0; candidate < candidates; candidate += 1)
    reported = Math.max(reported, scoreOnce());
  return { truth, reported, fresh: scoreOnce(), candidates, testSize } satisfies BiasResult;
}

/** The average inflation over many repeats, so the lesson does not rest on one lucky seed. */
export function averageInflation(candidates: number, testSize: number, repeats = 400): number {
  let total = 0;
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const result = selectionBias(candidates, testSize, 1000 + repeat);
    total += result.reported - result.truth;
  }
  return total / repeats;
}

export const TEST_USES: Record<TestUse, { label: string; candidates: number; verdict: string }> = {
  once: {
    label: "Looked at it once, at the very end",
    candidates: 1,
    verdict: "Honest. The score is an unbiased estimate, wobble and all.",
  },
  pick: {
    label: "Scored 20 models on it and reported the best",
    candidates: 20,
    verdict: "Flattering. You reported the luckiest of twenty wobbles, not a better model.",
  },
  tune: {
    label: "Tuned on it over 200 tries until the number stopped improving",
    candidates: 200,
    verdict:
      "Contaminated. The test set has become a second training set; its score no longer means anything.",
  },
};
