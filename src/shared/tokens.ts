/**
 * Reads colour tokens from tokens.css for the few things CSS cannot paint: canvas heatmaps.
 * SVG charts use CSS classes instead, so no hex value for a themed colour lives in TypeScript.
 */

import { THEME_EVENT } from "./theme";

export type Rgb = readonly [number, number, number];

const cache = new Map<string, Rgb>();
let listening = false;

function parse(value: string): Rgb | undefined {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as unknown as Rgb;
  }
  const parts = /^rgba?\(([^)]+)\)$/i.exec(text)?.[1].split(/[\s,/]+/);
  if (parts && parts.length >= 3) {
    const channels = parts.slice(0, 3).map(Number);
    if (channels.every(Number.isFinite)) return channels as unknown as Rgb;
  }
  return undefined;
}

/** The current value of a token such as `--heat-mid`, as RGB. Falls back to mid-grey. */
export function tokenRgb(name: string): Rgb {
  if (!listening) {
    listening = true;
    window.addEventListener(THEME_EVENT, () => cache.clear());
  }
  const cached = cache.get(name);
  if (cached) return cached;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = parse(raw) ?? [128, 128, 128];
  cache.set(name, value);
  return value;
}

/** Linear blend through any number of colour stops, `t` in [0, 1]. */
export function ramp(stops: readonly Rgb[], t: number): Rgb {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = stops[index];
  const to = stops[index + 1];
  return [
    from[0] + (to[0] - from[0]) * local,
    from[1] + (to[1] - from[1]) * local,
    from[2] + (to[2] - from[2]) * local,
  ];
}
