/**
 * How a model comes to treat two groups differently, with nobody intending it.
 *
 * A lender has years of past decisions and trains a model to reproduce them. Every applicant has
 * a true ability to repay, which nobody observes directly; a test score that measures it
 * noisily; a neighbourhood, which says nothing about ability but may say a good deal about
 * which group they belong to; and the group itself, Blue or Orange. The past decisions were
 * made by people who could see the applicant, and who may have marked Orange applicants down.
 *
 * The population is invented, so the truth is known, and every rate the lab reports is measured
 * on fresh applicants against that truth. The model is the single neuron of lesson 03, trained
 * by the descent of lesson 01. No browser globals.
 */

import { normalRandom, seededRandom } from "../shared/random";

export type Group = 0 | 1;
export const GROUP_NAMES = ["Blue", "Orange"] as const;

export type Columns = "score" | "score-area" | "score-area-group";
export type Policy = "single" | "same-rate" | "same-chance";

export interface World {
  /** How far the people who made the past decisions marked Orange applicants down, 0 to 1. */
  prejudice: number;
  /** How well neighbourhood reveals group, 0 (not at all) to 1 (almost perfectly). */
  proxy: number;
  /** How much of a head start Blue applicants had in life before applying, 0 to 1. */
  headStart: number;
}

export interface Applicant {
  group: Group;
  score: number;
  area: number;
  /** Would in fact repay. Known here only because the population is invented. */
  able: boolean;
  /** What the lender's staff decided in the past. This is the label the model is trained on. */
  approvedBefore: boolean;
}

const PREJUDICE_PENALTY = 1.2;
const HEAD_START = 1;
const AREA_SPREAD = 1.6;

export function applicants(world: World, count: number, seed: number): Applicant[] {
  const random = seededRandom(seed);
  const people: Applicant[] = [];
  for (let at = 0; at < count; at += 1) {
    const group: Group = random() < 0.5 ? 0 : 1;
    const ability =
      normalRandom(random) + (group === 0 ? 0.5 : -0.5) * HEAD_START * world.headStart;
    const impression = ability + 0.5 * normalRandom(random);
    people.push({
      group,
      score: ability + 0.7 * normalRandom(random),
      area: (group === 0 ? -1 : 1) * AREA_SPREAD * world.proxy + normalRandom(random),
      able: ability + 0.5 * normalRandom(random) > 0,
      approvedBefore: impression - PREJUDICE_PENALTY * world.prejudice * group > 0,
    });
  }
  return people;
}

export const FEATURE_NAMES = ["test score", "neighbourhood", "group"] as const;

function featuresOf(person: Applicant, columns: Columns): number[] {
  if (columns === "score") return [person.score];
  if (columns === "score-area") return [person.score, person.area];
  return [person.score, person.area, person.group === 1 ? 1 : -1];
}

export interface Model {
  columns: Columns;
  weights: number[];
  bias: number;
}

const squash = (value: number): number => 1 / (1 + Math.exp(-value));

export function confidence(model: Model, person: Applicant): number {
  const features = featuresOf(person, model.columns);
  let sum = model.bias;
  for (let at = 0; at < features.length; at += 1) sum += model.weights[at] * features[at];
  return squash(sum);
}

// peek:start fairness
/**
 * One neuron, trained to agree with the past decisions. Nothing here mentions fairness, and
 * nothing here is unfair: it lowers its loss on the labels it was given, as every model in this
 * course does. If the labels carry a prejudice, agreeing with them is the prejudice.
 */
export function train(
  people: readonly Applicant[],
  columns: Columns,
  steps = 400,
  rate = 0.5,
): Model {
  const rows = people.map((person) => featuresOf(person, columns));
  const model: Model = { columns, weights: rows[0].map(() => 0), bias: 0 };
  for (let step = 0; step < steps; step += 1) {
    const slope = model.weights.map(() => 0);
    let biasSlope = 0;
    rows.forEach((features, at) => {
      let sum = model.bias;
      for (let f = 0; f < features.length; f += 1) sum += model.weights[f] * features[f];
      // Blame: how far the model's confidence is from what the staff decided.
      const blame = squash(sum) - (people[at].approvedBefore ? 1 : 0);
      for (let f = 0; f < features.length; f += 1) slope[f] += blame * features[f];
      biasSlope += blame;
    });
    for (let f = 0; f < slope.length; f += 1) model.weights[f] -= (rate * slope[f]) / rows.length;
    model.bias -= (rate * biasSlope) / rows.length;
  }
  return model;
}
// peek:end

