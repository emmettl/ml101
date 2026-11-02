/**
 * The Scale Ladder's "Your chip" panel: times grid multiplies on this device's CPU (in a worker)
 * and GPU (through WebGPU, where offered), draws operations a second against grid size, and
 * turns the measured speed into how long the learner's chosen model would take to train here.
 */

import type { CpuReply, CpuRequest } from "./chip-worker";
import {
  CHECK_SIZE,
  CPU_SIZES,
  GPU_SIZES,
  largestDifference,
  multiplyOperations,
  operationsPerSecond,
  randomGrid,
  shortDurationInWords,
  summarise,
  type Timing,
} from "../scale/chip";
import { acceleratorDays, durationInWords, inWords } from "../scale/engine";
import { openGpu } from "../scale/gpu";
import { byId, renderStats } from "../shared/controls";
import { createPlot } from "../shared/plot";

/** The speed the rest of the lab assumes for one data-centre accelerator. */
const ASSUMED = 4e14;

interface State {
  cpu: Timing[];
  gpu: Timing[];
  /** Why the GPU was not timed, if it was not. */
  gpuMissing?: string;
  /** Largest difference between the GPU's and CPU's answer to the same multiply. */
  agreement?: number;
  phase: "idle" | "running" | "done";
  progress: string;
}

export interface ChipPanel {
  /** Redraw for the model currently chosen on the page. */
  render(operations: number, knobs: number): void;
}

const times = (ratio: number): string =>
  ratio >= 1000
    ? inWords(ratio)
    : ratio >= 10
      ? String(Math.round(ratio))
      : ratio.toFixed(1).replace(/\.0$/, "");

