/**
 * Draggable points on a plot. Handles live in their own SVG layer, which a redraw never
 * clears, so a drag survives the re-render it causes. Each handle is a 44px invisible target
 * over the visible dot, takes pointer capture, and moves with the arrow keys.
 */

import { svgElement, type Plot } from "./plot";

export interface HandleSpec {
  x: number;
  y: number;
  /** Spoken name, e.g. "Point 3". Coordinates are appended automatically. */
  label: string;
}

export interface HandleCallbacks {
  onMove(index: number, x: number, y: number): void;
  onEnd?(index: number): void;
}

interface HandleState {
  layer: SVGGElement;
  plot: Plot;
  specs: readonly HandleSpec[];
  callbacks: HandleCallbacks;
  active: number | undefined;
}

const states = new WeakMap<SVGSVGElement, HandleState>();

function clamp(value: number, [minimum, maximum]: readonly [number, number]): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function indexOf(target: EventTarget | null): number | undefined {
  if (!(target instanceof SVGElement)) return undefined;
  const raw = target.dataset.handle;
  return raw === undefined ? undefined : Number(raw);
}

function attach(state: HandleState): void {
  const { layer } = state;
  const moveTo = (index: number, x: number, y: number) =>
    state.callbacks.onMove(index, clamp(x, state.plot.xRange), clamp(y, state.plot.yRange));

  layer.addEventListener("pointerdown", (event) => {
    const index = indexOf(event.target);
    if (index === undefined) return;
    event.preventDefault();
    state.active = index;
    (event.target as SVGElement).setPointerCapture(event.pointerId);
    (event.target as SVGElement).classList.add("dragging");
  });
  layer.addEventListener("pointermove", (event) => {
    if (state.active === undefined) return;
    const { x, y } = state.plot.locate(event);
    moveTo(state.active, x, y);
  });
  const release = (event: PointerEvent) => {
    if (state.active === undefined) return;
    const index = state.active;
    state.active = undefined;
    (event.target as SVGElement).classList.remove("dragging");
    state.callbacks.onEnd?.(index);
  };
  layer.addEventListener("pointerup", release);
  layer.addEventListener("pointercancel", release);

  layer.addEventListener("keydown", (event) => {
    const index = indexOf(event.target);
    if (index === undefined) return;
    const spec = state.specs[index];
    const [x0, x1] = state.plot.xRange;
    const [y0, y1] = state.plot.yRange;
    const share = event.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-(x1 - x0) * share, 0],
      ArrowRight: [(x1 - x0) * share, 0],
      ArrowDown: [0, -(y1 - y0) * share],
      ArrowUp: [0, (y1 - y0) * share],
    };
    const move = moves[event.key];
    if (!move || !spec) return;
    event.preventDefault();
    moveTo(index, spec.x + move[0], spec.y + move[1]);
    state.callbacks.onEnd?.(index);
    layer.querySelector<SVGElement>(`[data-handle="${index}"]`)?.focus();
  });
}

/** Create, move or remove handles so they match `specs`. Call on every redraw. */
export function syncHandles(
  svg: SVGSVGElement,
  plot: Plot,
  specs: readonly HandleSpec[],
  callbacks: HandleCallbacks,
): void {
  let state = states.get(svg);
  if (!state) {
    const layer = svgElement("g", { "data-handle-layer": "" });
    svg.append(layer);
    state = { layer, plot, specs, callbacks, active: undefined };
    states.set(svg, state);
    attach(state);
  }
  state.plot = plot;
  state.specs = specs;
  state.callbacks = callbacks;
  if (state.active === undefined && state.layer !== svg.lastElementChild) svg.append(state.layer);

  const handles = [...state.layer.children] as SVGCircleElement[];
  specs.forEach((spec, index) => {
    const handle =
      handles[index] ??
      state.layer.appendChild(
        svgElement("circle", {
          r: 22,
          class: "plot-handle",
          tabindex: 0,
          role: "button",
          "data-handle": index,
        }),
      );
    handle.setAttribute("cx", plot.x(spec.x).toFixed(1));
    handle.setAttribute("cy", plot.y(spec.y).toFixed(1));
    handle.setAttribute(
      "aria-label",
      `${spec.label} at ${spec.x.toFixed(1)}, ${spec.y.toFixed(1)}. Drag, or use the arrow keys, to move it.`,
    );
  });
  handles.slice(specs.length).forEach((handle) => handle.remove());
}
