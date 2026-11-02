/**
 * Measuring the chip in front of you. Training is mostly one operation, multiplying grids of
 * numbers, so the lab times that operation on this machine's processor (CPU) and, where the
 * browser offers WebGPU, on its graphics chip (GPU), across grid sizes from tiny to large.
 * Everything here is pure arithmetic with no browser globals; the timing itself lives in
 * `gpu.ts` and the lab's CPU worker.
 */

import { seededRandom } from "../shared/random";

/** Grid sides timed on the CPU. A plain loop at 1,024 takes several seconds, so it stops here. */
export const CPU_SIZES: readonly number[] = [16, 32, 64, 128, 256, 512];
/** Grid sides timed on the GPU. Every side is a multiple of the 16 × 16 tile the kernel uses. */
export const GPU_SIZES: readonly number[] = [16, 32, 64, 128, 256, 512, 1024, 2048];
/** The side used to check that the GPU's answer agrees with the CPU's. */
export const CHECK_SIZE = 128;

export interface Timing {
  /** Grid side: the job multiplies two size × size grids. */
  size: number;
  /** Best wall-clock time for one job, in seconds, including handing it over and getting it back. */
  seconds: number;
}

/** A side × side grid of numbers between −1 and 1, the same every time for a given seed. */
export function randomGrid(size: number, seed: number): Float32Array {
  const random = seededRandom(seed);
  const grid = new Float32Array(size * size);
  for (let index = 0; index < grid.length; index += 1) grid[index] = random() * 2 - 1;
  return grid;
}

// peek:start chip
/** Multiplying two n × n grids takes n³ multiplications and n³ additions. */
export function multiplyOperations(size: number): number {
  return 2 * size ** 3;
}

/** The CPU way: one number at a time, in a triple loop. `out` = `a` × `b`. */
export function multiply(a: Float32Array, b: Float32Array, size: number, out: Float32Array): void {
  out.fill(0);
  for (let row = 0; row < size; row += 1)
    for (let k = 0; k < size; k += 1) {
      const scale = a[row * size + k];
      const from = k * size;
      const to = row * size;
      for (let column = 0; column < size; column += 1) out[to + column] += scale * b[from + column];
    }
}

/**
 * The GPU way: thousands of small workers each compute one number of the answer at the same
 * time. Workers in a 16 × 16 team share the tiles of `a` and `b` they all need.
 */
export const MULTIPLY_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;
@group(0) @binding(3) var<uniform> size: u32;

var<workgroup> tileA: array<array<f32, 16>, 16>;
var<workgroup> tileB: array<array<f32, 16>, 16>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) cell: vec3u, @builtin(local_invocation_id) local: vec3u) {
  let row = cell.y;
  let column = cell.x;
  var total = 0.0;
  for (var tile = 0u; tile < size; tile += 16u) {
    tileA[local.y][local.x] = a[row * size + tile + local.x];
    tileB[local.y][local.x] = b[(tile + local.y) * size + column];
    workgroupBarrier();
    for (var k = 0u; k < 16u; k += 1u) {
      total += tileA[local.y][k] * tileB[k][local.x];
    }
    workgroupBarrier();
  }
  out[row * size + column] = total;
}
`;

/** Useful operations per second for one timed job. */
export function operationsPerSecond(timing: Timing): number {
  return multiplyOperations(timing.size) / timing.seconds;
}
// peek:end

/** Repeat a job until it has run `budget` seconds in all (at least `minimum` times); keep the best. */
export function enoughRepeats(
  elapsed: number,
  repeats: number,
  budget = 0.15,
  minimum = 3,
  maximum = 40,
): boolean {
  return repeats >= maximum || (repeats >= minimum && elapsed >= budget);
}

/** Largest difference between two answers. */
export function largestDifference(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let index = 0; index < a.length; index += 1)
    worst = Math.max(worst, Math.abs(a[index] - b[index]));
  return worst;
}

export interface ChipSummary {
  /** Best operations a second the CPU reached, at any size. */
  cpuPeak?: number;
  gpuPeak?: number;
  /** GPU's peak over the CPU's peak. */
  gpuOverCpu?: number;
  /**
   * The smallest grid side, among those timed on both, from which the GPU is faster at every
   * larger side too. Undefined if the GPU never wins, or nothing was timed on both.
   */
  crossover?: number;
  /** True when the GPU was faster at every side timed on both. */
  gpuAlwaysWins: boolean;
  /** The GPU's time for its smallest job: almost all of it is handing the job over and back. */
  gpuToll?: number;
}

export function summarise(cpu: readonly Timing[], gpu: readonly Timing[]): ChipSummary {
  const peak = (timings: readonly Timing[]) =>
    timings.length ? Math.max(...timings.map(operationsPerSecond)) : undefined;
  const cpuPeak = peak(cpu);
  const gpuPeak = peak(gpu);
  const shared = cpu
    .map((timing) => ({
      size: timing.size,
      cpu: timing,
      gpu: gpu.find((g) => g.size === timing.size),
    }))
    .filter((pair): pair is { size: number; cpu: Timing; gpu: Timing } => pair.gpu !== undefined)
    .sort((a, b) => a.size - b.size);
  let crossover: number | undefined;
  for (let index = shared.length - 1; index >= 0; index -= 1) {
    if (shared[index].gpu.seconds < shared[index].cpu.seconds) crossover = shared[index].size;
    else break;
  }
  const smallest = [...gpu].sort((a, b) => a.size - b.size)[0];
  return {
    cpuPeak,
    gpuPeak,
    gpuOverCpu: cpuPeak && gpuPeak ? gpuPeak / cpuPeak : undefined,
    crossover,
    gpuAlwaysWins: shared.length > 0 && crossover === shared[0].size,
    gpuToll: smallest?.seconds,
  };
}

/** "0.3 milliseconds", "12 microseconds", "1.4 seconds". */
export function shortDurationInWords(seconds: number): string {
  const round = (value: number) =>
    value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  const unit = (value: number, name: string) => {
    const shown = round(value);
    return `${shown} ${name}${shown === "1" ? "" : "s"}`;
  };
  if (seconds >= 1) return unit(seconds, "second");
  if (seconds >= 1e-3) return unit(seconds * 1e3, "millisecond");
  return unit(seconds * 1e6, "microsecond");
}
