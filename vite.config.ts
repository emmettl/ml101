import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** Every root HTML file is a page, so a new page can never fall out of the bundle. */
const pageEntries = readdirSync(projectRoot)
  .filter((name) => name.endsWith(".html"))
  .sort();

const buildOnly = new Set([
  "dist",
  "coverage",
  "e2e",
  "logs",
  "node_modules",
  "partials",
  "playwright-report",
  "playwright.config.ts",
  "scripts",
  "src",
  "test-results",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "stylelint.config.mjs",
]);

const INCLUDE = /<!--\s*include:\s*([\w-]+)((?:\s+[\w-]+="[^"]*")*)\s*-->/g;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

/**
 * Shared page chrome. `<!-- include: name key="value" -->` is replaced by
 * `partials/name.html`, with `{{key}}` filled from the attributes, so the head,
 * navigation and footer are written once instead of on every page.
 */
function htmlPartials(): Plugin {
  const expand = (html: string, depth = 0): string =>
    html.replace(INCLUDE, (_match, name: string, rawAttributes: string) => {
      const file = join(projectRoot, "partials", `${name}.html`);
      if (!existsSync(file)) throw new Error(`Unknown partial "${name}"`);
      if (depth > 4) throw new Error(`Partial "${name}" nests too deeply`);
      const values: Record<string, string> = {};
      for (const [, key, value] of rawAttributes.matchAll(ATTRIBUTE)) values[key] = value;
      const filled = readFileSync(file, "utf8").replace(
        /\{\{([\w-]+)\}\}/g,
        (_token, key: string) => values[key] ?? "",
      );
      return expand(filled, depth + 1);
    });
  return {
    name: "html-partials",
    transformIndexHtml: { order: "pre", handler: (html) => expand(html) },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(join(projectRoot, "partials"))) server.ws.send({ type: "full-reload" });
    },
  };
}

function copySiteAssets(): Plugin {
  return {
    name: "copy-site-assets",
    apply: "build",
    writeBundle(options) {
      const outputDirectory = resolve(projectRoot, String(options.dir ?? "dist"));
      mkdirSync(outputDirectory, { recursive: true });
      readdirSync(projectRoot).forEach((name) => {
        if (
          buildOnly.has(name) ||
          pageEntries.includes(name) ||
          (name.startsWith(".") && name !== ".nojekyll")
        )
          return;
        const source = join(projectRoot, name);
        if (!existsSync(source)) return;
        cpSync(source, join(outputDirectory, name), { recursive: true });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
    // Several engine tests train real models across many seeds; give them room on a busy machine.
    testTimeout: 30_000,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: Object.fromEntries(
        pageEntries.map((name) => [name.slice(0, -5), resolve(projectRoot, name)]),
      ),
    },
  },
  plugins: [htmlPartials(), copySiteAssets()],
});