export function mountChipPanel(onChange: () => void): ChipPanel {
  const state: State = { cpu: [], gpu: [], phase: "idle", progress: "" };
  const chart = byId<SVGSVGElement>("chip-chart");
  const button = byId<HTMLButtonElement>("chip-run");
  let run = 0;

  async function measure(): Promise<void> {
    const mine = (run += 1);
    Object.assign(state, {
      cpu: [],
      gpu: [],
      gpuMissing: undefined,
      agreement: undefined,
      phase: "running",
    });
    button.disabled = true;
    let cpuCheck: Float32Array | undefined;

    // GPU first, then CPU, so the two never compete for the machine.
    state.progress = "Measuring · starting the GPU…";
    onChange();
    const opened = await openGpu();
    if (!opened.ok) state.gpuMissing = opened.reason;
    else {
      try {
        for (const size of GPU_SIZES) {
          state.progress = `Measuring · GPU, ${size} × ${size} grid…`;
          onChange();
          const timing = await opened.bench.time(size);
          state.gpu.push(timing);
          if (mine !== run) return;
          // A job this slow means a slow GPU; the next size up would take eight times longer.
          if (timing.seconds > 0.5) break;
        }
        const gpuCheck = await opened.bench.multiply(
          randomGrid(CHECK_SIZE, 1),
          randomGrid(CHECK_SIZE, 2),
          CHECK_SIZE,
        );
        state.progress = "Measuring · CPU…";
        onChange();
        cpuCheck = await timeCpu(mine);
        if (cpuCheck) state.agreement = largestDifference(gpuCheck, cpuCheck);
      } catch {
        state.gpuMissing = "The GPU stopped partway through";
        state.gpu = [];
      } finally {
        opened.bench.destroy();
      }
    }
    if (!opened.ok || state.cpu.length === 0) await timeCpu(mine);
    if (mine !== run) return;
    state.phase = "done";
    button.disabled = false;
    button.textContent = "Measure again";
    onChange();
  }

  function timeCpu(mine: number): Promise<Float32Array | undefined> {
    state.cpu = [];
    return new Promise((resolve) => {
      let check: Float32Array | undefined;
      let worker: Worker;
      try {
        worker = new Worker(new URL("./chip-worker.ts", import.meta.url), { type: "module" });
      } catch {
        resolve(undefined);
        return;
      }
      worker.onmessage = (event: MessageEvent<CpuReply>) => {
        const reply = event.data;
        if (mine !== run) {
          worker.terminate();
          resolve(undefined);
          return;
        }
        if ("check" in reply) check = reply.check;
        else if ("timing" in reply) {
          state.cpu.push(reply.timing);
          const next = CPU_SIZES[state.cpu.length];
          state.progress = next ? `Measuring · CPU, ${next} × ${next} grid…` : "Measuring · CPU…";
          onChange();
        } else {
          worker.terminate();
          resolve(check);
        }
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(check);
      };
      state.progress = `Measuring · CPU, ${CPU_SIZES[0]} × ${CPU_SIZES[0]} grid…`;
      onChange();
      worker.postMessage({
        id: mine,
        sizes: CPU_SIZES,
        checkSize: CHECK_SIZE,
      } satisfies CpuRequest);
    });
  }

  button.addEventListener("click", () => void measure());

  function draw(): void {
    const plot = createPlot(chart, {
      base: { width: 900, height: 300 },
      xRange: [4, 11],
      yRange: [1e6, 1e16],
      yLog: true,
      xLabel: "Grid size (side × side)",
      yLabel: "Operations a second",
      xTicks: [4, 5, 6, 7, 8, 9, 10, 11],
      xFormat: (value) => String(2 ** value),
      yTicks: [1e6, 1e9, 1e12],
      yFormat: (value) => inWords(value),
    });
    plot.line(
      [
        [4, ASSUMED],
        [11, ASSUMED],
      ],
      "truth",
    );
    plot.text(
      10.9,
      ASSUMED / 4,
      "data-centre chip, as assumed above: 400 trillion a second",
      "plot-label",
      "end",
    );
    const series = (timings: readonly Timing[]) =>
      [...timings]
        .sort((a, b) => a.size - b.size)
        .map((timing) => [Math.log2(timing.size), operationsPerSecond(timing)] as const);
    const cpu = series(state.cpu);
    const gpu = series(state.gpu);
    if (cpu.length > 1) plot.line(cpu, "train");
    if (gpu.length > 1) plot.line(gpu, "path");
    for (const [x, y] of cpu) plot.triangle(x, y, 5);
    for (const [x, y] of gpu) plot.circle(x, y, 4.5, "here");
    if (state.phase === "idle")
      plot.text(7.5, 1e9, "Press “Measure this machine” to time it", "plot-label strong", "middle");
  }

  function render(operations: number, knobs: number): void {
    draw();
    const summary = summarise(state.cpu, state.gpu);
    const measured = state.phase === "done";
    const fastest = Math.max(summary.gpuPeak ?? 0, summary.cpuPeak ?? 0);
    const here =
      measured && fastest ? durationInWords(acceleratorDays(operations, fastest)) : undefined;
    renderStats(byId("chip-stats"), [
      {
        label: "CPU, best",
        value: summary.cpuPeak ? `${inWords(summary.cpuPeak)} a second` : "not measured",
      },
      {
        label: "GPU, best",
        value: summary.gpuPeak
          ? `${inWords(summary.gpuPeak)} a second`
          : measured
            ? "not available"
            : "not measured",
      },
      {
        label: "GPU over CPU",
        value: summary.gpuOverCpu ? `× ${times(summary.gpuOverCpu)}` : "–",
      },
      {
        label: "Your model on this machine",
        value: here ?? "not measured",
      },
    ]);

    byId("chip-outcome").textContent = measured
      ? outcome(summary, operations, knobs, state.gpuMissing)
      : `Press “Measure this machine” to time it. Until then, the lab assumes one data-centre accelerator does 4 × 10^14 useful operations a second, and nothing you own comes close.`;

    const status = byId("chip-simulation-status");
    if (state.phase === "running") status.textContent = state.progress;
    else if (!measured) status.textContent = "Current · nothing measured yet";
    else
      status.textContent = [
        "Current",
        `CPU timed on ${state.cpu.length} grid sizes`,
        state.gpu.length ? `GPU timed on ${state.gpu.length}` : "GPU not timed",
        state.agreement !== undefined
          ? `the two answers to the same ${CHECK_SIZE} × ${CHECK_SIZE} multiply differ by at most ${state.agreement.toPrecision(2)}, rounding and nothing more`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");

    const sizes = [...new Set([...GPU_SIZES, ...CPU_SIZES])].sort((a, b) => a - b);
    byId("chip-ledger").replaceChildren(
      ...sizes
        .filter(
          (size) =>
            state.cpu.some((t) => t.size === size) || state.gpu.some((t) => t.size === size),
        )
        .map((size) => {
          const cpu = state.cpu.find((t) => t.size === size);
          const gpu = state.gpu.find((t) => t.size === size);
          const tr = document.createElement("tr");
          [
            `${size} × ${size}`,
            inWords(multiplyOperations(size)),
            cpu ? shortDurationInWords(cpu.seconds) : "–",
            cpu ? inWords(operationsPerSecond(cpu)) : "–",
            gpu ? shortDurationInWords(gpu.seconds) : "–",
            gpu ? inWords(operationsPerSecond(gpu)) : "–",
            cpu && gpu ? (gpu.seconds < cpu.seconds ? "GPU" : "CPU") : "–",
          ].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            tr.append(cell);
          });
          return tr;
        }),
    );
  }

  return { render };
}

