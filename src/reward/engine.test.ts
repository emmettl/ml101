import { describe, expect, it } from "vitest";
import { seededRandom } from "../shared/random";
import {
  ACTIONS,
  CLIFF_REWARD,
  COLUMNS,
  GOAL_REWARD,
  ROWS,
  cellAt,
  runEpisode,
  train,
  type Settings,
} from "./engine";

const base: Settings = {
  algorithm: "q-learning",
  exploration: 0.1,
  learningRate: 0.5,
  discount: 0.95,
};
const EDGE = GOAL_REWARD - COLUMNS;
const clearance = (route: readonly number[]) =>
  ROWS -
  1 -
  Math.max(
    ...route
      .filter((square) => square % COLUMNS > 0 && square % COLUMNS < COLUMNS - 1)
      .map((square) => Math.floor(square / COLUMNS)),
  );
const lateFalls = (falls: readonly number[]) =>
  falls.slice(-100).reduce((sum, value) => sum + value, 0);
const lateReturn = (returns: readonly number[]) =>
  returns.slice(-100).reduce((sum, value) => sum + value, 0) / 100;

describe("the cliff walk", () => {
  it("has a cliff along the bottom between start and goal, and is reproducible", () => {
    for (let column = 1; column < COLUMNS - 1; column += 1)
      expect(cellAt(column, ROWS - 1)).toBe("cliff");
    expect(cellAt(0, ROWS - 1)).toBe("start");
    expect(cellAt(COLUMNS - 1, ROWS - 1)).toBe("goal");
    expect(train(base, 200, 3)).toEqual(train(base, 200, 3));
  });

  it("an episode nudges guesses and a fall costs a hundred", () => {
    const table = new Float64Array(COLUMNS * ROWS * ACTIONS.length);
    const result = runEpisode(table, { ...base, exploration: 1 }, seededRandom(2));
    expect(result.total).toBeLessThan(0);
    if (result.falls > 0)
      expect(result.total).toBeLessThanOrEqual(CLIFF_REWARD + 100 - result.falls);
    expect(Array.from(table).some((value) => value !== 0)).toBe(true);
  });
});

describe("what the lesson and lab claim", () => {
  it("Q-learning learns the edge route and keeps falling while it explores", () => {
    for (const run of [1, 2, 3]) {
      const outcome = train(base, 1000, run);
      expect(outcome.routeEnds, `run ${run}`).toBe("goal");
      expect(outcome.routeReward, `run ${run}`).toBeGreaterThanOrEqual(EDGE - 2);
      expect(clearance(outcome.route), `run ${run}`).toBeLessThanOrEqual(2);
      expect(lateFalls(outcome.falls), `run ${run}`).toBeGreaterThan(5);
    }
  });

  it("SARSA learns a safer, longer route and earns more while learning", () => {
    for (const run of [1, 2, 3]) {
      const q = train(base, 1000, run);
      const sarsa = train({ ...base, algorithm: "sarsa" }, 1000, run);
      expect(sarsa.routeEnds, `run ${run}`).toBe("goal");
      expect(sarsa.routeReward, `run ${run}`).toBeLessThan(q.routeReward);
      expect(clearance(sarsa.route), `run ${run}`).toBeGreaterThan(clearance(q.route));
      expect(lateFalls(sarsa.falls), `run ${run}`).toBeLessThan(lateFalls(q.falls));
      expect(lateReturn(sarsa.returns), `run ${run}`).toBeGreaterThan(lateReturn(q.returns));
    }
  });

  it("more exploration means more falls, and few trips mean a poor start", () => {
    const calm = train({ ...base, algorithm: "sarsa" }, 1000, 1);
    const wild = train({ ...base, algorithm: "sarsa", exploration: 0.3 }, 1000, 1);
    expect(lateFalls(wild.falls)).toBeGreaterThan(lateFalls(calm.falls) + 5);
    const brief = train(base, 100, 1);
    expect(lateReturn(brief.returns)).toBeLessThan(lateReturn(train(base, 1000, 1).returns) - 3);
  });
});
