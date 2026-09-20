/**
 * The capstone: "ship a model you'd trust". A fictional subscription business wants to know
 * which customers are about to cancel. The data has two traps planted in it, both common in
 * real projects:
 *
 *  - a LEAK: "win-back offer sent" is recorded only after a customer has cancelled. It predicts
 *    cancellation almost perfectly in the historical data and will not exist at the moment a
 *    prediction is needed;
 *  - IMBALANCE: only about one customer in six cancels, so a model that says "nobody will"
 *    is about 84% accurate and useless.
 *
 * The learner makes the decisions an engineer would; this module trains the model their way,
 * reports the score they would have reported, and then shows what happens in deployment.
 * Entirely synthetic. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export type SplitPlan = "none" | "two-way" | "three-way";
export type Metric = "accuracy" | "cancellers";
export type Capacity = "lean" | "bloated";

export interface Decisions {
  split: SplitPlan;
  includeLeak: boolean;
  capacity: Capacity;
  metric: Metric;
  threshold: number;
}

export const SENSIBLE: Decisions = {
  split: "three-way",
  includeLeak: false,
  capacity: "lean",
  metric: "cancellers",
  threshold: 0.3,
};

export const NAIVE: Decisions = {
  split: "none",
  includeLeak: true,
  capacity: "bloated",
  metric: "accuracy",
  threshold: 0.5,
};

interface Customer {
  /** Honest signals, then junk columns, then the leak as the last entry. */
  features: number[];
  cancelled: number;
}

const HONEST = ["months as a customer", "support tickets", "logins last month"];
const JUNK = 40;
export const FEATURE_NAMES = { honest: HONEST, junk: JUNK, leak: "win-back offer sent" };

function makeCustomers(count: number, random: Random, deployed: boolean): Customer[] {
  return Array.from({ length: count }, () => {
    const tenure = normalRandom(random);
    const tickets = normalRandom(random);
    const logins = normalRandom(random);
    const risk = -2.45 - 0.9 * tenure + 1.1 * tickets - 0.8 * logins + 0.6 * normalRandom(random);
    const cancelled = random() < 1 / (1 + Math.exp(-risk)) ? 1 : 0;
    const junk = Array.from({ length: JUNK }, () => normalRandom(random));
    // In the archive, nearly every canceller was sent an offer afterwards. At the moment a
    // prediction is needed nobody has cancelled yet, so the column is empty.
    const leak = deployed ? 0 : cancelled ? (random() < 0.96 ? 1 : 0) : random() < 0.01 ? 1 : 0;
    return { features: [tenure, tickets, logins, ...junk, leak], cancelled };
  });
}

function columnsFor(decisions: Decisions): number[] {
  const honest = [0, 1, 2];
  const junk =
    decisions.capacity === "bloated" ? Array.from({ length: JUNK }, (_, i) => 3 + i) : [];
  return [...honest, ...junk, ...(decisions.includeLeak ? [3 + JUNK] : [])];
}

interface Model {
  columns: number[];
  weights: number[];
  bias: number;
}

const squash = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function score(model: Model, customer: Customer): number {
  let z = model.bias;
  model.columns.forEach((column, index) => (z += model.weights[index] * customer.features[column]));
  return squash(z);
}

/** The same neuron as lesson 03 with more inputs, trained by full-batch descent. */
function trainModel(customers: readonly Customer[], columns: number[], steps = 300): Model {
  const model: Model = { columns, weights: columns.map(() => 0), bias: 0 };
  const rate = 0.5;
  for (let step = 0; step < steps; step += 1) {
    const slope = columns.map(() => 0);
    let biasSlope = 0;
    for (const customer of customers) {
      const blame = score(model, customer) - customer.cancelled;
      biasSlope += blame;
      columns.forEach((column, index) => (slope[index] += blame * customer.features[column]));
    }
    model.bias -= (rate * biasSlope) / customers.length;
    slope.forEach((value, index) => (model.weights[index] -= (rate * value) / customers.length));
  }
  return model;
}

export interface Scorecard {
  accuracy: number;
  /** Of customers who cancelled, the share flagged. */
  recall: number;
  /** Of customers flagged, the share who cancelled. */
  precision: number;
  flagged: number;
  count: number;
}

function evaluate(model: Model, customers: readonly Customer[], threshold: number): Scorecard {
  let right = 0;
  let flagged = 0;
  let caught = 0;
  let cancellers = 0;
  for (const customer of customers) {
    const called = score(model, customer) >= threshold;
    if (called) flagged += 1;
    if (customer.cancelled) cancellers += 1;
    if (called && customer.cancelled) caught += 1;
    if (called === (customer.cancelled === 1)) right += 1;
  }
  return {
    accuracy: right / customers.length,
    recall: cancellers ? caught / cancellers : 0,
    precision: flagged ? caught / flagged : 0,
    flagged,
    count: customers.length,
  };
}

export interface Check {
  id: string;
  question: string;
  passed: boolean;
  detail: string;
}

export interface Outcome {
  baseRate: number;
  /** What was scored, in the learner's chosen words. */
  scoredOn: string;
  training: Scorecard;
  reported: Scorecard;
  deployment: Scorecard;
  headline: { label: string; reported: number; deployment: number };
  checks: Check[];
  ready: boolean;
}

const ARCHIVE = 600;
const DEPLOYED = 4000;

