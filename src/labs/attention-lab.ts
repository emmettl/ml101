import {
  FOCUS,
  QUERY_FOR,
  attend,
  blend,
  effectiveCount,
  focusIndex,
  readingOf,
  sentence,
  strongest,
  type Ending,
} from "../language/attention";
import source from "../language/attention.ts?raw";
import { drawArcs } from "../language/attention-view";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { syncHandles } from "../shared/drag";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

const PLANE = [-1.6, 3.8] as const;

interface Params extends Record<string, number | string> {
  ending: Ending;
  sharpness: number;
  direction: "both" | "backwards";
  queryX: number;
  queryY: number;
}

const defaults: Params = {
  ending: "tired",
  sharpness: 1,
  direction: "both",
  queryX: QUERY_FOR.tired[0],
  queryY: QUERY_FOR.tired[1],
};
const params: Params = { ...defaults };

const controls: ControlSpec<Params>[] = [
  {
    type: "select",
    key: "ending",
    label: "The sentence ends…",
    options: [
      { value: "tired", label: "…because it was too tired" },
      { value: "wide", label: "…because it was too wide" },
    ],
    help: "Changing the ending also resets the question, as earlier layers of a real model would.",
  },
  {
    type: "range",
    key: "sharpness",
    label: "Focus",
    min: 0,
    max: 4,
    step: 0.1,
    format: (value) => value.toFixed(1),
    help: "Multiplies every score. Zero listens to everyone equally; high listens to one word.",
  },
  {
    type: "select",
    key: "direction",
    label: "“it” may look…",
    options: [
      { value: "both", label: "both ways (as when reading a finished text)" },
      { value: "backwards", label: "backwards only (as a chatbot must)" },
    ],
  },
  {
    type: "range",
    key: "queryX",
    label: "Question: “are you a living thing?”",
    min: PLANE[0],
    max: PLANE[1],
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
  {
    type: "range",
    key: "queryY",
    label: "Question: “are you a place?”",
    min: PLANE[0],
    max: PLANE[1],
    step: 0.05,
    format: (value) => value.toFixed(2),
    help: "The same two numbers as the arrowhead. Sliders and arrow move together.",
  },
];

const arcs = byId<SVGSVGElement>("attn-arcs");
const plane = byId<SVGSVGElement>("attn-plane");

function render(): void {
  const words = sentence(params.ending);
  const from = focusIndex(words);
  const query = [params.queryX, params.queryY] as const;
  const { scores, weights } = attend(
    query,
    words,
    from,
    params.sharpness,
    params.direction === "backwards",
  );
  drawArcs(arcs, words, weights, scores, from);

  const plot = createPlot(plane, {
    base: { width: 620, height: 460 },
    xRange: PLANE,
    yRange: PLANE,
    xLabel: "“I am a living thing” →",
    yLabel: "“I am a place” →",
    minimumHeightShare: 0.85,
  });
  plot.guide("x", 0, undefined, "calm");
  plot.guide("y", 0, undefined, "calm");
  const labelled = new Set<string>();
  words.forEach((word, index) => {
    if (index === from) return;
    const hidden = scores[index] === -Infinity;
    plot.circle(word.key[0], word.key[1], 3.5 + 10 * weights[index], hidden ? "faint" : "key-dot");
    const grammar = word.key[0] < 0 && word.key[1] < 0;
    if (grammar && labelled.has("grammar")) return;
    if (grammar) labelled.add("grammar");
    plot
      .text(
        word.key[0],
        word.key[1],
        grammar ? "the, did, not, was…" : word.text,
        hidden ? "plot-word faint" : "plot-word",
      )
      .setAttribute("dy", grammar ? "20" : "-12");
  });
  plot.line([[0, 0], query], "query");
  plot.circle(query[0], query[1], 7, "here");
  syncHandles(plane, plot, [{ x: query[0], y: query[1], label: "The question “it” is asking" }], {
    onMove(_index, x, y) {
      params.queryX = Math.round(x * 20) / 20;
      params.queryY = Math.round(y * 20) / 20;
      panel.sync();
      render();
    },
  });

  const top = strongest(weights);
  const mix = blend(words, weights);
  const reading = readingOf(mix.living, mix.place);
  const count = effectiveCount(weights);
  const animal = weights[words.findIndex((word) => word.text === "animal")];
  const street = weights[words.findIndex((word) => word.text === "street")];
  renderStats(byId("attn-stats"), [
    { label: "Share on “animal”", value: `${(animal * 100).toFixed(0)}%` },
    { label: "Share on “street”", value: `${(street * 100).toFixed(0)}%` },
    { label: "Words that matter", value: count.toFixed(1) },
    { label: "“it” now reads as", value: reading },
  ]);
  byId("attn-name").textContent =
    `“${FOCUS}” → ${params.sharpness === 0 ? "everyone" : words[top].text}`;
  byId("attn-description").textContent =
    reading === "unclear"
      ? "The blend is not clearly a living thing or a place. “it” has listened too evenly, or to the wrong words, to commit to a reading."
      : `After attention, “it” is mostly made of “${words[top].text}”, so whatever reads it next will treat it as ${reading}.`;
  byId("attn-simulation-status").textContent =
    `Current · question (${query[0].toFixed(2)}, ${query[1].toFixed(2)}) · focus ${params.sharpness.toFixed(1)} · looking ${params.direction === "both" ? "both ways" : "backwards only"} · ${words.length - 1} words to choose from`;

  const hiddenCount = scores.filter((score, index) => index !== from && score === -Infinity).length;
  const angle = Math.hypot(query[0], query[1]) < 0.3;
  byId("attn-outcome").textContent = angle
    ? "The arrow is very short, so every score is near zero and the shares come out almost equal. A question asked faintly gets an answer from everyone."
    : `The arrow points ${Math.abs(query[0]) > Math.abs(query[1]) ? (query[0] > 0 ? "towards “living thing”" : "away from “living thing”") : query[1] > 0 ? "towards “place”" : "away from “place”"}, so “${words[top].text}” scores highest (${scores[top].toFixed(2)}) and takes ${(weights[top] * 100).toFixed(0)}% of the attention. About ${count.toFixed(1)} words share it in effect.${hiddenCount ? ` ${hiddenCount} later words are hidden from “it”: it cannot see how the sentence ends, which is exactly the information that decided the question.` : ""}`;

  byId("attn-ledger").replaceChildren(
    ...words.map((word, index) => {
      const tr = document.createElement("tr");
      if (index === top && index !== from) tr.classList.add("selected-observation");
      const hidden = scores[index] === -Infinity;
      [
        word.text,
        word.key[0].toFixed(2),
        word.key[1].toFixed(2),
        hidden ? "–" : scores[index].toFixed(2),
        `${(weights[index] * 100).toFixed(1)}%`,
        index === from ? "the asker; ignores itself here" : hidden ? "hidden: comes later" : "",
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        tr.append(cell);
      });
      return tr;
    }),
  );
}

const panel = renderControls(byId("attn-controls"), "attn", controls, params, (key) => {
  if (key === "ending") {
    [params.queryX, params.queryY] = QUERY_FOR[params.ending];
    panel.sync();
  }
  render();
});

byId("attn-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  render();
});

mountCodePeek(byId("code-peek"), {
  summary: "attention is two short functions",
  source,
  marker: "attention",
  python: `import numpy as np

def softmax(scores):
    e = np.exp(scores - scores.max())        # subtract the max so exp() cannot overflow
    return e / e.sum()

def attention(Q, K, V, backwards_only=False):
    scores = Q @ K.T / np.sqrt(K.shape[1])   # every question against every badge
    if backwards_only:                        # a chatbot may not peek ahead
        scores[np.triu_indices_from(scores, k=1)] = -np.inf
    shares = np.apply_along_axis(softmax, 1, scores)
    return shares @ V                         # each word becomes a blend of the others

# In a transformer Q, K and V are the embeddings times three learned matrices.`,
});

render();
redrawOnResize([arcs, plane], render);
initLabPage();
