/**
 * Embeds every passage the Open-Book Lab can show, and its 24 questions, with a real passage
 * encoder, so the lab can include one without running a transformer in the page.
 *
 *   npm install --no-save @huggingface/transformers
 *   node scripts/make-passage-vectors.mjs [sizes] [overlaps]
 *
 * The encoder is multi-qa-MiniLM-L6-cos-v1 (sentence-transformers, Apache 2.0): six transformer
 * layers trained on 215 million question-and-answer pairs to place a question beside the
 * passage that answers it. Output is one file per passage setting, 384 signed bytes a passage,
 * plus one for the questions. Passages longer than the encoder's 512 tokens are truncated, as
 * they would be in production.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chunkWords, wordsOf } from "../src/retrieval/engine.ts";
import { QUESTIONS } from "../src/retrieval/questions.ts";

const MODEL = "Xenova/multi-qa-MiniLM-L6-cos-v1";
const OUT = "src/data/passages";
const sizes = (process.argv[2] ?? "15,25,40,60,100,150,250,400").split(",").map(Number);
const overlaps = (process.argv[3] ?? "0,0.25,0.5").split(",").map(Number);

const { pipeline } = await import("@huggingface/transformers");
const encode = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });

async function embed(texts) {
  const bytes = new Int8Array(texts.length * 384);
  for (let from = 0; from < texts.length; from += 32) {
    const batch = texts.slice(from, from + 32);
    const output = await encode(batch, { pooling: "mean", normalize: true });
    const rows = output.tolist();
    rows.forEach((row, at) => {
      const largest = Math.max(...row.map(Math.abs));
      bytes.set(
        row.map((value) => Math.round((value / largest) * 127)),
        (from + at) * 384,
      );
    });
  }
  return bytes;
}

mkdirSync(OUT, { recursive: true });
const text = readFileSync("src/data/alice.txt", "utf8").trim();
const words = wordsOf(text);

writeFileSync(`${OUT}/questions.bin`, await embed(QUESTIONS.map((question) => question.ask)));
for (const size of sizes)
  for (const overlap of overlaps) {
    const started = performance.now();
    const chunks = chunkWords(words, size, overlap);
    const bytes = await embed(chunks.map((chunk) => text.slice(chunk.start, chunk.end)));
    writeFileSync(`${OUT}/${size}-${overlap * 100}.bin`, bytes);
    console.log(
      `${size} words, ${overlap * 100}% overlap: ${chunks.length} passages, ${(bytes.length / 1024).toFixed(0)} KB, ${((performance.now() - started) / 1000).toFixed(0)} s`,
    );
  }
