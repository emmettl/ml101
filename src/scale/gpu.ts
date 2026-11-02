/**
 * Times the grid multiply from `chip.ts` on this machine's graphics chip through WebGPU.
 * Each timed job is handed over, run and waited for, as a training step would be, so the fixed
 * cost of handing work to the GPU is part of what is measured.
 */

import { MULTIPLY_WGSL, enoughRepeats, randomGrid, type Timing } from "./chip";

// WebGPU's flag constants, written out because not every TypeScript DOM library declares them.
const STORAGE = 0x80;
const UNIFORM = 0x40;
const COPY_DST = 0x08;
const COPY_SRC = 0x04;
const MAP_READ = 0x01;

export interface GpuBench {
  /** The adapter's own description, where the browser shares one. */
  name: string;
  time(size: number): Promise<Timing>;
  /** Multiplies two grids and returns the answer, for checking against the CPU. */
  multiply(a: Float32Array, b: Float32Array, size: number): Promise<Float32Array>;
  destroy(): void;
}

export type GpuOpening = { ok: true; bench: GpuBench } | { ok: false; reason: string };

export async function openGpu(): Promise<GpuOpening> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { ok: false, reason: "This browser does not offer WebGPU" };
  let adapter: GPUAdapter | null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {
    adapter = null;
  }
  if (!adapter) return { ok: false, reason: "This browser offers WebGPU but found no usable GPU" };
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return { ok: false, reason: "The GPU refused to start a session" };
  }
  const info = (adapter as GPUAdapter & { info?: { vendor?: string; architecture?: string } }).info;
  const name = [info?.vendor, info?.architecture].filter(Boolean).join(" ") || "this GPU";
  const module = device.createShaderModule({ code: MULTIPLY_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });

  function prepare(a: Float32Array, b: Float32Array, size: number) {
    const bytes = size * size * 4;
    const buffer = (data: Float32Array) => {
      const made = device.createBuffer({ size: bytes, usage: STORAGE | COPY_DST });
      device.queue.writeBuffer(made, 0, data);
      return made;
    };
    const left = buffer(a);
    const right = buffer(b);
    const out = device.createBuffer({ size: bytes, usage: STORAGE | COPY_SRC });
    const uniform = device.createBuffer({ size: 4, usage: UNIFORM | COPY_DST });
    device.queue.writeBuffer(uniform, 0, new Uint32Array([size]));
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [left, right, out, uniform].map((resource, binding) => ({
        binding,
        resource: { buffer: resource },
      })),
    });
    const encodeJob = (encoder: GPUCommandEncoder) => {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(size / 16, size / 16);
      pass.end();
    };
    const run = async () => {
      const encoder = device.createCommandEncoder();
      encodeJob(encoder);
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    };
    const free = () => [left, right, out, uniform].forEach((made) => made.destroy());
    return { bytes, out, encodeJob, run, free };
  }

  const bench: GpuBench = {
    name,
    async time(size) {
      const job = prepare(randomGrid(size, size), randomGrid(size, size + 1), size);
      // Warm-up: the first run also pays for setting the kernel up. A slow first run means a
      // slow chip, so one more timed run is enough.
      const warm = performance.now();
      await job.run();
      const minimum = performance.now() - warm > 50 ? 1 : 3;
      let best = Infinity;
      let elapsed = 0;
      let repeats = 0;
      while (!enoughRepeats(elapsed, repeats, 0.15, minimum)) {
        const start = performance.now();
        await job.run();
        const seconds = (performance.now() - start) / 1000;
        best = Math.min(best, seconds);
        elapsed += seconds;
        repeats += 1;
      }
      job.free();
      return { size, seconds: Math.max(best, 1e-6) };
    },
    async multiply(a, b, size) {
      const job = prepare(a, b, size);
      const read = device.createBuffer({ size: job.bytes, usage: MAP_READ | COPY_DST });
      const encoder = device.createCommandEncoder();
      job.encodeJob(encoder);
      encoder.copyBufferToBuffer(job.out, 0, read, 0, job.bytes);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(MAP_READ);
      const answer = new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      read.destroy();
      job.free();
      return answer;
    },
    destroy: () => device.destroy(),
  };
  return { ok: true, bench };
}
