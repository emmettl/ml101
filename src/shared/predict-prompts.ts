import { judges, type PredictChoice, type PredictPrompt } from "./predict";

/**
 * Predict-then-reveal prompts, keyed by page file name. Each names one control and one
 * readout on that page; the right answer is whatever the lab's own engine produces, so a
 * prompt cannot go stale when a model changes. Several are deliberate traps.
 */

const upSameDown: PredictChoice[] = [
  { id: "up", label: "It goes up" },
  { id: "same", label: "It stays about the same" },
  { id: "down", label: "It goes down" },
];

const blowUp = (noun: string): PredictChoice[] => [
  { id: "down", label: `${noun} falls or holds steady` },
  { id: "small", label: `${noun} rises, but by less than ten times` },
  { id: "big", label: `${noun} rises more than tenfold` },
];

/** Reads "1,000,000" and "over 1,000,000" as a million rather than as 1. */
const plainNumber = (text: string): number | undefined => {
  const digits = text.replace(/−/g, "-").replace(/[^\d.-]/g, "");
  const value = Number(digits);
  return digits && Number.isFinite(value) ? value : undefined;
};

const times = (before: number, after: number): string =>
  before > 0 ? `${(after / before).toFixed(after / before >= 10 ? 0 : 1)} times` : "many times";

