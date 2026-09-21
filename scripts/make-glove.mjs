/**
 * Cuts the GloVe word vectors down to what the Open-Book Lab can need, one byte per number.
 *
 *   node scripts/make-glove.mjs path/to/glove.6B.50d.txt [common-words] [output-prefix]
 *
 * Kept: every word of the book, of the lab's questions and of the Fairness Lab's job list that
 * GloVe knows, plus the most
 * common English words (GloVe's file is in frequency order) so that a learner's own question
 * is understood. GloVe is Pennington, Socher and Manning (2014), https://nlp.stanford.edu/projects/glove/,
 * released under the Public Domain Dedication and License.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [source, common = "12000", prefix = "src/data/glove"] = process.argv.slice(2);
if (!source)
  throw new Error("Usage: node scripts/make-glove.mjs glove.6B.50d.txt [common-words] [prefix]");

const spellings = (text) =>
  [...text.matchAll(/[A-Za-z][A-Za-z']*/g)].map((match) =>
    match[0].toLowerCase().replace(/'.*$/, ""),
  );
const needed = new Set([
  ...spellings(readFileSync("src/data/alice.txt", "utf8")),
  ...spellings(readFileSync("src/retrieval/questions.ts", "utf8")),
  ...spellings(readFileSync("src/fairness/occupations.ts", "utf8")),
]);

const words = [];
const rows = [];
let line = 0;
let size = 0;
for await (const entry of createInterface({ input: createReadStream(source) })) {
  line += 1;
  const space = entry.indexOf(" ");
  const word = entry.slice(0, space);
  if (!/^[a-z]+$/.test(word) || !(needed.has(word) || line <= Number(common))) continue;
  const vector = entry
    .slice(space + 1)
    .split(" ")
    .map(Number);
  size = vector.length;
  const largest = Math.max(...vector.map(Math.abs));
  words.push(word);
  rows.push(Int8Array.from(vector, (value) => Math.round((value / largest) * 127)));
}

const bytes = new Int8Array(words.length * size);
rows.forEach((row, at) => bytes.set(row, at * size));
writeFileSync(`${prefix}.bin`, bytes);
writeFileSync(`${prefix}-words.txt`, `${words.join("\n")}\n`);
const missing = [...needed].filter((word) => !words.includes(word));
console.log(`${words.length} words × ${size} numbers = ${(bytes.length / 1024).toFixed(0)} KB`);
console.log(
  `book and question words GloVe does not know: ${missing.length} (${missing.slice(0, 12).join(", ")}…)`,
);
