/**
 * Play / pause / step for anything that learns over time. `step` advances the model once and
 * returns false when there is nothing left to do. The loop draws at most once per frame, never
 * spends more than a few milliseconds of a frame stepping, stops when the tab is hidden, and
 * under "reduce motion" jumps straight to the end instead of animating.
 */

export interface TransportOptions {
  step: () => boolean;
  draw: () => void;
  /** Steps per second while playing. Read every frame, so a speed control can change it live. */
  rate: () => number;
  /** Upper bound on steps for a single Play, and for the reduced-motion jump. */
  limit?: number;
  onState?: (running: boolean) => void;
}

export interface Transport {
  readonly running: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  stepOnce(): void;
}

const FRAME_BUDGET_MS = 6;

export function createTransport(options: TransportOptions): Transport {
  let running = false;
  let frame = 0;
  let last = 0;
  let owed = 0;
  let taken = 0;
  const limit = options.limit ?? 5000;

  const setRunning = (value: boolean) => {
    if (running === value) return;
    running = value;
    options.onState?.(running);
  };

  const pause = () => {
    cancelAnimationFrame(frame);
    setRunning(false);
  };

  const tick = (now: number) => {
    if (!running) return;
    owed += ((now - last) / 1000) * options.rate();
    last = now;
    const started = performance.now();
    let alive = true;
    while (alive && owed >= 1 && performance.now() - started < FRAME_BUDGET_MS && taken < limit) {
      alive = options.step();
      owed -= 1;
      taken += 1;
    }
    owed = Math.min(owed, options.rate());
    options.draw();
    if (!alive || taken >= limit) {
      pause();
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  return {
    get running() {
      return running;
    },
    play() {
      if (running) return;
      taken = 0;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let alive = true;
        while (alive && taken < limit) {
          alive = options.step();
          taken += 1;
        }
        options.draw();
        return;
      }
      setRunning(true);
      last = performance.now();
      owed = 1;
      frame = requestAnimationFrame(tick);
    },
    pause,
    toggle() {
      if (running) pause();
      else this.play();
    },
    stepOnce() {
      pause();
      options.step();
      options.draw();
    },
  };
}
