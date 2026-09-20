/**
 * "Show me the code": a collapsed panel for developers, invisible to everyone else until
 * opened. The TypeScript shown is cut from the engine's real source between
 * `// peek:start <name>` and `// peek:end` markers (imported with `?raw`), so it cannot drift
 * from what the lab actually runs. A short NumPy version sits beside it.
 */

const OPEN_KEY = "ml101:code-peek-open";

export interface CodePeek {
  summary: string;
  /** Raw source of the engine module. */
  source: string;
  /** Marker name inside the source. */
  marker: string;
  python: string;
}

export function extractPeek(source: string, marker: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === `// peek:start ${marker}`);
  if (start < 0) return `// "${marker}" is not marked in the source.`;
  const length = lines.slice(start + 1).findIndex((line) => line.trim() === "// peek:end");
  const body = lines.slice(start + 1, length < 0 ? undefined : start + 1 + length);
  const indent = Math.min(
    ...body.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)?.[0].length ?? 0),
  );
  return body.map((line) => line.slice(Number.isFinite(indent) ? indent : 0)).join("\n");
}

function block(caption: string, code: string): HTMLElement {
  const figure = document.createElement("figure");
  const title = document.createElement("figcaption");
  title.textContent = caption;
  const pre = document.createElement("pre");
  const node = document.createElement("code");
  node.textContent = code.trim();
  pre.append(node);
  pre.tabIndex = 0;
  figure.append(title, pre);
  return figure;
}

export function mountCodePeek(host: HTMLElement, peek: CodePeek): void {
  const details = document.createElement("details");
  details.className = "code-peek";
  const summary = document.createElement("summary");
  summary.append("Show me the code ");
  const hint = document.createElement("span");
  hint.textContent = `· ${peek.summary}`;
  summary.append(hint);
  const body = document.createElement("div");
  body.className = "code-peek-body";
  body.append(
    block("What this lab runs (TypeScript)", extractPeek(peek.source, peek.marker)),
    block("The same idea in NumPy", peek.python),
  );
  details.append(summary, body);
  try {
    details.open = localStorage.getItem(OPEN_KEY) === "true";
  } catch {
    // Closed by default when storage is unavailable.
  }
  details.addEventListener("toggle", () => {
    try {
      localStorage.setItem(OPEN_KEY, String(details.open));
    } catch {
      // The panel still opens for this visit.
    }
  });
  host.replaceChildren(details);
}
