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

/** Reads "5.9 × 10^23 operations" as a number. */
const scientific = (text: string): number | undefined => {
  const match = /([\d.]+)\s*×\s*10\^(\d+)/.exec(text);
  return match ? Number(match[1]) * 10 ** Number(match[2]) : undefined;
};

const times = (before: number, after: number): string =>
  before > 0 ? `${(after / before).toFixed(after / before >= 10 ? 0 : 1)} times` : "many times";

const prompts: Record<string, PredictPrompt[]> = {
  "attention-lab": [
    {
      id: "ending-wide",
      question:
        "The sentence ends “…because it was too tired”, and “it” gives most of its attention to “animal”. You change one word, the last: “…too wide”. What happens to the share of attention on “animal”?",
      readout: { selector: "#attn-stats", match: "Share on “animal”", label: "share on “animal”" },
      change: {
        selector: "#attn-ending",
        value: "wide",
        describe: "The lab will change the last word to “wide”.",
      },
      choices: upSameDown,
      judge: judges.direction(3),
      explain: (before, after) =>
        `From ${before}% to ${after}%. Streets are wide and animals get tired, so the question “it” asks swings from “who here is a living thing?” to “who here is a place?”, and the attention follows. One token, two meanings, settled by context. A fixed embedding could never do this.`,
      settle: "#attn-simulation-status",
    },
    {
      id: "focus-zero",
      question:
        "Back to “tired”. You turn the focus down to zero, so every score becomes zero. About four words currently share the attention in effect. What happens to that number?",
      readout: { selector: "#attn-stats", match: "Words that matter", label: "words that matter" },
      change: {
        selector: "#attn-sharpness",
        value: "0",
        describe: "The lab will set the focus to 0.",
      },
      choices: upSameDown,
      judge: judges.direction(0.5),
      explain: (_before, after) =>
        `It rose to ${after}: all eleven other words, equally. With every score at zero, softmax has nothing to prefer, so “it” becomes a plain average of the sentence. The words are all there and the structure is gone. Attention earns its keep by being uneven.`,
      settle: "#attn-simulation-status",
    },
    {
      id: "backwards-only",
      question:
        "Chatbots may only look backwards. You forbid “it” from seeing the three words after it, including “tired”, and leave its question unchanged. What happens to the share on “animal”?",
      readout: { selector: "#attn-stats", match: "Share on “animal”", label: "share on “animal”" },
      change: {
        selector: "#attn-direction",
        value: "backwards",
        describe: "The lab will restrict “it” to looking backwards only.",
      },
      choices: upSameDown,
      judge: judges.direction(3),
      explain: (before, after) =>
        `It went up, from ${before}% to ${after}%. Shares must add to 100%, so hiding three words hands their share to everyone else. But notice what was cheated here: the question stayed pointed at living things, and in a real model that question could only have been formed by seeing “tired”. Looking backwards only, “it” genuinely cannot know yet. The matter is settled later, when “tired” arrives and looks back.`,
      settle: "#attn-simulation-status",
    },
  ],
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
  "table-vs-network": [
    {
      id: "table-gap",
      question:
        "The table sees 6 characters of context. You give it 8, so it knows more about what came before. Its surprise on text it studied will fall. What happens to the gap between that and its surprise on text it has never seen?",
      readout: {
        selector: "#duel-stats",
        match: "Table: gap, unseen minus studied",
        label: "the table's gap",
      },
      change: {
        selector: "#duel-context",
        value: "8",
        describe: "The lab will set the context to 8 characters and rebuild the table.",
      },
      choices: [
        { id: "down", label: "It narrows: more context helps everywhere" },
        { id: "same", label: "It stays about the same" },
        { id: "up", label: "It widens" },
      ],
      judge: judges.direction(0.1),
      explain: (before, after) =>
        `From ${before.toFixed(2)} to ${after.toFixed(2)}. With 8 characters almost every run occurs once in the book, so on studied text the table simply recalls what came next, and on new text that recall is worthless. It is the 13-knob curve from lesson 02. Now compare the network's gap at the same setting once it is trained: a few thousand knobs cannot hold the book, so it has no choice but to generalise.`,
      settle: "#duel-simulation-status",
    },
    {
      id: "table-size",
      question:
        "Same change, 6 characters to 8. With 33 symbols there are over a thousand times more possible 8-character contexts than 6-character ones. What happens to the number of entries the table actually stores?",
      readout: {
        selector: "#duel-stats",
        match: "Table: numbers stored",
        label: "numbers the table stores",
        parse: plainNumber,
      },
      change: {
        selector: "#duel-context",
        value: "8",
        describe: "The lab will set the context to 8 characters and rebuild the table.",
      },
      choices: [
        { id: "same", label: "About the same" },
        { id: "some", label: "It grows by roughly a third" },
        { id: "big", label: "It grows more than tenfold" },
      ],
      judge: (before, after) =>
        after / before >= 10 ? "big" : after / before >= 1.15 ? "some" : "same",
      explain: (before, after) =>
        `From ${before.toLocaleString("en-GB")} to ${after.toLocaleString("en-GB")}. The table can only store what the book contains, and the book has 73,000 positions however you slice it. So the table does not explode. It starves: a thousand times more possible contexts, and nearly all of them empty. Filling them would take a thousand times more text, which is the wall that count models hit and networks do not.`,
      settle: "#duel-simulation-status",
    },
  ],
  "open-book-lab": [
    {
      id: "shorter-passages",
      question:
        "The book is cut into 60-word passages and the best three are handed over. You cut it into 15-word passages instead: four times as many, each far more focused on one thing. What happens to the number of answers found?",
      readout: { selector: "#book-stats", match: /^Answers found/, label: "answers found" },
      change: {
        selector: "#book-size",
        value: "0",
        describe: "The lab will set the passage length to 15 words and search again.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before} to ${after}. A 15-word passage is often too short to hold both the words of the question and the answer to it: the question's words land in one passage and the answer in the next. Look at the tile beside it, too. Many answers are now cut in two by a boundary, and no search can find a passage that does not exist.`,
      settle: "#book-simulation-status",
    },
    {
      id: "longer-passages",
      question:
        "Back at 60 words, few of the questions asked in a reader's own words are found. You make the passages 250 words long. What happens to the number of those questions that are found?",
      readout: {
        selector: "#book-stats",
        match: /^Asked in a reader's words/,
        label: "reader's-words answers found",
      },
      change: {
        selector: "#book-size",
        value: "6",
        describe: "The lab will set the passage length to 250 words and search again.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before} to ${after}. A loosely worded question shares only a word or two with the sentence that answers it. A long passage gives it the whole scene to match against. Now look at the price: the words handed over per question have quadrupled, and the answer is one sentence somewhere inside them. A learned embedding gets most of this gain without the bulk, because it can match “infant” to “baby” in a short passage.`,
      settle: "#book-simulation-status",
    },
    {
      id: "averaged-vectors",
      question:
        "Matching is by shared words, which cannot tell that “bunny” means “rabbit”. You switch to learned word vectors, which can: every passage becomes the average of its words' vectors, and no word has to match at all. What happens to the number of answers found?",
      readout: { selector: "#book-stats", match: /^Answers found/, label: "answers found" },
      change: {
        selector: "#book-method",
        value: "average",
        describe: "The lab will fetch the word vectors (0.6 MB) and search by averaged vectors.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before} to ${after}. Each word vector is good: “bunny” really does sit beside “rabbit”. But a passage is sixty of them averaged, and the one word that mattered is outvoted by the fifty-nine that did not. This is why word matching stayed the method to beat for decades after word vectors arrived. What finally beat it was a transformer that reads the whole passage in context and is trained, on a great many question-and-passage pairs, to put a question next to its answer.`,
      settle: "#book-simulation-status",
    },
    {
      id: "passage-encoder",
      question:
        "Few of the questions asked in a reader's own words are found by matching words. You switch to a passage encoder: a transformer that reads each passage whole and was trained on millions of questions paired with their answers. What happens to the number of those questions that are found?",
      readout: {
        selector: "#book-stats",
        match: /^Asked in a reader's words/,
        label: "reader's-words answers found",
      },
      change: {
        selector: "#book-method",
        value: "encoder",
        describe:
          "The lab will fetch the encoder's vectors for these passages and search with them.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before} to ${after}. The encoder never looks for a word, so “infant” for “baby” or “timepiece” for “watch” costs it nothing. Now look at the tile for questions asked in the book's words: it has not improved, and at some settings it falls. A question that quotes the book is best served by finding the quote. That is why many production systems run both searches and merge the rankings, which is the last option in the list.`,
      settle: "#book-simulation-status",
    },
    {
      id: "overlap",
      question:
        "At 60 words with no overlap, some answers are cut in two by a passage boundary. You set the overlap to a half, so every passage starts in the middle of the one before. What happens to the number of answers found?",
      readout: { selector: "#book-stats", match: /^Answers found/, label: "answers found" },
      change: {
        selector: "#book-overlap",
        value: "0.5",
        describe: "The lab will set the overlap to a half and rebuild the passages.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before} to ${after}. Every sentence is now whole in at least one passage, so nothing is lost to a boundary. The cost is an index twice the size, and near-duplicate passages competing for the same few places: two of your three may now be the same scene, shifted by 30 words.`,
      settle: "#book-simulation-status",
    },
  ],
  "fairness-lab": [
    {
      id: "drop-the-column",
      question:
        "The past decisions were prejudiced against Orange applicants, and the model, which can see the group column, has learned that. Among people who would repay, Blue applicants are far likelier to be approved. You delete the group column and retrain. The model can still see each applicant's neighbourhood. What happens to that gap?",
      readout: {
        selector: "#fair-stats",
        match: "Gap: would repay, and approved",
        label: "the gap for people who would repay",
      },
      change: {
        selector: "#fair-columns",
        value: "score-area",
        describe: "The lab will remove the group column and train the model again.",
      },
      choices: [
        { id: "gone", label: "It all but disappears: the model can no longer tell who is who" },
        { id: "most", label: "It shrinks, but most of it remains" },
        { id: "same", label: "It does not shrink at all" },
      ],
      judge: (before, after) =>
        after / before < 0.25 ? "gone" : after / before < 0.92 ? "most" : "same",
      explain: (before, after) =>
        `From ${before} points to ${after}. Look at the weights: neighbourhood, which says nothing about repaying, has picked up the weight the group column used to carry, because it predicts who the staff marked down. Now slide “How well neighbourhood reveals group” to 0% and the gap does close. In real data there is never just one proxy, and you rarely get to switch them off.`,
      settle: "#fair-simulation-status",
    },
    {
      id: "more-prejudice",
      question:
        "The lender checks its model the only way it can: on held-out past decisions, as lesson 02 taught. It agrees with them most of the time. Suppose the staff had been even more prejudiced, 100% instead of 60%. What happens to the model's agreement with their decisions?",
      readout: {
        selector: "#fair-stats",
        match: "Agrees with the past decisions",
        label: "agreement with the past decisions",
      },
      change: {
        selector: "#fair-prejudice",
        value: "1",
        describe: "The lab will set the prejudice in the past decisions to 100% and retrain.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before}% to ${after}%. A stronger prejudice is a stronger pattern, and patterns are what a model is good at. By the only score the lender can compute, the more prejudiced model is the better one. Meanwhile the tile beside it, agreement with who would in fact repay, has fallen, and only this lab can see that tile. Held-out data protects you from overfitting. It does nothing about labels that are wrong in the same way everywhere.`,
      settle: "#fair-simulation-status",
    },
    {
      id: "equal-rates",
      question:
        "One remedy is to stop using one cut-off for everyone, and set a separate cut-off for each group so that both are approved at the same rate. That means treating the groups differently on purpose. What happens to the model's agreement with who would in fact repay?",
      readout: {
        selector: "#fair-stats",
        match: "Agrees with who would repay",
        label: "agreement with who would repay",
      },
      change: {
        selector: "#fair-policy",
        value: "same-rate",
        describe:
          "The lab will set a cut-off per group so that both are approved at the same rate.",
      },
      choices: upSameDown,
      judge: judges.direction(1),
      explain: (before, after) =>
        `From ${before}% to ${after}%. In this setting the two groups are in truth alike, so the fair rule and the accurate rule are the same rule: the separate cut-offs undo the mark-down. It will not stay that simple. Give Blue applicants a head start in life, so that more of them really would repay, and try the three cut-off rules again: each one levels one pair of bars and tilts another.`,
      settle: "#fair-simulation-status",
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
  "scale-ladder": [
    {
      id: "ten-times-bigger",
      question:
        "Your model has a billion knobs and reads twenty tokens per knob. You make it ten times bigger and keep feeding it at the same rate per knob. What happens to the arithmetic needed to train it?",
      readout: {
        selector: "#ladder-stats",
        match: "Training arithmetic",
        label: "training arithmetic",
        parse: scientific,
      },
      change: {
        selector: "#ladder-parameters",
        value: "10",
        describe: "The lab will set the size to 10 billion knobs.",
      },
      choices: [
        { id: "same", label: "About the same" },
        { id: "ten", label: "About ten times as much" },
        { id: "hundred", label: "About a hundred times as much" },
      ],
      judge: (before, after) =>
        after / before >= 50 ? "hundred" : after / before >= 5 ? "ten" : "same",
      explain: () =>
        "A hundred times. Ten times as many knobs to update, and ten times as many tokens to update them on, multiply. This is why every generation of frontier model costs so much more than the last, and why only a handful of organisations can build them.",
      settle: "#ladder-simulation-status",
    },
    {
      id: "more-chips",
      question:
        "Training would take far too long, so you rent ten times as many accelerators: 10,000 instead of 1,000. What happens to the total arithmetic the training run needs?",
      readout: {
        selector: "#ladder-stats",
        match: "Training arithmetic",
        label: "training arithmetic",
        parse: scientific,
      },
      change: {
        selector: "#ladder-accelerators",
        value: "4",
        describe: "The lab will set the number of accelerators to 10,000.",
      },
      choices: [
        { id: "down", label: "It falls to about a tenth" },
        { id: "same", label: "It stays the same" },
        { id: "up", label: "It rises" },
      ],
      judge: (before, after) =>
        after / before > 1.2 ? "up" : after / before < 0.8 ? "down" : "same",
      explain: () =>
        "Not a single operation is saved. The work is set by the model and its text; chips only decide how quickly it gets done. Look at the time to train: that is what fell. In practice ten times the chips also wastes more effort on coordination, so the real bill goes up a little.",
      settle: "#ladder-simulation-status",
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
