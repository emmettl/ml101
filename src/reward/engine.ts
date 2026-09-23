/**
 * Learning from consequences. No labels, no answer key: an agent moves about a small grid,
 * collects rewards, and has to work out for itself which moves were to blame for them. The
 * knobs are a table of guesses, one per square and direction, of how much reward is still to
 * come. Each move updates one guess towards what actually happened plus the best guess from
 * the next square, which is descent on the squared error of a prediction whose target the
 * agent also makes. The world is the cliff walk of Sutton and Barto: the shortest path runs
 * along the cliff's edge, and one slip costs dearly. No browser globals.
 */

import { seededRandom, type Random } from "../shared/random";

export const COLUMNS = 8;
export const ROWS = 5;
export const START = { column: 0, row: ROWS - 1 };
export const GOAL = { column: COLUMNS - 1, row: ROWS - 1 };

export const ACTIONS = ["up", "right", "down", "left"] as const;
export type Action = (typeof ACTIONS)[number];
const MOVES: Record<Action, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

export const STEP_REWARD = -1;
export const CLIFF_REWARD = -100;
export const GOAL_REWARD = 20;

export type Cell = "floor" | "cliff" | "start" | "goal";

export function cellAt(column: number, row: number): Cell {
  if (column === START.column && row === START.row) return "start";
  if (column === GOAL.column && row === GOAL.row) return "goal";
  if (row === ROWS - 1) return "cliff";
  return "floor";
}

export const index = (column: number, row: number): number => row * COLUMNS + column;

export interface Settings {
  algorithm: "q-learning" | "sarsa";
  /** How often the agent tries a random move instead of its best guess. */
  exploration: number;
  /** How far each guess moves towards what happened. */
  learningRate: number;
  /** How much a reward next turn is worth compared with one now. */
  discount: number;
}

export interface Outcome {
  /** Total reward per episode. */
  returns: number[];
  /** Falls off the cliff, per episode. */
  falls: number[];
  /** One row per square, one guess per action. */
  table: Float64Array;
  /** The route the greedy policy takes from the start, as square indices, until it ends or loops. */
  route: number[];
  routeReward: number;
  routeEnds: "goal" | "cliff" | "loop";
}

/** Where a move leads, what it pays, and whether the episode is over. */
function step(
  column: number,
  row: number,
  action: Action,
): { column: number; row: number; reward: number; done: boolean } {
  const [dx, dy] = MOVES[action];
  const nextColumn = Math.max(0, Math.min(COLUMNS - 1, column + dx));
  const nextRow = Math.max(0, Math.min(ROWS - 1, row + dy));
  const cell = cellAt(nextColumn, nextRow);
  if (cell === "cliff")
    return { column: START.column, row: START.row, reward: CLIFF_REWARD, done: false };
  if (cell === "goal") return { column: nextColumn, row: nextRow, reward: GOAL_REWARD, done: true };
  return { column: nextColumn, row: nextRow, reward: STEP_REWARD, done: false };
}

function best(table: Float64Array, square: number): number {
  let chosen = 0;
  for (let action = 1; action < ACTIONS.length; action += 1)
    if (table[square * ACTIONS.length + action] > table[square * ACTIONS.length + chosen])
      chosen = action;
  return chosen;
}

function choose(table: Float64Array, square: number, exploration: number, random: Random): number {
  return random() < exploration ? Math.floor(random() * ACTIONS.length) : best(table, square);
}

// peek:start learn
/**
 * One episode. At each square the agent picks a move (usually its best guess, sometimes a
 * random one), sees the reward, and nudges its guess for that square-and-move towards
 * "reward now, plus the discounted guess for the square it landed on". Q-learning uses the
 * best guess for the next square, as if it will behave perfectly from here on; SARSA uses the
 * guess for the move it will actually make, exploration and all.
 */
export function runEpisode(
  table: Float64Array,
  settings: Settings,
  random: Random,
  maxSteps = 200,
) {
  let column = START.column;
  let row = START.row;
  let total = 0;
  let falls = 0;
  let action = choose(table, index(column, row), settings.exploration, random);
  for (let moves = 0; moves < maxSteps; moves += 1) {
    const here = index(column, row);
    const next = step(column, row, ACTIONS[action]);
    const there = index(next.column, next.row);
    total += next.reward;
    if (next.reward === CLIFF_REWARD) falls += 1;
    const nextAction = choose(table, there, settings.exploration, random);
    const nextGuess = next.done
      ? 0
      : settings.algorithm === "q-learning"
        ? table[there * ACTIONS.length + best(table, there)]
        : table[there * ACTIONS.length + nextAction];
    const target = next.reward + settings.discount * nextGuess;
    const slot = here * ACTIONS.length + action;
    // The nudge: move the guess a fraction of the way towards the target.
    table[slot] += settings.learningRate * (target - table[slot]);
    if (next.done) break;
    column = next.column;
    row = next.row;
    action = nextAction;
  }
  return { total, falls };
}
// peek:end

/** Follow the best guesses from the start without exploring, to see what was learned. */
export function greedyRoute(
  table: Float64Array,
): Pick<Outcome, "route" | "routeReward" | "routeEnds"> {
  let column = START.column;
  let row = START.row;
  const route = [index(column, row)];
  let reward = 0;
  for (let moves = 0; moves < COLUMNS * ROWS; moves += 1) {
    const next = step(column, row, ACTIONS[best(table, index(column, row))]);
    reward += next.reward;
    route.push(index(next.column, next.row));
    if (next.reward === CLIFF_REWARD) return { route, routeReward: reward, routeEnds: "cliff" };
    if (next.done) return { route, routeReward: reward, routeEnds: "goal" };
    column = next.column;
    row = next.row;
  }
  return { route, routeReward: reward, routeEnds: "loop" };
}

export function train(settings: Settings, episodes: number, seed: number): Outcome {
  const random = seededRandom(seed);
  const table = new Float64Array(COLUMNS * ROWS * ACTIONS.length);
  const returns: number[] = [];
  const falls: number[] = [];
  for (let episode = 0; episode < episodes; episode += 1) {
    const result = runEpisode(table, settings, random);
    returns.push(result.total);
    falls.push(result.falls);
  }
  return { returns, falls, table, ...greedyRoute(table) };
}

/** The best guess at each square: how much reward the agent expects from there. */
export function valueMap(table: Float64Array): Float64Array {
  const values = new Float64Array(COLUMNS * ROWS);
  for (let square = 0; square < values.length; square += 1)
    values[square] = table[square * ACTIONS.length + best(table, square)];
  return values;
}

export function bestAction(table: Float64Array, square: number): Action {
  return ACTIONS[best(table, square)];
}
