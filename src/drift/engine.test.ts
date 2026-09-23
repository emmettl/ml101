import { describe, expect, it } from "vitest";
import { BREAK_MONTH, SHIFT_ALARM, TRAINING_MONTHS, simulate, type Settings } from "./engine";

const run = (settings: Partial<Settings>) =>
  simulate({ scenario: "steady", retraining: "never", labelDelay: 0, ...settings });
const shortfall = (months: ReturnType<typeof simulate>["months"]) =>
  months.map((month) => month.ceiling - month.accuracy);
const badMonths = (months: ReturnType<typeof simulate>["months"]) =>
  shortfall(months).filter((value) => value > 0.05).length;
const peakShift = (months: ReturnType<typeof simulate>["months"]) =>
  Math.max(...months.map((month) => month.shift));

describe("the simulation", () => {
  it("is reproducible and runs for thirty months after six of training", () => {
    expect(run({})).toEqual(run({}));
    const { months, launchAccuracy } = run({});
    expect(months).toHaveLength(30);
    expect(months[0].month).toBe(TRAINING_MONTHS);
    expect(launchAccuracy).toBeGreaterThan(0.74);
    expect(launchAccuracy).toBeLessThan(0.82);
  });

  it("marks the months whose labels have not arrived by the end", () => {
    const { months } = run({ labelDelay: 4 });
    expect(months.filter((month) => !month.labelled)).toHaveLength(4);
    expect(run({ labelDelay: 0 }).months.every((month) => month.labelled)).toBe(true);
  });
});

describe("what the lab claims", () => {
  it("in a still world the model holds, and the monitor is quiet", () => {
    const { months } = run({});
    expect(badMonths(months)).toBe(0);
    expect(peakShift(months)).toBeLessThan(0.15);
  });

  it("when the customers change, the monitor rings but the model is fine", () => {
    const { months } = run({ scenario: "customers" });
    expect(peakShift(months)).toBeGreaterThan(1);
    expect(badMonths(months)).toBe(0);
    expect(months.at(-1)?.flagged).toBeLessThan(months[0].flagged - 0.05);
    const watched = run({ scenario: "customers", retraining: "inputs" });
    expect(watched.retrains).toBeGreaterThanOrEqual(2);
    expect(badMonths(watched.months)).toBe(0);
  });

  it("when the reason changes, the monitor is silent and the model rots", () => {
    for (const scenario of ["reason", "sudden"] as const) {
      const { months, launchAccuracy, retrains } = run({ scenario, retraining: "inputs" });
      expect(peakShift(months), scenario).toBeLessThan(SHIFT_ALARM);
      expect(retrains, scenario).toBe(0);
      expect(months.at(-1)?.accuracy, scenario).toBeLessThan(launchAccuracy - 0.1);
      expect(months.at(-1)?.ceiling, scenario).toBeGreaterThan(launchAccuracy - 0.03);
      expect(badMonths(months), scenario).toBeGreaterThanOrEqual(12);
    }
  });

  it("an overnight break shows up in the month it happens, and not before", () => {
    const { months } = run({ scenario: "sudden" });
    const before = months.filter((month) => month.month < BREAK_MONTH);
    const after = months.filter((month) => month.month >= BREAK_MONTH);
    expect(badMonths(before)).toBe(0);
    expect(badMonths(after)).toBe(after.length);
  });

  it("retraining on accuracy repairs the break, later the later the labels arrive", () => {
    const prompt = run({ scenario: "sudden", retraining: "accuracy", labelDelay: 0 });
    const late = run({ scenario: "sudden", retraining: "accuracy", labelDelay: 6 });
    expect(prompt.months.at(-1)?.accuracy).toBeGreaterThan(prompt.launchAccuracy - 0.04);
    expect(late.months.at(-1)?.accuracy).toBeGreaterThan(late.launchAccuracy - 0.04);
    expect(badMonths(late.months)).toBeGreaterThan(badMonths(prompt.months) + 3);
    const firstFix = (months: typeof late.months) => months.find((month) => month.retrained)?.month;
    expect(firstFix(late.months)).toBeGreaterThan(firstFix(prompt.months) ?? 0);
  });

  it("a scheduled retrain can learn the old world again when its labels are stale", () => {
    const { months } = run({ scenario: "sudden", retraining: "schedule", labelDelay: 6 });
    const retrains = months.filter((month) => month.retrained).map((month) => month.month);
    expect(retrains).toEqual([18, 24, 30]);
    // The month-24 retrain used months 12 to 18, all before the break, and changed nothing.
    const during = months.filter((month) => month.month >= 24 && month.month < 30);
    expect(badMonths(during)).toBe(during.length);
    const fixed = months.filter((month) => month.month >= 30);
    expect(badMonths(fixed)).toBe(0);
  });

  it("cannot retrain until six new labelled months exist", () => {
    const { months } = run({ scenario: "sudden", retraining: "accuracy", labelDelay: 3 });
    const retrains = months.filter((month) => month.retrained).map((month) => month.month);
    retrains
      .slice(1)
      .forEach((month, at) => expect(month - retrains[at]).toBeGreaterThanOrEqual(6));
    expect(months.filter((month) => month.alarm).length).toBeGreaterThan(retrains.length);
  });
});
