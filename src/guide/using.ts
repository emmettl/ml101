/**
 * Using a model that someone else trained. Two decisions come up in every project: which of
 * the four ways of getting a model to do your job fits the gap you have, and what the bill
 * will be. Both are plain reasoning and plain arithmetic, set out here so the guide page can
 * make them concrete. No browser globals.
 */

export type Missing = "manner" | "knowledge" | "freshness" | "skill";
export type Have = "nothing" | "dozens" | "thousands" | "millions";
export type Way = "prompt" | "retrieve" | "fine-tune" | "train";

export interface Verdict {
  way: Way;
  title: string;
  why: string;
  /** What changes inside the system. */
  changes: string;
  /** What it cannot fix. */
  limit: string;
}

export const MISSING: Record<Missing, string> = {
  manner: "The manner: it answers, but not in the form, tone or length I need",
  knowledge: "Knowledge it never had: my documents, my product, my data",
  freshness: "Knowledge that keeps changing: prices, stock, this week's policy",
  skill: "A skill it does badly: a narrow task where its answers are often wrong",
};

export const HAVE: Record<Have, string> = {
  nothing: "Nothing but the documents and my own judgement",
  dozens: "A few dozen good examples of the right answer",
  thousands: "Thousands of labelled examples",
  millions: "Millions of examples and a budget for training",
};

/**
 * The rule of thumb this course teaches: prompting changes what the model is asked, retrieval
 * changes what it can read, fine-tuning changes how it behaves, and training from scratch is
 * for a narrow job with a mountain of data, where lesson 10's trees are usually the answer.
 */
export function recommend(missing: Missing, have: Have): Verdict {
  if (missing === "freshness" || (missing === "knowledge" && have !== "millions"))
    return {
      way: "retrieve",
      title: "Retrieve: search your documents and hand the model the page",
      why:
        missing === "freshness"
          ? "Knowledge that changes cannot live in the knobs, which freeze on the day training ends. Put it in an index that you can edit, and search it on every request."
          : "The model's knobs cannot be edited cheaply, and fine-tuning blurs facts as readily as it stores them. Text in the prompt is exact, cited, and yours to change.",
      changes:
        "Nothing in the model. An index of passages, rebuilt when a document changes, and a prompt that carries the best matches.",
      limit:
        "The search sets the ceiling: a passage that is not retrieved cannot be used. Keep a set of questions with known answers and measure the search, as in the Open-Book Lab.",
    };
  if (missing === "manner" && have === "nothing")
    return {
      way: "prompt",
      title: "Prompt: say what you want, and show it",
      why: "Form, tone and length are things a trained model already knows how to vary. An instruction, and two or three examples of the shape you want, usually settle it in an afternoon.",
      changes:
        "Only the text you send. No training, no index, nothing to maintain but the prompt itself.",
      limit:
        "Every request carries the instructions and examples, which costs tokens, and a prompt cannot teach the model a fact or a skill it lacks.",
    };
  if (missing === "manner")
    return {
      way: have === "dozens" ? "prompt" : "fine-tune",
      title:
        have === "dozens"
          ? "Prompt, with your examples in it"
          : "Fine-tune: continue training on your examples",
      why:
        have === "dozens"
          ? "A few dozen examples fit in the prompt and steer the manner well; choose the handful most like each request if the prompt grows long."
          : "Thousands of examples of the right manner are exactly what fine-tuning consumes. The behaviour moves into the knobs, and each request no longer has to carry the examples.",
      changes:
        have === "dozens"
          ? "Only the text you send: an instruction and the best few examples."
          : "The model's knobs, a little, as in lesson 08's second stage. A new model to host, version and re-check.",
      limit:
        have === "dozens"
          ? "Long prompts cost on every request, and the manner drifts when a request is unlike the examples."
          : "It changes how the model behaves, not what it knows. Facts still go stale, and every retrain needs the evaluation set run again.",
    };
  if (missing === "skill" && have === "nothing")
    return {
      way: "prompt",
      title: "Prompt first, and build the examples you lack",
      why: "Without examples of the right answer you cannot fine-tune and cannot measure. Work the task by prompting while collecting the answers you correct; those become the evaluation set, and later the training set.",
      changes:
        "The text you send, and a growing file of question-and-answer pairs that you will need whichever way you go next.",
      limit:
        "A skill the model genuinely lacks will not appear from instructions alone. Expect to come back to this decision with examples in hand.",
    };
  if (missing === "skill" && have === "dozens")
    return {
      way: "prompt",
      title: "Prompt with the examples, and measure before spending more",
      why: "A few dozen examples are too few to fine-tune on safely and enough to try in the prompt. Score the result on examples you held back; if it is good enough, stop.",
      changes:
        "The text you send. Keep a held-out set of the examples, as lesson 02 taught, to score against.",
      limit: "If the score is not good enough, the fix is more examples, not a cleverer prompt.",
    };
  if (missing === "skill" && have === "thousands")
    return {
      way: "fine-tune",
      title: "Fine-tune on your examples",
      why: "Thousands of labelled examples of a narrow task is what fine-tuning was made for. The skill moves into the knobs, requests get shorter and cheaper, and a held-out slice of the examples measures whether it worked.",
      changes:
        "The model's knobs, a little. A model to host and a retraining routine, with the evaluation set run each time.",
      limit:
        "It learns the examples' regularities, including their mistakes and biases, as the Fairness Lab showed. Facts still belong in retrieval.",
    };
  return {
    way: "train",
    title: "Train your own, and probably not a language model",
    why: "With millions of examples and a narrow task, a model built for that task alone will usually beat a general one: lesson 10's boosted trees on tables, a small network on pictures or signals. It will be faster and cheaper to run, and entirely yours.",
    changes:
      "Everything: the data pipeline, the training, the hosting. Every lesson in this course applies.",
    limit:
      "It knows only your task. The moment the job needs language, world knowledge or judgement, you are back to a pretrained model with one of the other three.",
  };
}

