import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeVectors } from "../retrieval/dense";
import { applicants, experiment, type World } from "./engine";
import { occupationLeans } from "./lean";
import { OCCUPATIONS } from "./occupations";

const fair: World = { prejudice: 0, proxy: 0.8, headStart: 0 };
const prejudiced: World = { prejudice: 0.6, proxy: 0.8, headStart: 0 };
const gap = (
  world: World,
  columns: Parameters<typeof experiment>[1],
  policy: Parameters<typeof experiment>[2] = "single",
) => {
  const { model, report } = experiment(world, columns, policy);
  const [blue, orange] = report.groups;
  return {
    model,
    report,
    chance: blue.ableApproved - orange.ableApproved,
    rate: blue.approved - orange.approved,
    worth: blue.approvedAble - orange.approvedAble,
  };
};

describe("the invented applicants", () => {
  it("are reproducible, evenly split, and alike unless the world says otherwise", () => {
    expect(applicants(fair, 50, 3)).toEqual(applicants(fair, 50, 3));
    const people = applicants(fair, 6000, 5);
    const share = (group: number, test: (person: (typeof people)[number]) => boolean) =>
      people.filter((person) => person.group === group && test(person)).length /
      people.filter((person) => person.group === group).length;
    expect(people.filter((person) => person.group === 1).length / people.length).toBeCloseTo(
      0.5,
      1,
    );
    expect(Math.abs(share(0, (p) => p.able) - share(1, (p) => p.able))).toBeLessThan(0.04);
    expect(
      Math.abs(share(0, (p) => p.approvedBefore) - share(1, (p) => p.approvedBefore)),
    ).toBeLessThan(0.04);
  });

  it("carry the prejudice in the labels and not in the truth", () => {
    const people = applicants(prejudiced, 6000, 5);
    const orange = people.filter((person) => person.group === 1);
    const blue = people.filter((person) => person.group === 0);
    const approved = (list: typeof people) =>
      list.filter((p) => p.approvedBefore).length / list.length;
    const able = (list: typeof people) => list.filter((p) => p.able).length / list.length;
    expect(approved(blue) - approved(orange)).toBeGreaterThan(0.2);
    expect(Math.abs(able(blue) - able(orange))).toBeLessThan(0.04);
  });
});

describe("what the lab claims", () => {
  it("an even-handed past gives an even-handed model", () => {
    const result = gap(fair, "score-area-group");
    expect(Math.abs(result.chance)).toBeLessThan(0.06);
    expect(Math.abs(result.model.weights[2])).toBeLessThan(0.12);
  });

  it("a prejudiced past is learned as a weight on group, and scores better against the past", () => {
    const result = gap(prejudiced, "score-area-group");
    expect(result.chance).toBeGreaterThan(0.35);
    expect(result.model.weights[2]).toBeLessThan(-0.5);
    expect(result.worth).toBeLessThan(-0.05);
    const worse = gap({ ...prejudiced, prejudice: 1 }, "score-area-group");
    expect(worse.report.agreesWithPast).toBeGreaterThan(result.report.agreesWithPast + 0.01);
    expect(worse.report.agreesWithTruth).toBeLessThan(result.report.agreesWithTruth - 0.01);
    expect(result.report.agreesWithTruth).toBeLessThan(
      gap(fair, "score-area-group").report.agreesWithTruth - 0.03,
    );
  });

  it("deleting the group column leaves most of the gap, carried by the proxy", () => {
    const seen = gap(prejudiced, "score-area-group");
    const hidden = gap(prejudiced, "score-area");
    expect(hidden.chance / seen.chance).toBeGreaterThan(0.25);
    expect(hidden.chance / seen.chance).toBeLessThan(0.92);
    expect(hidden.model.weights[1]).toBeLessThan(-0.25);
    expect(Math.abs(seen.model.weights[1])).toBeLessThan(0.12);
  });

  it("with no proxy the gap closes, and the prejudice becomes a lower rate for everyone", () => {
    const result = gap({ ...prejudiced, proxy: 0 }, "score-area");
    expect(Math.abs(result.chance)).toBeLessThan(0.06);
    expect(result.model.bias).toBeLessThan(-0.4);
    expect(result.report.groups[0].approved).toBeLessThan(
      gap(fair, "score-area").report.groups[0].approved - 0.1,
    );
  });

  it("when the groups are in truth alike, equal approval rates also raise accuracy", () => {
    const one = gap(prejudiced, "score-area-group");
    const level = gap(prejudiced, "score-area-group", "same-rate");
    expect(Math.abs(level.rate)).toBeLessThan(0.03);
    expect(level.report.agreesWithTruth).toBeGreaterThan(one.report.agreesWithTruth + 0.01);
  });

  it("with a head start, no cut-off rule closes all three gaps", () => {
    const world: World = { prejudice: 0, proxy: 0.8, headStart: 0.6 };
    for (const policy of ["single", "same-rate", "same-chance"] as const) {
      const result = gap(world, "score", policy);
      const open = [result.rate, result.chance, result.worth].filter(
        (value) => Math.abs(value) >= 0.04,
      );
      expect(open.length, policy).toBeGreaterThanOrEqual(1);
    }
    expect(Math.abs(gap(world, "score", "same-rate").rate)).toBeLessThan(0.03);
    expect(Math.abs(gap(world, "score", "same-chance").chance)).toBeLessThan(0.03);
  });
});

describe("the word vectors", () => {
  it("know every job word, and lean the way the lab says", () => {
    const list = readFileSync("src/data/glove-words.txt", "utf8").trim().split("\n");
    const bytes = readFileSync("src/data/glove.bin");
    const leans = occupationLeans(
      decodeVectors(list, new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length), 50),
    );
    expect(leans).toHaveLength(OCCUPATIONS.length);
    const lean = (word: string) => leans.find((entry) => entry.word === word)?.lean ?? 0;
    expect(lean("nurse")).toBeGreaterThan(0.2);
    expect(lean("receptionist")).toBeGreaterThan(0.2);
    expect(lean("engineer")).toBeLessThan(-0.15);
    expect(lean("boss")).toBeLessThan(-0.3);
    expect(lean("secretary")).toBeLessThan(0);
    expect(Math.abs(lean("teacher"))).toBeLessThan(0.05);
  });
});
