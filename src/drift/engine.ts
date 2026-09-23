/**
 * What happens to a model after it ships. Training stops; the world does not. A model that
 * predicts which customers will cancel is trained once on six months of data and then left to
 * run for three years while the customers, or the reasons they cancel, change under it.
 *
 * Two kinds of change are kept apart on purpose, because they look different to anyone
 * watching. When the customers change, the inputs move and a monitor on the inputs sees it,
 * but a model that learned the right rule keeps applying it. When the reason changes, the
 * inputs look exactly as they always did and only the labels, which arrive months late, can
 * show that the rule has rotted. The model is the neuron of lesson 03. No browser globals.
 */

import { normalRandom, seededRandom, type Random } from "../shared/random";

export type Scenario = "steady" | "customers" | "reason" | "sudden";
export type Retraining = "never" | "schedule" | "inputs" | "accuracy";

export const MONTHS = 36;
export const TRAINING_MONTHS = 6;
export const PER_MONTH = 800;
export const FEATURE_NAMES = ["months as a customer", "support tickets", "logins last month"];

interface Customer {
  features: number[];
  cancelled: 0 | 1;
}

/** The world in a given month: where the inputs sit, and what they mean. */
interface Truth {
  means: number[];
  weights: number[];
  bias: number;
}

const AT_LAUNCH: Truth = { means: [0, 0, 0], weights: [-0.9, 1.1, -0.8], bias: -1.2 };
/**
 * Once support tickets become the way customers ask for new features, a ticket stops meaning
 * a customer on the way out and starts meaning an engaged one.
 */
const NEW_REASON = { weights: [-0.9, -1.1, -0.8], bias: -1.2 };
/** A new app: logins climb for everyone, and newer customers keep arriving. */
const NEW_CUSTOMERS = [-1.2, 0, 2.4];

function truthFor(scenario: Scenario, month: number): Truth {
  const progress = Math.max(0, Math.min(1, (month - TRAINING_MONTHS) / (MONTHS - TRAINING_MONTHS)));
  const mix = (from: number, to: number, share: number) => from + (to - from) * share;
  if (scenario === "customers")
    return {
      ...AT_LAUNCH,
      means: AT_LAUNCH.means.map((mean, at) => mix(mean, NEW_CUSTOMERS[at], progress)),
    };
  if (scenario === "reason")
    return {
      means: AT_LAUNCH.means,
      weights: AT_LAUNCH.weights.map((weight, at) => mix(weight, NEW_REASON.weights[at], progress)),
      bias: mix(AT_LAUNCH.bias, NEW_REASON.bias, progress),
    };
  if (scenario === "sudden")
    return month >= BREAK_MONTH ? { means: AT_LAUNCH.means, ...NEW_REASON } : AT_LAUNCH;
  return AT_LAUNCH;
}

const squash = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function customersFor(truth: Truth, random: Random): Customer[] {
  return Array.from({ length: PER_MONTH }, () => {
    const features = truth.means.map((mean) => mean + normalRandom(random));
    let risk = truth.bias + 0.5 * normalRandom(random);
    features.forEach((value, at) => (risk += truth.weights[at] * value));
    return { features, cancelled: random() < squash(risk) ? 1 : 0 };
  });
}

export interface Model {
  weights: number[];
  bias: number;
  /** Where each input sat in the data it was trained on, for the input monitor. */
  means: number[];
  spreads: number[];
  /** The month the model went live, and the last month of data it saw. */
  trainedAt: number;
  dataUpTo: number;
  /** Its accuracy on its own training data: the figure the team had at launch. */
  trainingAccuracy: number;
}

function meansAndSpreads(rows: readonly number[][]): { means: number[]; spreads: number[] } {
  const width = rows[0].length;
  const means = Array.from(
    { length: width },
    (_, at) => rows.reduce((sum, row) => sum + row[at], 0) / rows.length,
  );
  const spreads = means.map((mean, at) =>
    Math.sqrt(rows.reduce((sum, row) => sum + (row[at] - mean) ** 2, 0) / rows.length),
  );
  return { means, spreads };
}

// peek:start drift
/** Lesson 03's neuron, trained by descent on whatever labelled months it is given. */
export function train(
  customers: readonly Customer[],
  trainedAt: number,
  dataUpTo: number,
  steps = 200,
): Model {
  const width = customers[0].features.length;
  const model: Model = {
    weights: Array(width).fill(0) as number[],
    bias: 0,
    ...meansAndSpreads(customers.map((c) => c.features)),
    trainedAt,
    dataUpTo,
    trainingAccuracy: 0,
  };
  const rate = 0.5;
  for (let step = 0; step < steps; step += 1) {
    const slope = Array(width).fill(0) as number[];
    let biasSlope = 0;
    for (const customer of customers) {
      const blame = predict(model, customer.features) - customer.cancelled;
      biasSlope += blame;
      customer.features.forEach((value, at) => (slope[at] += blame * value));
    }
    model.bias -= (rate * biasSlope) / customers.length;
    slope.forEach((value, at) => (model.weights[at] -= (rate * value) / customers.length));
  }
  model.trainingAccuracy = accuracyOf(model, customers);
  return model;
}

