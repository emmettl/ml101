import { describe, expect, it } from "vitest";
import {
  HAVE,
  MISSING,
  OUTPUTS,
  PRICES,
  PROMPTS,
  VOLUMES,
  bill,
  recommend,
  type Have,
  type Missing,
} from "./using";

describe("the recommender", () => {
  it("answers every combination with one of the four ways", () => {
    for (const missing of Object.keys(MISSING) as Missing[])
      for (const have of Object.keys(HAVE) as Have[]) {
        const verdict = recommend(missing, have);
        expect(["prompt", "retrieve", "fine-tune", "train"]).toContain(verdict.way);
        expect(verdict.why.length).toBeGreaterThan(40);
      }
  });

  it("sends changing knowledge to retrieval, manner to the prompt, and a mountain of data to training", () => {
    expect(recommend("freshness", "millions").way).toBe("retrieve");
    expect(recommend("knowledge", "nothing").way).toBe("retrieve");
    expect(recommend("manner", "nothing").way).toBe("prompt");
    expect(recommend("manner", "thousands").way).toBe("fine-tune");
    expect(recommend("skill", "thousands").way).toBe("fine-tune");
    expect(recommend("skill", "millions").way).toBe("train");
    expect(recommend("skill", "nothing").way).toBe("prompt");
  });
});

describe("the bill", () => {
  it("multiplies tokens by price and days, and reports the input's share", () => {
    const usage = {
      requestsPerDay: VOLUMES.product.requests,
      inputTokens: PROMPTS.retrieval.tokens,
      outputTokens: OUTPUTS.paragraph.tokens,
      priceIn: PRICES.large.priceIn,
      priceOut: PRICES.large.priceOut,
    };
    const result = bill(usage);
    expect(result.tokensPerRequest).toBe(1150);
    expect(result.perRequest).toBeCloseTo((1000 * 3 + 150 * 15) / 1e6, 9);
    expect(result.perMonth).toBeCloseTo(result.perRequest * 10_000 * 30, 6);
    expect(result.inputShare).toBeCloseTo(3000 / (3000 + 2250), 6);
  });

  it("makes a pasted-in document at scale on a frontier model cost thousands a day", () => {
    const daily =
      bill({
        requestsPerDay: VOLUMES.scale.requests,
        inputTokens: PROMPTS.long.tokens,
        outputTokens: OUTPUTS.paragraph.tokens,
        priceIn: PRICES.large.priceIn,
        priceOut: PRICES.large.priceOut,
      }).perMonth / 30;
    expect(daily).toBeGreaterThan(50_000);
  });
});
