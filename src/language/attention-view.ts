/** The attention picture shared by lesson 06 and its lab: a sentence, with arcs from the asking word. */

import { applyChartSize, responsiveChartSize } from "../shared/chart-size";
import { svgElement } from "../shared/plot";
import type { SentenceWord } from "./attention";

/**
 * Words in a row; an arc from the asking word to each other word, as thick as the attention it
 * receives; a bar and a percentage under each word. Hidden words (when looking backwards only)
 * are greyed out.
 */
export function drawArcs(
  svg: SVGSVGElement,
  words: readonly SentenceWord[],
  weights: readonly number[],
  scores: readonly number[],
  from: number,
): void {
  const size = responsiveChartSize(svg, { width: 900, height: 300 }, 1);
  applyChartSize(svg, size);
  svg.replaceChildren();
  const { width, height } = size;
  const narrow = width < 560;
  const pad = narrow ? 14 : 30;
  const slot = (width - 2 * pad) / words.length;
  const centre = (index: number) => pad + slot * (index + 0.5);
  const baseline = height - (narrow ? 118 : 70);
  const tallest = baseline - 24;

  words.forEach((_, index) => {
    const weight = weights[index];
    if (index === from || weight < 0.004) return;
    const x0 = centre(from);
    const x1 = centre(index);
    const lift = Math.min(tallest, 40 + Math.abs(x1 - x0) * 0.42);
    svg.append(
      svgElement("path", {
        d: `M${x0.toFixed(1)},${baseline - 18} Q${((x0 + x1) / 2).toFixed(1)},${(baseline - 18 - lift * 1.6).toFixed(1)} ${x1.toFixed(1)},${baseline - 18}`,
        class: "attn-arc",
        "stroke-width": (1 + 13 * weight).toFixed(1),
        "stroke-opacity": (0.18 + 0.8 * Math.sqrt(weight)).toFixed(2),
      }),
    );
  });

  words.forEach((word, index) => {
    const x = centre(index);
    const hidden = index !== from && scores[index] === -Infinity;
    const label = svgElement(
      "text",
      {
        x: x.toFixed(1),
        y: baseline,
        "text-anchor": narrow ? "end" : "middle",
        class: `attn-word ${index === from ? "focus" : ""} ${hidden ? "hidden-word" : ""}`.trim(),
      },
      word.text,
    );
    if (narrow) {
      label.setAttribute("transform", `rotate(-55 ${x.toFixed(1)} ${baseline})`);
      label.setAttribute("y", String(baseline + 6));
      label.setAttribute("font-size", "13");
    }
    svg.append(label);
    if (index === from) return;
    const barTop = baseline + (narrow ? 62 : 14);
    const barWidth = Math.min(34, slot * 0.62);
    svg.append(
      svgElement("rect", {
        x: (x - barWidth / 2).toFixed(1),
        y: barTop,
        width: barWidth.toFixed(1),
        height: Math.max(1, 26 * weights[index]).toFixed(1),
        class: "attn-bar",
      }),
    );
    if (!narrow || weights[index] >= 0.08)
      svg.append(
        svgElement(
          "text",
          { x: x.toFixed(1), y: barTop + 40, "text-anchor": "middle", class: "attn-share" },
          `${(weights[index] * 100).toFixed(0)}%`,
        ),
      );
  });
}