export function predict(model: Model, features: readonly number[]): number {
  let z = model.bias;
  features.forEach((value, at) => (z += model.weights[at] * value));
  return squash(z);
}

/**
 * The input monitor: how far this month's inputs sit from where the training data sat, in
 * standard deviations, averaged over the columns. It needs no labels, so it can run today.
 */
export function inputShift(model: Model, customers: readonly Customer[]): number {
  const { means } = meansAndSpreads(customers.map((c) => c.features));
  return (
    means.reduce((sum, mean, at) => sum + Math.abs(mean - model.means[at]) / model.spreads[at], 0) /
    means.length
  );
}
// peek:end

export interface MonthReport {
  month: number;
  /** Share of this month's predictions that were right. Known only once the labels arrive. */
  accuracy: number;
  /** What a model that knew this month's true rule would have scored: the best possible. */
  ceiling: number;
  /** Share of customers who really cancelled. */
  cancelRate: number;
  /** Share the model flagged as likely to cancel. */
  flagged: number;
  shift: number;
  /** True if the retraining rule called for a new model this month. */
  alarm: boolean;
  /** True if a new model went live this month. */
  retrained: boolean;
  /** True if the accuracy of this month is known by the end of the run. */
  labelled: boolean;
}

export interface Settings {
  scenario: Scenario;
  retraining: Retraining;
  /** Months between a prediction and learning whether it was right. */
  labelDelay: number;
}

export const SHIFT_ALARM = 0.5;
export const ACCURACY_ALARM = 0.05;
export const SCHEDULE = 6;
/** The month the "sudden" scenario breaks: a year after launch. */
export const BREAK_MONTH = 18;

export interface Run {
  months: MonthReport[];
  launchAccuracy: number;
  retrains: number;
}

/** Train on the first six months, then run for three years, retraining as the rule says. */
export function simulate(settings: Settings, seed = 7): Run {
  const random = seededRandom(seed);
  const history: Customer[][] = [];
  for (let month = 0; month < MONTHS; month += 1)
    history.push(customersFor(truthFor(settings.scenario, month), random));
  const trainOn = (upTo: number, at: number) =>
    train(history.slice(Math.max(0, upTo - TRAINING_MONTHS), upTo).flat(), at, upTo);
  let model = trainOn(TRAINING_MONTHS, TRAINING_MONTHS);
  const launchAccuracy = model.trainingAccuracy;
  const months: MonthReport[] = [];
  let retrains = 0;
  for (let month = TRAINING_MONTHS; month < MONTHS; month += 1) {
    const customers = history[month];
    const shift = inputShift(model, customers);
    // What the team can know this month: the inputs now, and the labels of months ago.
    const labelledUpTo = month - settings.labelDelay;
    const known = months.find((report) => report.month === labelledUpTo - 1);
    const alarm =
      settings.retraining === "inputs"
        ? shift > SHIFT_ALARM
        : settings.retraining === "accuracy"
          ? known !== undefined && known.accuracy < model.trainingAccuracy - ACCURACY_ALARM
          : settings.retraining === "schedule" &&
            (month - TRAINING_MONTHS) % SCHEDULE === 0 &&
            month > TRAINING_MONTHS;
    let retrained = false;
    // Retraining needs six months of labelled data the current model has not already seen.
    if (alarm && labelledUpTo - model.dataUpTo >= TRAINING_MONTHS) {
      model = trainOn(labelledUpTo, month);
      retrains += 1;
      retrained = true;
    }
    const flagged =
      customers.filter((c) => predict(model, c.features) >= 0.5).length / customers.length;
    const truth = truthFor(settings.scenario, month);
    const oracle: Model = { ...model, weights: truth.weights, bias: truth.bias };
    months.push({
      month,
      accuracy: accuracyOf(model, customers),
      ceiling: accuracyOf(oracle, customers),
      cancelRate: customers.filter((c) => c.cancelled).length / customers.length,
      flagged,
      shift: retrained ? inputShift(model, customers) : shift,
      alarm,
      retrained,
      labelled: month + settings.labelDelay < MONTHS,
    });
  }
  return { months, launchAccuracy, retrains };
}

function accuracyOf(model: Model, customers: readonly Customer[]): number {
  let right = 0;
  for (const customer of customers)
    if ((predict(model, customer.features) >= 0.5 ? 1 : 0) === customer.cancelled) right += 1;
  return right / customers.length;
}
