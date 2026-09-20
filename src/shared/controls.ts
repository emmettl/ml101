/**
 * Declarative lab controls. A lab describes its knobs as data; this renders the panel, keeps
 * the read-outs in step, and reports changes. Every input gets a stable id, `<prefix>-<key>`,
 * which is what predict-then-reveal prompts and the browser tests address.
 */

export interface RangeControl<P> {
  type: "range";
  key: keyof P & string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number, params: P) => string;
  /** Map between the slider position and the parameter, e.g. for a log scale. */
  toParam?: (position: number) => number;
  fromParam?: (value: number) => number;
  help?: string;
}

export interface SelectControl<P> {
  type: "select";
  key: keyof P & string;
  label: string;
  options: readonly { value: string; label: string }[];
  help?: string;
}

export type ControlSpec<P> = RangeControl<P> | SelectControl<P>;

export interface ControlPanel {
  /** Push parameter values back into the inputs, e.g. after Reset. */
  sync(): void;
}

export function renderControls<P extends Record<string, number | string>>(
  host: HTMLElement,
  prefix: string,
  specs: readonly ControlSpec<P>[],
  params: P,
  onChange: (key: keyof P & string) => void,
): ControlPanel {
  host.replaceChildren();
  const syncers: (() => void)[] = [];

  for (const spec of specs) {
    const block = document.createElement("div");
    block.className = "control-block";
    const id = `${prefix}-${spec.key}`;

    if (spec.type === "range") {
      const label = document.createElement("label");
      label.className = "range-control";
      label.htmlFor = id;
      const heading = document.createElement("span");
      const name = document.createElement("b");
      name.textContent = spec.label;
      const output = document.createElement("output");
      output.htmlFor.add(id);
      heading.append(name, output);
      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      const toParam = spec.toParam ?? ((position: number) => position);
      const fromParam = spec.fromParam ?? ((value: number) => value);
      const show = () => {
        const text = spec.format(Number(params[spec.key]), params);
        output.textContent = text;
        input.setAttribute("aria-valuetext", text);
      };
      const sync = () => {
        input.value = String(fromParam(Number(params[spec.key])));
        show();
      };
      input.addEventListener("input", () => {
        (params as Record<string, number | string>)[spec.key] = toParam(Number(input.value));
        show();
        onChange(spec.key);
      });
      label.append(heading, input);
      block.append(label);
      syncers.push(sync);
    } else {
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = spec.label;
      const select = document.createElement("select");
      select.id = id;
      for (const option of spec.options) {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        select.append(node);
      }
      select.addEventListener("change", () => {
        const numeric = typeof params[spec.key] === "number";
        (params as Record<string, number | string>)[spec.key] = numeric
          ? Number(select.value)
          : select.value;
        onChange(spec.key);
      });
      block.append(label, select);
      syncers.push(() => {
        select.value = String(params[spec.key]);
      });
    }

    if (spec.help) {
      const help = document.createElement("p");
      help.className = "control-help";
      help.textContent = spec.help;
      block.append(help);
    }
    host.append(block);
  }

  const sync = () => syncers.forEach((run) => run());
  sync();
  return { sync };
}

/** Stat tiles in the shape predict.ts knows how to read: `<span>` label, `<strong>` value. */
export function renderStats(
  host: HTMLElement,
  items: readonly { label: string; value: string; tone?: "good" | "bad" }[],
): void {
  host.replaceChildren(
    ...items.map((item) => {
      const tile = document.createElement("div");
      tile.className = "stat";
      const label = document.createElement("span");
      label.textContent = item.label;
      const value = document.createElement("strong");
      value.textContent = item.value;
      if (item.tone) value.className = item.tone;
      tile.append(label, value);
      return tile;
    }),
  );
}

export function byId<T extends Element = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as unknown as T;
}
