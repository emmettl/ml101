/** Drawing the cliff walk: the squares, the agent's guesses, its best move at each, and its route. */

import { svgElement } from "../shared/plot";
import { ramp, tokenRgb } from "../shared/tokens";
import { ACTIONS, COLUMNS, ROWS, bestAction, cellAt, index, valueMap, type Action } from "./engine";

const ARROWS: Record<Action, string> = { up: "↑", right: "→", down: "↓", left: "←" };
const CELL = 60;

export function drawGrid(svg: SVGSVGElement, table: Float64Array, route: readonly number[]): void {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${COLUMNS * CELL} ${ROWS * CELL}`);
  const values = valueMap(table);
  let low = Infinity;
  let high = -Infinity;
  for (let square = 0; square < values.length; square += 1) {
    if (cellAt(square % COLUMNS, Math.floor(square / COLUMNS)) === "cliff") continue;
    low = Math.min(low, values[square]);
    high = Math.max(high, values[square]);
  }
  const span = high - low || 1;
  const paper = tokenRgb("--surface");
  const good = tokenRgb("--jade");
  for (let row = 0; row < ROWS; row += 1)
    for (let column = 0; column < COLUMNS; column += 1) {
      const cell = cellAt(column, row);
      const square = index(column, row);
      const group = svgElement("g", { class: `grid-cell ${cell}` });
      const rect = svgElement("rect", {
        x: column * CELL,
        y: row * CELL,
        width: CELL,
        height: CELL,
      });
      if (cell === "floor" || cell === "start") {
        const colour = ramp([paper, good], 0.75 * ((values[square] - low) / span));
        rect.setAttribute("fill", `rgb(${colour.map(Math.round).join(" ")})`);
      }
      group.append(rect);
      if (cell === "cliff")
        group.append(
          svgElement(
            "text",
            {
              x: column * CELL + CELL / 2,
              y: row * CELL + CELL / 2 + 4,
              class: "grid-label",
              "text-anchor": "middle",
            },
            "cliff",
          ),
        );
      else if (cell === "goal")
        group.append(
          svgElement(
            "text",
            {
              x: column * CELL + CELL / 2,
              y: row * CELL + CELL / 2 + 5,
              class: "grid-label strong",
              "text-anchor": "middle",
            },
            "goal",
          ),
        );
      else {
        const known = ACTIONS.some((_, at) => table[square * ACTIONS.length + at] !== 0);
        group.append(
          svgElement(
            "text",
            {
              x: column * CELL + CELL / 2,
              y: row * CELL + CELL / 2 + 8,
              class: "grid-arrow",
              "text-anchor": "middle",
            },
            known ? ARROWS[bestAction(table, square)] : "·",
          ),
          svgElement(
            "text",
            {
              x: column * CELL + CELL - 4,
              y: row * CELL + CELL - 5,
              class: "grid-value",
              "text-anchor": "end",
            },
            known ? values[square].toFixed(0) : "",
          ),
        );
        if (cell === "start")
          group.append(
            svgElement(
              "text",
              { x: column * CELL + 4, y: row * CELL + 13, class: "grid-label" },
              "start",
            ),
          );
      }
      svg.append(group);
    }
  if (route.length > 1) {
    const points = route
      .map(
        (square) =>
          `${(square % COLUMNS) * CELL + CELL / 2},${Math.floor(square / COLUMNS) * CELL + CELL / 2}`,
      )
      .join(" ");
    svg.append(svgElement("polyline", { points, class: "grid-route" }));
  }
}
