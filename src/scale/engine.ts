/**
 * Scale, as arithmetic. The models in this course and the models behind chatbots are the same
 * kind of object; what separates them is twelve orders of magnitude. These are the standard
 * back-of-envelope rules for what that costs. No browser globals.
 *
 * Every figure for a real model below is one its makers published. Where a lab has not said
 * (which is most recent frontier models), the ladder says so and does not guess.
 */

export interface Rung {
  name: string;
  year?: number;
  parameters: number;
  /** Training tokens, where published. */
  tokens?: number;
  /** Where the number comes from, or what it is. */
  note: string;
  course?: boolean;
}

export const LADDER: readonly Rung[] = [
  {
    name: "The straight line",
    parameters: 2,
    note: "Lessons 00–01: a tilt and a lift.",
    course: true,
  },
  { name: "One neuron", parameters: 3, note: "Lesson 03: two weights and a bias.", course: true },
  {
    name: "The 13-knob curve",
    parameters: 13,
    note: "Lesson 02, at its most flexible.",
    course: true,
  },
  {
    name: "Playground network",
    parameters: 105,
    note: "Lesson 04: two inputs, two layers of eight, one output.",
    course: true,
  },
  {
    name: "Word vectors",
    parameters: 704,
    note: "Lesson 05: 44 words × 8 numbers, twice over.",
    course: true,
  },
  {
    name: "LeNet-5",
    year: 1998,
    parameters: 60_000,
    note: "Read handwritten digits on cheques. LeCun et al.",
  },
  {
    name: "AlexNet",
    year: 2012,
    parameters: 60_000_000,
    note: "The image classifier that restarted the field. Krizhevsky et al.",
  },
  {
    name: "BERT-large",
    year: 2018,
    parameters: 340_000_000,
    note: "A transformer for understanding text. Devlin et al.",
  },
  {
    name: "GPT-2",
    year: 2019,
    parameters: 1_500_000_000,
    note: "First widely noticed fluent text generator. Radford et al.",
  },
  {
    name: "Chinchilla",
    year: 2022,
    parameters: 70_000_000_000,
    tokens: 1_400_000_000_000,
    note: "Showed models had been under-fed with data. Hoffmann et al.",
  },
  {
    name: "GPT-3",
    year: 2020,
    parameters: 175_000_000_000,
    tokens: 300_000_000_000,
    note: "The model behind the first ChatGPT's lineage. Brown et al.",
  },
  {
    name: "Llama 3.1 405B",
    year: 2024,
    parameters: 405_000_000_000,
    tokens: 15_000_000_000_000,
    note: "Largest openly released model with published training details. Meta.",
  },
];

export const LADDER_NOTE =
  "The labs behind the most capable current chatbots have not published their sizes, so they are not on this ladder.";

// peek:start scale
/** Training compute: about six arithmetic operations per knob, per token read. */
export function trainingOperations(parameters: number, tokens: number): number {
  return 6 * parameters * tokens;
}

/** The "Chinchilla" rule of thumb: feed a model about twenty tokens for every knob. */
export function sensibleTokens(parameters: number, tokensPerParameter = 20): number {
  return parameters * tokensPerParameter;
}

/** Space needed just to hold the knobs. */
export function weightBytes(parameters: number, bytesPerParameter = 2): number {
  return parameters * bytesPerParameter;
}

/** Days on one accelerator doing `usefulOperationsPerSecond` of real work. */
export function acceleratorDays(operations: number, usefulOperationsPerSecond = 4e14): number {
  return operations / usefulOperationsPerSecond / 86_400;
}

/** Years for a person to read that many tokens: 250 words a minute, 8 hours a day, ¾ word a token. */
export function readingYears(tokens: number): number {
  const tokensPerDay = (250 * 60 * 8) / 0.75;
  return tokens / tokensPerDay / 365;
}
// peek:end

const UNITS: readonly [number, string][] = [
  [1e24, "septillion"],
  [1e21, "sextillion"],
  [1e18, "quintillion"],
  [1e15, "quadrillion"],
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

/** 405,000,000,000 → "405 billion". */
export function inWords(value: number): string {
  if (!Number.isFinite(value)) return "too many to count";
  for (const [size, name] of UNITS)
    if (value >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "")} ${name}`;
    }
  return value >= 100 ? value.toFixed(0) : String(Math.round(value * 10) / 10);
}

export function bytesInWords(bytes: number): string {
  const steps: readonly [number, string][] = [
    [1e15, "PB"],
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ];
  for (const [size, unit] of steps)
    if (bytes >= size) return `${(bytes / size).toFixed(bytes / size >= 10 ? 0 : 1)} ${unit}`;
  return `${Math.round(bytes)} bytes`;
}

export function durationInWords(days: number): string {
  if (days < 1 / 86_400) return "under a second";
  if (days < 1 / 1440) return `${Math.round(days * 86_400)} seconds`;
  if (days < 1 / 24) return `${Math.round(days * 1440)} minutes`;
  if (days < 2) return `${(days * 24).toFixed(days * 24 >= 10 ? 0 : 1)} hours`;
  if (days < 730) return `${Math.round(days)} days`;
  return `${inWords(days / 365)} years`;
}