export interface Usage {
  requestsPerDay: number;
  /** Tokens sent per request: instructions, examples, retrieved passages, the question. */
  inputTokens: number;
  outputTokens: number;
  /** Price per million tokens, in and out. */
  priceIn: number;
  priceOut: number;
}

export interface Bill {
  tokensPerRequest: number;
  perRequest: number;
  perMonth: number;
  /** Share of the bill that is input. */
  inputShare: number;
}

/** Tokens are roughly 1.3 per English word. Retrieval adds the passages it hands over. */
export const TOKENS_PER_WORD = 1.3;

export function bill(usage: Usage): Bill {
  const perRequest =
    (usage.inputTokens * usage.priceIn + usage.outputTokens * usage.priceOut) / 1_000_000;
  const inputShare = (usage.inputTokens * usage.priceIn) / 1_000_000 / (perRequest || 1);
  return {
    tokensPerRequest: usage.inputTokens + usage.outputTokens,
    perRequest,
    perMonth: perRequest * usage.requestsPerDay * 30,
    inputShare,
  };
}

export const VOLUMES: Record<string, { label: string; requests: number }> = {
  team: { label: "A team: 100 requests a day", requests: 100 },
  product: { label: "A product: 10,000 requests a day", requests: 10_000 },
  scale: { label: "At scale: a million requests a day", requests: 1_000_000 },
};

export const PROMPTS: Record<string, { label: string; tokens: number }> = {
  short: { label: "A short instruction and the question: about 200 tokens", tokens: 200 },
  examples: { label: "Instructions with a few examples: about 1,500 tokens", tokens: 1500 },
  retrieval: {
    label: "With three retrieved passages of 150 words: about 1,000 tokens",
    tokens: 1000,
  },
  long: { label: "A whole document pasted in: about 20,000 tokens", tokens: 20_000 },
};

export const OUTPUTS: Record<string, { label: string; tokens: number }> = {
  brief: { label: "A sentence or a label: about 30 tokens", tokens: 30 },
  paragraph: { label: "A paragraph: about 150 tokens", tokens: 150 },
  page: { label: "A page: about 800 tokens", tokens: 800 },
};

export const PRICES: Record<string, { label: string; priceIn: number; priceOut: number }> = {
  small: {
    label: "A small model: $0.20 in, $0.80 out, per million tokens",
    priceIn: 0.2,
    priceOut: 0.8,
  },
  large: {
    label: "A frontier model: $3 in, $15 out, per million tokens",
    priceIn: 3,
    priceOut: 15,
  },
};
