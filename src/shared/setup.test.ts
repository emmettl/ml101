import { describe, expect, it } from "vitest";
import { parseSetup, serialiseSetup } from "./setup";
import { coachMovesFor } from "./coach-moves";

describe("setup links", () => {
  it("round-trip through the hash, including spaces and decimals", () => {
    const setup = { "duel-prompt": "alice looked at the jabberw", "fair-proxy": "0.8" };
    expect(parseSetup(serialiseSetup(setup))).toEqual(setup);
    expect(serialiseSetup({})).toBe("");
  });

  it("ignore keys that are not control ids", () => {
    expect(parseSetup("#content&x=1&drift-scenario=sudden")).toEqual({
      "drift-scenario": "sudden",
    });
  });

  it("offer three moves for every lab, none for other pages", () => {
    for (const page of ["line-fitter", "drift-lab", "capstone", "open-book-lab"])
      expect(coachMovesFor(`/ml101/${page}.html`)).toHaveLength(3);
    expect(coachMovesFor("/ml101/lesson-00-knobs.html")).toEqual([]);
    for (const move of coachMovesFor("/fairness-lab.html"))
      for (const id of Object.keys(move.setup)) expect(id.startsWith("fair-")).toBe(true);
  });
});