/** Train and score the learner's way, then run the result against fresh, leak-free customers. */
export function runCapstone(decisions: Decisions, seed = 20260920): Outcome {
  const random = seededRandom(seed);
  const archive = makeCustomers(ARCHIVE, random, false);
  const future = makeCustomers(DEPLOYED, random, true);
  const cut = (from: number, to: number) => archive.slice(ARCHIVE * from, ARCHIVE * to);
  const train =
    decisions.split === "none" ? archive : cut(0, decisions.split === "two-way" ? 0.8 : 0.6);
  const tuneOn = decisions.split === "three-way" ? cut(0.6, 0.8) : undefined;
  const scoreOn = decisions.split === "none" ? archive : cut(0.8, 1);

  const model = trainModel(train, columnsFor(decisions));
  const training = evaluate(model, train, decisions.threshold);
  const reported = evaluate(model, scoreOn, decisions.threshold);
  const deployment = evaluate(model, future, decisions.threshold);
  const baseRate = archive.filter((customer) => customer.cancelled).length / ARCHIVE;

  const pick = (card: Scorecard) => (decisions.metric === "accuracy" ? card.accuracy : card.recall);
  const headline = {
    label: decisions.metric === "accuracy" ? "accuracy" : "cancellers caught",
    reported: pick(reported),
    deployment: pick(deployment),
  };
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

  const checks: Check[] = [
    {
      id: "unseen",
      question: "Was it scored on customers it never trained on?",
      passed: decisions.split !== "none",
      detail:
        decisions.split === "none"
          ? "No. It was scored on the very customers it trained on, so the score measures memory."
          : "Yes. One fifth of the archive was kept out of training and used for the score.",
    },
    {
      id: "untouched",
      question: "Is there a final set that no decision was tuned against?",
      passed: decisions.split === "three-way",
      detail:
        decisions.split === "three-way"
          ? `Yes. The cut-off was chosen on a separate ${tuneOn?.length ?? 0} customers, and the reported score comes from a set looked at once.`
          : "No. The cut-off and every other choice were judged on the same customers as the reported score, which flatters it.",
    },
    {
      id: "leak",
      question: "Will every input exist at the moment a prediction is needed?",
      passed: !decisions.includeLeak,
      detail: decisions.includeLeak
        ? "No. “Win-back offer sent” is filled in after a customer cancels. It is the answer, written in a different column."
        : "Yes. Tenure, tickets and logins are all known in advance.",
    },
    {
      id: "baseline",
      question: "Does it beat doing nothing, on the measure that matters?",
      passed: deployment.recall >= 0.5 && deployment.precision >= baseRate * 1.8,
      detail: `Saying “nobody will cancel” is ${percent(1 - baseRate)} accurate and catches no one. In deployment this model catches ${percent(deployment.recall)} of cancellers, and ${percent(deployment.precision)} of those it flags really do cancel (against ${percent(baseRate)} by chance).`,
    },
    {
      id: "headline",
      question: "Could a model that does nothing boast the same headline number?",
      passed: decisions.metric === "cancellers",
      detail:
        decisions.metric === "accuracy"
          ? `Yes, nearly. The headline is ${percent(reported.accuracy)} accuracy; flagging nobody at all scores ${percent(1 - baseRate)}. When one outcome is rare, accuracy mostly measures how rare it is.`
          : `No. The headline is the share of cancellers caught, and doing nothing catches 0%.`,
    },
    {
      id: "agreement",
      question: "Do the training score and the held-out score agree?",
      passed: decisions.split !== "none" && training.accuracy - reported.accuracy <= 0.06,
      detail:
        decisions.split === "none"
          ? "They are the same number, because they are the same customers. That is not agreement."
          : `${percent(training.accuracy)} accurate on training against ${percent(reported.accuracy)} held out. ${training.accuracy - reported.accuracy <= 0.06 ? "Close enough that it is not memorising." : "A gap this size is the signature of memorising: too many inputs for this much data."}`,
    },
    {
      id: "deployment",
      question: "Does the reported score survive contact with new customers?",
      passed: headline.reported - headline.deployment <= 0.1,
      detail: `Reported ${percent(headline.reported)} ${headline.label}; on ${DEPLOYED.toLocaleString("en-GB")} new customers it delivers ${percent(headline.deployment)}.`,
    },
  ];

  return {
    baseRate,
    scoredOn:
      decisions.split === "none" ? "the customers it trained on" : "customers held out of training",
    training,
    reported,
    deployment,
    headline,
    checks,
    ready: checks.every((check) => check.passed),
  };
}

/** The one-page summary a careful team would attach to the model. */
export function modelCard(decisions: Decisions, outcome: Outcome): string {
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
  return [
    "MODEL CARD · Cancellation early-warning (fictional)",
    "",
    `Purpose: flag customers likely to cancel, so that someone can call them first.`,
    `Inputs: ${HONEST.join(", ")}${decisions.capacity === "bloated" ? `, plus ${JUNK} unvetted columns` : ""}${decisions.includeLeak ? `, and “${FEATURE_NAMES.leak}”` : ""}.`,
    `Data: 600 archived customers, ${percent(outcome.baseRate)} of whom cancelled. Split: ${decisions.split}.`,
    `Cut-off: flag at ${percent(decisions.threshold)} confidence.`,
    `Reported (${outcome.scoredOn}): accuracy ${percent(outcome.reported.accuracy)}, cancellers caught ${percent(outcome.reported.recall)}, flags that were right ${percent(outcome.reported.precision)}.`,
    `Do-nothing baseline: ${percent(1 - outcome.baseRate)} accurate, catches 0%.`,
    `Checks passed: ${outcome.checks.filter((check) => check.passed).length} of ${outcome.checks.length}.`,
    ...outcome.checks.map((check) => `  [${check.passed ? "x" : " "}] ${check.question}`),
    `Known limits: synthetic data; one snapshot in time; no check for whether flagged customers can actually be retained.`,
  ].join("\n");
}