export interface GroupReport {
  people: number;
  /** Share of the group approved. */
  approved: number;
  /** Of those in the group who would repay, the share approved. */
  ableApproved: number;
  /** Of those in the group who would not repay, the share approved. */
  unableApproved: number;
  /** Of those in the group who were approved, the share who would repay. */
  approvedAble: number;
  cutOff: number;
}

export interface Report {
  groups: [GroupReport, GroupReport];
  /** Share of decisions that match what the staff would have decided. */
  agreesWithPast: number;
  /** Share of decisions that match who would in fact repay. */
  agreesWithTruth: number;
}

function rates(scored: readonly { person: Applicant; confidence: number }[], cutOff: number) {
  let approved = 0;
  let able = 0;
  let ableApproved = 0;
  let unableApproved = 0;
  for (const { person, confidence: value } of scored) {
    const yes = value >= cutOff;
    if (yes) approved += 1;
    if (person.able) able += 1;
    if (yes && person.able) ableApproved += 1;
    if (yes && !person.able) unableApproved += 1;
  }
  const count = scored.length || 1;
  return {
    people: scored.length,
    approved: approved / count,
    ableApproved: ableApproved / (able || 1),
    unableApproved: unableApproved / (count - able || 1),
    approvedAble: ableApproved / (approved || 1),
    cutOff,
  };
}

/** The cut-off at which a group's `measure` comes closest to `target`. */
function cutOffFor(
  scored: readonly { person: Applicant; confidence: number }[],
  measure: "approved" | "ableApproved",
  target: number,
): number {
  let best = 0.5;
  let nearest = Infinity;
  for (let step = 1; step < 200; step += 1) {
    const cutOff = step / 200;
    const miss = Math.abs(rates(scored, cutOff)[measure] - target);
    if (miss < nearest) {
      nearest = miss;
      best = cutOff;
    }
  }
  return best;
}

/**
 * Decide on fresh applicants and measure the result for each group.
 * - "single": one cut-off, 50%, for everybody.
 * - "same-rate": a cut-off per group, set so both are approved at the rate the single cut-off
 *   approves people overall.
 * - "same-chance": a cut-off per group, set so that someone who would repay has the same chance
 *   of approval in either group.
 */
export function judge(model: Model, people: readonly Applicant[], policy: Policy): Report {
  const scored = people.map((person) => ({ person, confidence: confidence(model, person) }));
  const byGroup = [0, 1].map((group) => scored.filter((entry) => entry.person.group === group));
  const overall = rates(scored, 0.5);
  const cutOffs =
    policy === "single"
      ? [0.5, 0.5]
      : byGroup.map((members) =>
          policy === "same-rate"
            ? cutOffFor(members, "approved", overall.approved)
            : cutOffFor(members, "ableApproved", overall.ableApproved),
        );
  let past = 0;
  let truth = 0;
  for (const { person, confidence: value } of scored) {
    const yes = value >= cutOffs[person.group];
    if (yes === person.approvedBefore) past += 1;
    if (yes === person.able) truth += 1;
  }
  return {
    groups: [rates(byGroup[0], cutOffs[0]), rates(byGroup[1], cutOffs[1])],
    agreesWithPast: past / scored.length,
    agreesWithTruth: truth / scored.length,
  };
}

export const TRAINING_SEED = 11;
export const FRESH_SEED = 29;

/** The whole experiment: train on past decisions, then decide on applicants never seen. */
export function experiment(world: World, columns: Columns, policy: Policy, seed = 0) {
  const model = train(applicants(world, 3000, TRAINING_SEED + seed), columns);
  const report = judge(model, applicants(world, 6000, FRESH_SEED + seed), policy);
  return { model, report };
}