const prompts: Record<string, PredictPrompt[]> = {
  "embedding-lab": [
    {
      id: "dimensions-analogies",
      question:
        "With eight numbers per word, all six analogies come out right. You squeeze every word down to two numbers, so the whole space fits on a page, and retrain. How many analogies does it solve now?",
      readout: { selector: "#embed-stats", match: "Analogies solved", label: "analogies solved" },
      change: {
        selector: "#embed-dimensions",
        value: "2",
        describe: "The lab will retrain with 2 dimensions.",
      },
      choices: [
        { id: "same", label: "Still all, or all but one" },
        { id: "some", label: "About half" },
        { id: "few", label: "Two or fewer" },
      ],
      judge: (_before, after) => (after >= 5 ? "same" : after >= 3 ? "some" : "few"),
      explain: (_before, after) =>
        `${after} of 6. Rank, gender and age each need a direction of their own, and animals and food need somewhere to be as well. Two coordinates cannot keep five things independent, so the directions bend into each other and a step borrowed from one pair of words lands in the wrong place for another. Real models use thousands of dimensions for the same reason.`,
      settle: "#embed-simulation-status",
    },
    {
      id: "dimensions-families",
      question:
        "Now a gentler squeeze, from eight numbers per word to four. At eight, every word's nearest neighbour is one of its own family: 100% kept apart. What happens to that figure at four?",
      readout: {
        selector: "#embed-stats",
        match: "Families kept apart",
        label: "families kept apart",
      },
      change: {
        selector: "#embed-dimensions",
        value: "4",
        describe: "The lab will retrain with 4 dimensions.",
      },
      choices: upSameDown,
      judge: judges.direction(3),
      explain: () =>
        "It holds. Telling animals from food from people is a coarse job and survives the squeeze. Now look at the analogies: one has already failed. Fine-grained structure, the kind that supports arithmetic, is the first thing lost when a model is given too little room, long before the coarse groupings go.",
      settle: "#embed-simulation-status",
    },
  ],
  "line-fitter": [
    {
      id: "outlier-tilt",
      question:
        "You switch on one far-away example, a flat that rented for almost nothing, and change nothing else. There are now 25 examples instead of 24. What happens to the best tilt?",
      readout: { selector: "#fit-stats", match: "Best tilt", label: "best tilt" },
      change: {
        selector: "#fit-outlier",
        value: "on",
        describe: "The lab will switch the far-away example on.",
      },
      choices: upSameDown,
      judge: judges.direction(0.05),
      explain: (before, after) =>
        `One example in 25 moved the best tilt by ${Math.abs(after - before).toFixed(2)}. Under squaring, a miss of 8 counts as 64, so the cheapest way to lower the total is to swing the whole line towards the odd example, at the expense of the other 24.`,
      settle: "#fit-simulation-status",
    },
    {
      id: "outlier-floor",
      question:
        "Same switch. The best possible miss is the lowest any straight line can score. What does one odd example in 25 do to it?",
      readout: { selector: "#fit-stats", match: "Best possible", label: "best possible miss" },
      change: {
        selector: "#fit-outlier",
        value: "on",
        describe: "The lab will switch the far-away example on.",
      },
      choices: [
        { id: "down", label: "Nothing much, or it falls" },
        { id: "small", label: "It rises by less than half" },
        { id: "big", label: "It rises by more than half" },
      ],
      judge: judges.riseSize(1.5),
      explain: (before, after) =>
        `It rose ${times(before, after)} over. No line can serve both the crowd and the odd one out, and squaring makes the compromise expensive. Switch the miss to plain distance and try again: the damage is far smaller.`,
      settle: "#fit-simulation-status",
    },
  ],
  "descent-lab": [
    {
      id: "rate-faster",
      question:
        "At a learning rate of 0.05 the walk needs about fifty steps to reach the bottom. You make the stride four times longer, 0.20, and change nothing else. What happens to the number of steps it needs?",
      readout: {
        selector: "#descent-stats",
        match: "Steps to the bottom",
        label: "steps to the bottom",
      },
      change: {
        selector: "#descent-learningRate",
        value: String(Math.log10(0.2)),
        describe: "The lab will move the learning rate to 0.20.",
      },
      choices: [
        { id: "up", label: "It needs more steps" },
        { id: "same", label: "About the same" },
        { id: "down", label: "It needs fewer steps" },
      ],
      judge: judges.direction(3),
      explain: (before, after) =>
        `From ${before} steps to ${after}. While the stride is still shorter than the valley is wide, a longer one simply covers the ground sooner. That is why people push the learning rate as high as they dare.`,
      settle: "#descent-simulation-status",
    },
    {
      id: "rate-too-far",
      question:
        "Encouraged, you push the learning rate a little further, to 0.30. What happens to the miss after sixty steps?",
      readout: {
        selector: "#descent-stats",
        match: "Miss after 60 steps",
        label: "miss after 60 steps",
        parse: plainNumber,
      },
      change: {
        selector: "#descent-learningRate",
        value: String(Math.log10(0.3)),
        describe: "The lab will move the learning rate to 0.30.",
      },
      choices: blowUp("The miss"),
      judge: judges.riseSize(10),
      explain: () =>
        "Every step still pointed downhill. The stride is now longer than the valley is wide, so each step lands higher on the far side than it started, where the ground is steeper, which makes the next step longer still. There is a hard edge, shown in the lab as the largest safe rate, and no warning before it.",
      settle: "#descent-simulation-status",
    },
  ],
  "neuron-lab": [
    {
      id: "cutoff-false-alarms",
      question:
        "The neuron calls an example a triangle when it is at least 50% sure. You make it more cautious: it must now be 80% sure. The neuron itself does not change. What happens to the number of false alarms?",
      readout: { selector: "#neuron-stats", match: "False alarms", label: "false alarms" },
      change: {
        selector: "#neuron-threshold",
        value: "0.8",
        describe: "The lab will move the cut-off to 0.80.",
      },
      choices: upSameDown,
      judge: judges.direction(0.5),
      explain: (before, after) =>
        `From ${before} to ${after}. Demanding more confidence means fewer circles get called triangles. Now look at the misses: they went the other way. The cut-off never removes errors, it converts one kind into the other, and which kind is cheaper is not something the neuron can know.`,
      settle: "#neuron-simulation-status",
    },
    {
      id: "xor-accuracy",
      question:
        "On overlapping clusters one neuron gets about nine in ten right. You switch to the opposite-corners pattern and let it retrain from scratch on 160 fresh examples. How well does it do?",
      readout: { selector: "#neuron-stats", match: "Right overall", label: "right overall" },
      change: {
        selector: "#neuron-pattern",
        value: "xor",
        describe: "The lab will switch the pattern to opposite corners and retrain.",
      },
      choices: [
        { id: "high", label: "About as well: above 85%" },
        { id: "middle", label: "Noticeably worse: somewhere from 65% to 85%" },
        { id: "chance", label: "Little better than a coin flip: under 65%" },
      ],
      judge: (_before, after) => (after >= 85 ? "high" : after >= 65 ? "middle" : "chance"),
      explain: () =>
        "One neuron draws one straight line, and any straight line leaves one pair of opposite corners on the same side. Training harder, or on more examples, cannot add a second line. The machine is too simple for the pattern, which is the cue for the next lesson.",
      settle: "#neuron-simulation-status",
    },
  ],
  "network-playground": [
    {
      id: "units-down",
      question:
        "Eight hidden neurons learn the ring comfortably. You cut the layer down to one neuron and train again from the same start. What happens to the share it gets right on held-out examples?",
      readout: { selector: "#play-stats", match: "Right on held-out", label: "right on held-out" },
      change: {
        selector: "#play-units",
        value: "1",
        describe: "The lab will set neurons per hidden layer to 1 and retrain.",
      },
      choices: upSameDown,
      judge: judges.direction(3),
      explain: (before, after) =>
        `From ${before}% to ${after}%. One hidden neuron is one straight line, and no straight line encloses a centre. Look at the table below: the score jumps at three neurons, the fewest lines that can surround anything.`,
      settle: "#play-simulation-status",
    },
    {
      id: "second-layer",
      question:
        "Back at eight neurons, you add a second hidden layer of eight, roughly tripling the number of knobs. More capacity, same pattern, same 1,500 steps. What happens to the held-out score?",
      readout: { selector: "#play-stats", match: "Right on held-out", label: "right on held-out" },
      change: {
        selector: "#play-layers",
        value: "2",
        describe: "The lab will add a second hidden layer and retrain.",
      },
      choices: upSameDown,
      judge: judges.direction(3),
      explain: () =>
        "Nothing much. One layer of eight had already captured the ring, and you cannot do better than right. Capacity beyond what the pattern needs buys nothing on clean data, and on noisy data it buys the trouble from lesson 02. Bigger is not a free improvement.",
      settle: "#play-simulation-status",
    },
  ],
  "next-token-lab": [
    {
      id: "context-copied",
      question:
        "With 5 characters of context the model writes real words and copies nothing. You let it see 12 characters instead, which should make it better informed. What happens to the share of its output copied word for word from the book?",
      readout: {
        selector: "#lm-stats",
        match: "Copied from the book",
        label: "copied from the book",
      },
      change: {
        selector: "#lm-context",
        value: "12",
        describe: "The lab will set the context to 12 characters.",
      },
      choices: [
        { id: "same", label: "It stays near zero" },
        { id: "small", label: "It rises a little: under half is copied" },
        { id: "big", label: "Most of the output is now copied" },
      ],
      judge: (_before, after) => (after >= 50 ? "big" : after >= 8 ? "small" : "same"),
      explain: (_before, after) =>
        `${after}% is lifted straight from the book. A twelve-character run almost never occurs twice in 81,000 characters, so at each step exactly one continuation is on offer and the model can only recite. Better informed, with nothing left to decide. It is lesson 02 again: too much capacity for the data.`,
      settle: "#lm-simulation-status",
    },
    {
      id: "greedy-variety",
      question:
        "Back at 5 characters. To make the output as sensible as possible you set top-k to 1, so the model always takes the single most likely character and never gambles. What happens to the number of different words it uses in 600 characters?",
      readout: { selector: "#lm-stats", match: "Different words", label: "different words" },
      change: {
        selector: "#lm-topK",
        value: "1",
        describe: "The lab will set top-k to 1.",
      },
      choices: [
        { id: "up", label: "More: it picks better words" },
        { id: "same", label: "About the same" },
        { id: "down", label: "Far fewer" },
      ],
      judge: judges.direction(10),
      explain: (before, after) =>
        `From ${before} different words to ${after}. Always taking the favourite leads back to a phrase it has already written, and from an identical context it makes identical choices, for ever. Read the sample. The safest pick at every step produces the worst text overall, which is why real systems keep some randomness in.`,
      settle: "#lm-simulation-status",
    },
  ],
  "overfitting-lab": [
    {
      id: "degree-up",
      question:
        "You push flexibility to 12, the most the lab allows, and change nothing else. The training miss will fall. What happens to the held-out miss?",
      readout: {
        selector: "#overfit-stats",
        match: "Held-out miss",
        label: "held-out miss",
        parse: plainNumber,
      },
      change: {
        selector: "#overfit-degree",
        value: "12",
        describe: "The lab will move flexibility to 12.",
      },
      choices: blowUp("The held-out miss"),
      judge: judges.riseSize(10),
      explain: (before, after) =>
        `It rose ${times(before, after)} over, while the training miss fell to almost nothing. Thirteen knobs and a handful of points leaves the curve free to swing wherever it likes between them, and it does.`,
      settle: "#overfit-simulation-status",
    },
    {
      id: "more-data-train",
      question:
        "You give the curve 60 training examples instead of 14, and change nothing else. More data is good. So what happens to the training miss?",
      readout: {
        selector: "#overfit-stats",
        match: "Training miss",
        label: "training miss",
        parse: plainNumber,
      },
      change: {
        selector: "#overfit-count",
        value: "60",
        describe: "The lab will raise the number of training examples to 60.",
      },
      choices: upSameDown,
      judge: judges.direction(0.004),
      explain: () =>
        "The training miss got worse, and that is good news. With 14 points the curve could thread through nearly all of them, noise included. Sixty points cannot all be threaded, so it has to settle for the shape they share. Look at the held-out miss: that is where the benefit shows.",
      settle: "#overfit-simulation-status",
    },
  ],
};

export function promptsForPage(pathname: string): PredictPrompt[] {
  const name =
    pathname
      .split("/")
      .pop()
      ?.replace(/\.html$/, "") ?? "";
  return prompts[name] ?? [];
}
