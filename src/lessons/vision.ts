import { byId } from "../shared/controls";
import { initLessonPage } from "../shared/lesson";
import { THEME_EVENT } from "../shared/theme";
import { KERNEL, MAP, NAMED_FILTERS, SHAPES, SIZE, convolve, makePictures } from "../vision/engine";
import { renderGrid } from "../vision/view";

const pictures = makePictures(SHAPES.length * 3, 0, 0.15, 20260920);
const shape = byId<HTMLSelectElement>("see-shape");
const filter = byId<HTMLSelectElement>("see-filter");
const NAMES = ["a bar", "a cross", "a ring", "a corner"];
const WHAT: Record<string, string> = {
  identity:
    "the picture itself: one weight of 1 in the middle, so every position copies its own pixel",
  blur: "an average of each cell and its eight neighbours, which softens the noise and the edges alike",
  vertical: "places where the picture is brighter to the right than to the left: vertical edges",
  horizontal: "places where the picture is brighter below than above: horizontal edges",
  outline:
    "cells brighter than all their neighbours: the outline of a shape, and every speck of noise",
};

function render(): void {
  const picture = pictures.find((entry) => entry.label === Number(shape.value)) ?? pictures[0];
  const weights = NAMED_FILTERS[filter.value];
  const map = new Float32Array(MAP * MAP);
  convolve(picture.pixels, weights, map);
  renderGrid(byId("see-picture"), picture.pixels, SIZE, SIZE, {
    label: `A picture of ${NAMES[picture.label]}`,
  });
  renderGrid(byId("see-kernel"), weights, KERNEL, KERNEL, {
    diverging: true,
    label: `The ${filter.value} filter`,
  });
  const positive = Float32Array.from(map, (value) => Math.max(0, value));
  renderGrid(byId("see-map"), positive, MAP, MAP, {
    label: "The filter's response at every position",
  });
  byId("see-kernel-numbers").textContent = weights
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    .join("  ");
  let strongest = 0;
  for (const value of map) strongest = Math.max(strongest, value);
  byId("stat-1").textContent = String(KERNEL * KERNEL);
  byId("stat-2").textContent = String(MAP * MAP);
  byId("stat-3").textContent = strongest.toFixed(2);
  byId("stat-4").textContent = `${SIZE * SIZE}`;
  byId("see-prose").textContent =
    `The same nine numbers were multiplied against every 3×3 patch of the picture and summed, ${MAP * MAP} times, to make the map on the right. This filter picks out ${WHAT[filter.value]}. Nine knobs, used at a hundred positions: that is the whole trick, and a network learns which nine.`;
}

shape.addEventListener("change", render);
filter.addEventListener("change", render);
render();
window.addEventListener(THEME_EVENT, render);
initLessonPage();
