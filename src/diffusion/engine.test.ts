import { describe, expect, it } from "vitest";
import { seededRandom } from "../shared/random";
import {
  STEPS,
  createDenoiser,
  distanceToShape,
  drown,
  guessNoise,
  knobCount,
  makeSchedule,
  makeShape,
  sample,
  shareNearShape,
  trainStep,
  type Shape,
} from "./engine";

const schedule = makeSchedule();
function trained(shape: Shape, steps: number, hidden = 64) {
  const points = makeShape(shape, 600, 20260920);
  const model = createDenoiser(hidden, 20260927);
  const random = seededRandom(20260931);
  const losses: number[] = [];
  for (let step = 0; step < steps; step += 1)
    losses.push(trainStep(model, points, schedule, 64, 0.005, random));
  return { model, losses };
}
const drawn = (model: ReturnType<typeof trained>["model"]) =>
  sample(model, schedule, 400, seededRandom(5));

describe("the drowning", () => {
  it("keeps almost everything at the first stage and almost nothing at the last", () => {
    expect(schedule.keep).toHaveLength(STEPS);
    expect(schedule.keep[0]).toBeGreaterThan(0.99);
    expect(schedule.keep[STEPS - 1]).toBeLessThan(0.01);
    schedule.keep.slice(1).forEach((keep, at) => expect(keep).toBeLessThan(schedule.keep[at]));
    const point = { x: 0.5, y: -0.5 };
    const noise = { x: 1, y: 1 };
    const early = drown(point, 0, schedule, noise);
    expect(early.x).toBeCloseTo(point.x, 1);
    const late = drown(point, STEPS - 1, schedule, noise);
    expect(Math.abs(late.x - noise.x)).toBeLessThan(0.1);
  });

  it("shapes sit within about a unit of the origin, and are reproducible", () => {
    for (const shape of ["ring", "spiral", "moons", "heart"] as const) {
      const points = makeShape(shape, 200, 1);
      expect(points).toEqual(makeShape(shape, 200, 1));
      for (const point of points) expect(Math.hypot(point.x, point.y)).toBeLessThan(1.3);
    }
  });
});

describe("the denoiser", () => {
  it("guesses two numbers, has the knobs it claims, and its loss falls with training", () => {
    const model = createDenoiser(32, 1);
    expect(knobCount(model)).toBe(32 * 8 + 32 + 32 * 32 + 32 + 2 * 32 + 2);
    const guess = guessNoise(model, { x: 0.1, y: 0.2 }, 10);
    expect(Number.isFinite(guess.x) && Number.isFinite(guess.y)).toBe(true);
    const { losses } = trained("ring", 400, 32);
    const early = losses.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
    const late = losses.slice(-50).reduce((a, b) => a + b, 0) / 50;
    expect(late).toBeLessThan(early * 0.6);
  });
});

describe("what the lesson and lab claim", () => {
  it("draws a clean ring from pure noise after 3,000 steps, and the shape appears late", () => {
    const { model } = trained("ring", 3000);
    const truth = makeShape("ring", 400, 20260922);
    const clouds = drawn(model);
    expect(clouds).toHaveLength(STEPS + 1);
    const start = shareNearShape(clouds[0], truth);
    const halfway = shareNearShape(clouds[30], truth);
    const finish = shareNearShape(clouds[STEPS], truth);
    expect(start).toBeLessThan(0.2);
    expect(halfway).toBeLessThan(0.35);
    expect(finish).toBeGreaterThan(0.85);
    expect(distanceToShape(clouds[STEPS], truth)).toBeLessThan(
      distanceToShape(clouds[0], truth) / 8,
    );
  });

  it("smudges the spiral, and more training helps without matching the ring", () => {
    const truth = makeShape("spiral", 400, 20260922);
    const short = shareNearShape(drawn(trained("spiral", 3000).model)[STEPS], truth);
    const long = shareNearShape(drawn(trained("spiral", 6000).model)[STEPS], truth);
    expect(short).toBeLessThan(0.7);
    expect(long).toBeGreaterThan(short + 0.05);
    expect(long).toBeLessThan(0.85);
  });
});
