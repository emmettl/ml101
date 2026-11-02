import { describe, expect, it } from "vitest";

import {
  CHECK_SIZE,
  CPU_SIZES,
  GPU_SIZES,
  MULTIPLY_WGSL,
  enoughRepeats,
  largestDifference,
  multiply,
  multiplyOperations,
  operationsPerSecond,
  randomGrid,
  shortDurationInWords,
  summarise,
  type Timing,
} from "./chip";

/** The textbook definition, written the slow obvious way, to check the fast loop against. */
function reference(a: Float32Array, b: Float32Array, size: number): Float64Array {
  const out = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      let total = 0;
      for (let k = 0; k < size; k += 1) total += a[row * size + k] * b[k * size + column];
      out[row * size + column] = total;
    }
  return out;
}

describe("the grid multiply", () => {
  it("agrees with the textbook definition", () => {
    const size = 24;
    const a = randomGrid(size, 3);
    const b = randomGrid(size, 4);
    const out = new Float32Array(size * size);
    multiply(a, b, size, out);
    const expected = reference(a, b, size);
    for (let index = 0; index < out.length; index += 1)
      expect(out[index]).toBeCloseTo(expected[index], 4);
  });

  it("multiplies by the identity without changing anything", () => {
    const size = 16;
    const a = randomGrid(size, 5);
    const identity = new Float32Array(size * size);
    for (let index = 0; index < size; index += 1) identity[index * size + index] = 1;
    const out = new Float32Array(size * size);
    multiply(a, identity, size, out);
    expect(largestDifference(out, a)).toBe(0);
  });

  it("counts two operations per multiply-and-add", () => {
    expect(multiplyOperations(2)).toBe(16);
    expect(multiplyOperations(1024)).toBe(2 * 1024 ** 3);
    expect(operationsPerSecond({ size: 1000, seconds: 2 })).toBe(1e9);
  });

  it("repeats grids exactly for a seed", () => {
    expect(randomGrid(8, 9)).toEqual(randomGrid(8, 9));
    expect(randomGrid(8, 9)).not.toEqual(randomGrid(8, 10));
    expect(Math.max(...randomGrid(32, 1).map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("only times sizes the GPU kernel's 16 × 16 tiles divide", () => {
    for (const size of [...CPU_SIZES, ...GPU_SIZES, CHECK_SIZE]) expect(size % 16).toBe(0);
    expect(MULTIPLY_WGSL).toContain("@workgroup_size(16, 16)");
    for (const size of CPU_SIZES) expect(GPU_SIZES).toContain(size);
  });
});

describe("timing", () => {
  it("stops repeating once the budget and the minimum are both met", () => {
    expect(enoughRepeats(0.01, 5)).toBe(false);
    expect(enoughRepeats(1, 2)).toBe(false);
    expect(enoughRepeats(1, 3)).toBe(true);
    expect(enoughRepeats(0, 40)).toBe(true);
  });

  it("speaks short durations in sensible units", () => {
    expect(shortDurationInWords(0.0003)).toBe("300 microseconds");
    expect(shortDurationInWords(0.0012)).toBe("1.2 milliseconds");
    expect(shortDurationInWords(1)).toBe("1 second");
    expect(shortDurationInWords(14.2)).toBe("14 seconds");
  });
});

describe("the summary", () => {
  // A GPU with a fixed toll of 0.5 ms per job and 200 billion operations a second, against a
  // CPU doing 1 billion a second: the GPU loses on small jobs and wins on large ones.
  const cpu: Timing[] = CPU_SIZES.map((size) => ({
    size,
    seconds: multiplyOperations(size) / 1e9,
  }));
  const gpu: Timing[] = GPU_SIZES.map((size) => ({
    size,
    seconds: 5e-4 + multiplyOperations(size) / 2e11,
  }));

  it("finds where the GPU starts to win", () => {
    const summary = summarise(cpu, gpu);
    // 2n³/1e9 > 5e-4 + 2n³/2e11 first at n = 64.
    expect(summary.crossover).toBe(64);
    expect(summary.gpuAlwaysWins).toBe(false);
    expect(summary.cpuPeak).toBeCloseTo(1e9);
    expect(summary.gpuPeak).toBeGreaterThan(1e11);
    expect(summary.gpuOverCpu).toBeGreaterThan(100);
    expect(summary.gpuToll).toBeCloseTo(5e-4, 4);
  });

  it("needs the GPU to keep winning at every larger size", () => {
    const flaky = cpu.map((timing) =>
      timing.size === 256 ? { ...timing, seconds: 1e-9 } : timing,
    );
    expect(summarise(flaky, gpu).crossover).toBe(512);
  });

  it("says so when the GPU always wins, never wins, or is missing", () => {
    expect(
      summarise(
        cpu.map((t) => ({ ...t, seconds: 1 })),
        gpu,
      ).gpuAlwaysWins,
    ).toBe(true);
    expect(
      summarise(
        cpu.map((t) => ({ ...t, seconds: 1e-9 })),
        gpu,
      ).crossover,
    ).toBeUndefined();
    const cpuOnly = summarise(cpu, []);
    expect(cpuOnly.gpuPeak).toBeUndefined();
    expect(cpuOnly.gpuOverCpu).toBeUndefined();
    expect(cpuOnly.crossover).toBeUndefined();
    expect(cpuOnly.gpuAlwaysWins).toBe(false);
  });
});
