/**
 * "Try this": for each lab, three settings worth a look, with a sentence on what to watch for.
 * Each move is a setup in the same form as a shared link, keyed by control id.
 */

import type { Setup } from "./setup";

export interface CoachMove {
  label: string;
  setup: Setup;
  watch: string;
}

const moves: Record<string, CoachMove[]> = {
  "line-fitter": [
    {
      label: "Add an outlier",
      setup: { "fit-outlier": "on" },
      watch:
        "One flat that rented for almost nothing. Watch how far the squared loss drags the line towards it.",
    },
    {
      label: "Plain distance instead",
      setup: { "fit-outlier": "on", "fit-kind": "absolute" },
      watch:
        "Same outlier, every unit of miss counting the same. The line should barely notice it.",
    },
    {
      label: "Plain distance, no outlier",
      setup: { "fit-outlier": "off", "fit-kind": "absolute" },
      watch: "With well-behaved data the two losses agree on almost the same line.",
    },
  ],
  "descent-lab": [
    {
      label: "Steps far too big",
      setup: { "descent-learningRate": "-0.5" },
      watch:
        "Each step overshoots the valley floor. Watch whether the loss climbs instead of falling.",
    },
    {
      label: "Tiny steps",
      setup: { "descent-learningRate": "-2.8" },
      watch: "Safe, and slow. Count how many steps it takes to get anywhere.",
    },
    {
      label: "One example at a time",
      setup: { "descent-batch": "1", "descent-speed": "40" },
      watch:
        "The slope is a guess from one point, so the path jitters, yet it still reaches the valley.",
    },
  ],
  "overfitting-lab": [
    {
      label: "Degree 12 on 14 points",
      setup: { "overfit-degree": "12", "overfit-count": "14" },
      watch:
        "The curve passes through every point. Look at the held-out error, not the training error.",
    },
    {
      label: "Degree 12 on 80 points",
      setup: { "overfit-degree": "12", "overfit-count": "80" },
      watch: "Same curve, five times the data. The wiggles have nowhere to hide.",
    },
    {
      label: "A straight line",
      setup: { "overfit-degree": "1" },
      watch:
        "Too stiff to follow the pattern: both errors high, and close together. That is underfitting.",
    },
  ],
  "neuron-lab": [
    {
      label: "Opposite corners",
      setup: { "neuron-pattern": "xor" },
      watch: "No single line separates these. Move the weights all you like; it cannot be done.",
    },
    {
      label: "A strict cut-off",
      setup: { "neuron-threshold": "0.9" },
      watch: "Very few yeses, almost all of them right. Count the misses that buys.",
    },
    {
      label: "A lenient cut-off",
      setup: { "neuron-threshold": "0.1" },
      watch:
        "Almost nothing missed, at the price of many false alarms. Neither setting is wrong; it depends what each mistake costs.",
    },
  ],
  "network-playground": [
    {
      label: "The spiral, three neurons",
      setup: { "play-pattern": "spiral", "play-layers": "1", "play-units": "3" },
      watch: "Fewer neurons than you would guess can bend a boundary this far. Give it time.",
    },
    {
      label: "XOR with two layers of ReLU",
      setup: { "play-pattern": "xor", "play-layers": "2", "play-activation": "relu" },
      watch: "The problem the single neuron could not solve. Watch the decision map fold.",
    },
    {
      label: "Learning rate far too high",
      setup: { "play-pattern": "circle", "play-learningRate": "0.5" },
      watch:
        "The loss curve jumps about instead of falling. The same lesson-01 failure, in a network.",
    },
  ],
  "embedding-lab": [
    {
      label: "No merges: letters only",
      setup: { "embed-merges": "0" },
      watch:
        "Every word is spelled out one character at a time. Count the tokens in the sample text.",
    },
    {
      label: "Two dimensions only",
      setup: { "embed-dimensions": "2" },
      watch:
        "The clusters still form, but the analogy is a coin toss: there is no room for two kinds of meaning.",
    },
    {
      label: "Eight dimensions, top speed",
      setup: { "embed-dimensions": "8", "embed-speed": "6000" },
      watch: "The analogy should now be solved every time. Watch the purity figure settle.",
    },
  ],
  "attention-lab": [
    {
      label: "…because it was too wide",
      setup: { "attn-ending": "wide" },
      watch: "One word changed at the end, and “it” looks somewhere else entirely.",
    },
    {
      label: "Focus at zero",
      setup: { "attn-sharpness": "0" },
      watch: "Every score is zero, so attention is spread evenly and the blended output is a mush.",
    },
    {
      label: "Read backwards only",
      setup: { "attn-direction": "backwards", "attn-sharpness": "4" },
      watch:
        "As a chatbot must: “it” cannot see the words after it. Does it still find the right one?",
    },
  ],
  "next-token-lab": [
    {
      label: "Twelve characters of context",
      setup: { "lm-context": "12" },
      watch:
        "Fluent, and underlined: it is reciting the book, because runs this long occur only once.",
    },
    {
      label: "Greedy: always the favourite",
      setup: { "lm-context": "4", "lm-topK": "1" },
      watch: "Top-k of one. Watch it fall into a loop and stay there.",
    },
    {
      label: "Temperature at 2.5",
      setup: { "lm-context": "3", "lm-temperature": "2.5" },
      watch: "Long shots get picked constantly. The spelling goes first.",
    },
  ],
  "scale-ladder": [
    {
      label: "A frontier model",
      setup: { "ladder-parameters": "11.6", "ladder-tokensPerParameter": "1.3" },
      watch: "Hundreds of billions of knobs, twenty tokens each. Read the training time in years.",
    },
    {
      label: "Squeezed onto a laptop",
      setup: { "ladder-parameters": "10", "ladder-bytes": "0.5" },
      watch:
        "Ten billion knobs at half a byte each. Check the storage figure against a laptop's memory.",
    },
    {
      label: "A hundred thousand chips",
      setup: { "ladder-parameters": "12", "ladder-accelerators": "5" },
      watch: "The largest model on the largest fleet. Training time falls; the bill does not.",
    },
  ],
  "table-vs-network": [
    {
      label: "Eight characters of context",
      setup: { "duel-context": "8" },
      watch:
        "The table's gap between studied and unseen text opens wide. Train the network and compare its gap.",
    },
    {
      label: "A prompt not in the book",
      setup: { "duel-prompt": "alice looked at the jabberw" },
      watch:
        "The table has never seen these characters and falls back. The network reads all of them.",
    },
    {
      label: "A quick training run",
      setup: { "duel-budget": "200000" },
      watch:
        "About fifteen seconds. Watch the unseen-text curve: it tracks the studied one closely.",
    },
  ],
  "open-book-lab": [
    {
      label: "The bunny's timepiece, by encoder",
      setup: { "book-question": "watch-own", "book-method": "encoder", "book-size": "5" },
      watch:
        "Not one word of the question is in the book. Word matching fails; the encoder finds it.",
    },
    {
      label: "Tiny passages",
      setup: { "book-size": "0" },
      watch: "Fifteen words each. Count how many answers are now cut in two by a boundary.",
    },
    {
      label: "Long passages, many of them",
      setup: { "book-size": "6", "book-keep": "10" },
      watch:
        "Nearly every answer is found, and each question now carries a good slice of the book with it.",
    },
  ],
  "fairness-lab": [
    {
      label: "Delete the group column",
      setup: { "fair-columns": "score-area" },
      watch: "The gap shrinks a little. Look at the weight on neighbourhood.",
    },
    {
      label: "No prejudice, but a head start",
      setup: { "fair-prejudice": "0", "fair-headStart": "0.6", "fair-policy": "same-rate" },
      watch:
        "Even-handed labels, unequal groups. Try each cut-off rule and watch a different pair of bars tilt.",
    },
    {
      label: "Nothing but the test score",
      setup: { "fair-columns": "score", "fair-proxy": "0" },
      watch:
        "No way to tell the groups apart. The gap closes, and the prejudice becomes a lower rate for everyone.",
    },
  ],
  "drift-lab": [
    {
      label: "A retrain that learned the old world",
      setup: {
        "drift-scenario": "sudden",
        "drift-retraining": "schedule",
        "drift-labelDelay": "6",
      },
      watch:
        "Read the Event column for the second retrain: all its data came from before the change.",
    },
    {
      label: "Monitor the inputs",
      setup: { "drift-scenario": "customers", "drift-retraining": "inputs" },
      watch: "The monitor rings and the model is retrained, for a model that was never wrong.",
    },
    {
      label: "Alarm on accuracy, labels at once",
      setup: {
        "drift-scenario": "sudden",
        "drift-retraining": "accuracy",
        "drift-labelDelay": "0",
      },
      watch:
        "The best case: the break is seen the month it happens and repaired as soon as six months of new data exist.",
    },
  ],
  "trees-lab": [
    {
      label: "A tree that memorises",
      setup: { "tree-method": "tree", "tree-depth": "12" },
      watch:
        "Nearly every training example right, and a boundary full of small boxes around single points. Read the unseen score.",
    },
    {
      label: "A hundred stumps, boosted",
      setup: { "tree-method": "boosting", "tree-depth": "1", "tree-count": "100" },
      watch:
        "Each tree asks one question. A hundred of them in turn still draw the ring. Now switch the pattern to opposite corners.",
    },
    {
      label: "A forest on opposite corners",
      setup: {
        "tree-pattern": "xor",
        "tree-method": "forest",
        "tree-depth": "12",
        "tree-count": "50",
      },
      watch:
        "Fifty memorising trees, averaged. The boxes soften and the gap between the two scores narrows.",
    },
  ],
  "cluster-lab": [
    {
      label: "Watch it settle",
      setup: { "clu-round": "0" },
      watch:
        "Round zero: the centres are only guesses. Slide “Rounds played” up one at a time and watch the loss fall with each move.",
    },
    {
      label: "The rings",
      setup: { "clu-shape": "rings", "clu-k": "2" },
      watch:
        "Two centres, two rings, and a straight fence between them. Agreement with the hidden groups is a coin toss, and the loss does not mind.",
    },
    {
      label: "A bad start",
      setup: { "clu-shape": "three", "clu-k": "3", "clu-start": "random", "clu-seed": "6" },
      watch:
        "Three round groups and three centres, and still two of them share one group. The loss is higher than the right answer's, which is how you would know without labels.",
    },
  ],
  "vision-lab": [
    {
      label: "Wired to every pixel, then moved",
      setup: { "see-design": "dense", "see-units": "32", "see-shift": "0" },
      watch:
        "Trained only on centred shapes, it scores near blind guessing once they move. Look at its weights: pictures of centred shapes.",
    },
    {
      label: "Eight filters, no more",
      setup: { "see-design": "conv", "see-units": "8", "see-shift": "0", "see-rate": "0.2" },
      watch:
        "A hundred and sixteen knobs, trained on centred shapes, naming shapes it never saw moved. Read the filters.",
    },
    {
      label: "Too big a step",
      setup: { "see-design": "conv", "see-units": "8", "see-rate": "2" },
      watch:
        "The surprise never falls. The filters' knobs are few and shared, so each step moves them a long way; lesson 01's failure, in a new machine.",
    },
  ],
  "reward-lab": [
    {
      label: "The edge route",
      setup: { "rl-algorithm": "q-learning", "rl-exploration": "0.1", "rl-episodes": "1000" },
      watch:
        "Q-learning finds the shortest route, one square from the cliff, and keeps falling off it while learning.",
    },
    {
      label: "The safe route",
      setup: { "rl-algorithm": "sarsa", "rl-exploration": "0.1", "rl-episodes": "1000" },
      watch:
        "SARSA's guesses include its own random moves. The route lengthens, the falls stop, and the reward while learning goes up.",
    },
    {
      label: "Explore a great deal",
      setup: { "rl-algorithm": "q-learning", "rl-exploration": "0.3" },
      watch:
        "Three moves in ten at random, beside a cliff. The map it learns is still the edge route; the life it lives while learning is dreadful.",
    },
  ],
  capstone: [
    {
      label: "The sensible setup",
      setup: {
        "cap-split": "three-way",
        "cap-leak": "out",
        "cap-capacity": "lean",
        "cap-metric": "cancellers",
      },
      watch: "Watch which checks flip to Passed, and which still need the cut-off moved.",
    },
    {
      label: "Keep the leak",
      setup: { "cap-split": "three-way", "cap-leak": "in" },
      watch:
        "A proper split and a spectacular score. Then read what happens on the 4,000 new customers.",
    },
    {
      label: "Catch every canceller",
      setup: { "cap-metric": "cancellers", "cap-threshold": "0.05" },
      watch:
        "Almost nobody is missed, and almost everybody is flagged. Read the retention-team check.",
    },
  ],
};

export function coachMovesFor(pathname: string): CoachMove[] {
  const name =
    pathname
      .split("/")
      .pop()
      ?.replace(/\.html$/, "") ?? "";
  return moves[name] ?? [];
}