function outcome(
  summary: ReturnType<typeof summarise>,
  operations: number,
  knobs: number,
  gpuMissing: string | undefined,
): string {
  const model = `your ${inWords(knobs)}-knob model`;
  if (!summary.cpuPeak && !summary.gpuPeak) return "Nothing could be timed on this device.";
  if (!summary.gpuPeak || !summary.cpuPeak) {
    const peak = (summary.gpuPeak ?? summary.cpuPeak) as number;
    const chip = summary.gpuPeak ? "GPU" : "CPU";
    return `${gpuMissing ?? "The GPU could not be timed"}, so only the ${chip} was. Its best was ${inWords(peak)} operations a second. Training ${model} on it would take ${durationInWords(acceleratorDays(operations, peak))}. The data-centre chip this lab assumes is ${times(ASSUMED / peak)} times faster, and real training runs use thousands of them.`;
  }
  const ratio = summary.gpuOverCpu ?? 1;
  const lead =
    ratio >= 1
      ? `On its best grid this GPU did ${inWords(summary.gpuPeak)} operations a second, ${times(ratio)} times the CPU's best of ${inWords(summary.cpuPeak)}.`
      : `This GPU's best was ${inWords(summary.gpuPeak)} operations a second, slower than the CPU's best of ${inWords(summary.cpuPeak)}. That usually means the browser is imitating a GPU in software on the processor itself, so try another browser or device to see a real one.`;
  const toll = summary.gpuToll ? shortDurationInWords(summary.gpuToll) : "a fixed toll";
  const small =
    ratio < 1
      ? ` Handing it even a 16 × 16 job and getting the answer back took ${toll}.`
      : summary.crossover === undefined
        ? ` Yet the CPU was faster at every size both were timed on: handing the GPU a job and getting the answer back took about ${toll}, and none of these jobs was big enough to repay it.`
        : summary.gpuAlwaysWins
          ? ` It was faster at every size, though even its 16 × 16 job took ${toll}, almost all of it handing the job over and getting the answer back.`
          : ` But on grids smaller than ${summary.crossover} × ${summary.crossover} the CPU won. Handing the GPU a job and getting the answer back took about ${toll} however small the job, and the CPU had finished before the GPU had started. That toll is why training feeds examples in batches: many examples become one big multiply, and the toll is paid once.`;
  const chip = ratio >= 1 ? "GPU" : "CPU";
  const best = Math.max(summary.gpuPeak, summary.cpuPeak);
  const cost = ` Training ${model} on this ${chip} alone would take ${durationInWords(acceleratorDays(operations, best))}. The data-centre chip this lab assumes is ${times(ASSUMED / best)} times faster again, and real training runs use thousands of them.`;
  return lead + small + cost;
}
