import {
  FEATURE_NAMES,
  GROUP_NAMES,
  experiment,
  type Columns,
  type Model,
  type Policy,
  type Report,
} from "../fairness/engine";
import source from "../fairness/engine.ts?raw";
import { occupationLeans } from "../fairness/lean";
import { renderLeanBars } from "../fairness/view";
import { decodeVectors } from "../retrieval/dense";
import { mountCodePeek } from "../shared/codepeek";
import { byId, renderControls, renderStats, type ControlSpec } from "../shared/controls";
import { initLabPage } from "../shared/lab";
import { createPlot, redrawOnResize } from "../shared/plot";

interface Params extends Record<string, number | string> {
  prejudice: number;
  columns: string;
  proxy: number;
  headStart: number;
  policy: string;
}

const defaults: Params = {
  prejudice: 0.6,
  columns: "score-area-group",
  proxy: 0.8,
  headStart: 0,
  policy: "single",
};
const params: Params = { ...defaults };
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const signed = (value: number): string =>
  Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2).replace("-", "−");

const controls: ControlSpec<Params>[] = [
  {
    type: "range",
    key: "prejudice",
    label: "Prejudice in the past decisions",
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
    help: "How far the lender's staff marked Orange applicants down. These decisions are the labels the model learns from.",
  },
  {
    type: "select",
    key: "columns",
    label: "What the model may see",
    options: [
      { value: "score-area-group", label: "Test score, neighbourhood and group" },
      { value: "score-area", label: "Test score and neighbourhood" },
      { value: "score", label: "Test score only" },
    ],
  },
  {
    type: "range",
    key: "proxy",
    label: "How well neighbourhood reveals group",
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
    help: "Neighbourhood says nothing about who will repay. At 0% the groups live side by side; at 100% they hardly mix.",
  },
  {
    type: "range",
    key: "headStart",
    label: "Head start Blue applicants had in life",
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
    help: "Better schools, family money, steadier work. Above 0%, more Blue applicants really would repay, through no merit of their own.",
  },
  {
    type: "select",
    key: "policy",
    label: "Where the cut-off goes",
    options: [
      { value: "single", label: "One cut-off for everyone" },
      { value: "same-rate", label: "A cut-off per group: approve both at the same rate" },
      {
        value: "same-chance",
        label: "A cut-off per group: same chance for anyone who would repay",
      },
    ],
  },
];

const chart = byId<SVGSVGElement>("fair-chart");
let model: Model;
let report: Report;
let frame = 0;

const points = (gap: number): string => {
  const rounded = Math.round(gap * 100);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)} points`;
};

const MEASURES = [
  { key: "approved", label: "Approved" },
  { key: "ableApproved", label: "Would repay, and approved" },
  { key: "approvedAble", label: "Approved, and would repay" },
] as const;

function drawChart(): void {
  const plot = createPlot(chart, {
    base: { width: 900, height: 320 },
    xRange: [0, MEASURES.length * 3],
    yRange: [0, 130],
    yLabel: "Share of the group",
    xTicks: [],
    yTicks: [0, 25, 50, 75, 100],
    yFormat: (value) => `${value}%`,
  });
  MEASURES.forEach((measure, at) => {
    report.groups.forEach((group, which) => {
      const left = at * 3 + 0.45 + which * 1.05;
      const value = group[measure.key] * 100;
      plot.box(left, 0, left + 1, value, `plot-column ${which === 0 ? "class-a" : "class-b"}`);
      plot.text(left + 0.5, value + 4, `${Math.round(value)}%`, "plot-label strong", "middle");
      plot.text(left + 0.5, -7, GROUP_NAMES[which], "plot-axis", "middle");
    });
    // On a phone the label is too long for its pair of bars, so it goes on two lines.
    const lines = plot.narrow ? measure.label.split(", ") : [measure.label];
    lines.forEach((line, row) =>
      plot.text(
        at * 3 + 1.5,
        (plot.narrow ? 123 : 119) - row * 11,
        row < lines.length - 1 ? `${line},` : line,
        "plot-label",
        "middle",
      ),
    );
  });
}

function story(): string {
  const [blue, orange] = report.groups;
  const chance = blue.ableApproved - orange.ableApproved;
  const weights = new Map(model.weights.map((weight, at) => [FEATURE_NAMES[at], weight]));
  const onGroup = weights.get("group") ?? 0;
  const onArea = weights.get("neighbourhood") ?? 0;
  const parts: string[] = [];

  if (params.prejudice === 0 && params.headStart === 0)
    parts.push(
      "The past decisions were even-handed and the two groups are alike, so the model treats them alike. Nothing in the training has changed from lesson 03. Now give the past some prejudice.",
    );
  else if (params.prejudice > 0 && params.columns === "score-area-group")
    parts.push(
      `The model was asked to agree with the past, and it does: it has put a weight of ${signed(onGroup)} on the group column, which is the staff's mark-down, learned. An Orange applicant who would repay has a ${percent(orange.ableApproved)} chance of approval; a Blue one, ${percent(blue.ableApproved)}.${orange.approvedAble - blue.approvedAble > 0.05 ? ` Look at the third pair of bars as well: the Orange applicants who do get through repay more often (${percent(orange.approvedAble)} against ${percent(blue.approvedAble)}). That is what being held to a higher bar looks like in the figures.` : ""}`,
    );
  else if (params.prejudice > 0 && params.columns === "score-area" && Math.abs(onArea) > 0.12)
    parts.push(
      `The group column has been taken away, and the model has found the group again. Neighbourhood says nothing about who repays, yet it now carries a weight of ${signed(onArea)}, because it predicts who the staff marked down. ${Math.abs(chance) > 0.05 ? `The gap in approval for people who would repay is still ${points(chance)}.` : ""}`,
    );
  else if (params.prejudice > 0)
    parts.push(
      `Nothing the model can see reveals group, so it cannot treat the groups differently${Math.abs(chance) < 0.06 ? ", and the gap has closed" : ""}. The prejudice has not left the labels, though. The model has learned it as a lower approval rate for everybody: ${percent(report.groups[0].approved)} of Blue and ${percent(report.groups[1].approved)} of Orange applicants are approved.`,
    );

  if (params.headStart > 0) {
    const rate = blue.approved - orange.approved;
    const worth = blue.approvedAble - orange.approvedAble;
    const closed = (gap: number): boolean => Math.abs(gap) < 0.04;
    const open = [
      closed(rate) ? "" : `approval rates differ by ${points(rate)}`,
      closed(chance) ? "" : `the chance for someone who would repay differs by ${points(chance)}`,
      closed(worth)
        ? ""
        : `an approval means something different in each group (${points(worth)} in how many go on to repay)`,
    ].filter(Boolean);
    parts.push(
      `Blue applicants had a head start, so more of them really would repay, and now the three measures of fairness pull apart. With ${params.policy === "single" ? "one cut-off" : params.policy === "same-rate" ? "equal approval rates" : "an equal chance for those who would repay"}: ${open.join("; ")}. Try the other cut-off rules: each closes one gap and opens another. No setting closes all three, and that is arithmetic, not a flaw in this model.`,
    );
  }
  if (params.policy !== "single")
    parts.push(
      `Separate cut-offs (${percent(blue.cutOff)} confidence for Blue, ${percent(orange.cutOff)} for Orange) need the group to be known when the decision is made, which the law in many places restricts.`,
    );
  return parts.join(" ");
}

function draw(): void {
  ({ model, report } = experiment(
    { prejudice: params.prejudice, proxy: params.proxy, headStart: params.headStart },
    params.columns as Columns,
    params.policy as Policy,
  ));
  const [blue, orange] = report.groups;
  drawChart();
  renderStats(byId("fair-stats"), [
    { label: "Agrees with the past decisions", value: percent(report.agreesWithPast) },
    { label: "Agrees with who would repay", value: percent(report.agreesWithTruth) },
    {
      label: "Gap: would repay, and approved",
      value: points(blue.ableApproved - orange.ableApproved),
      tone: Math.abs(blue.ableApproved - orange.ableApproved) < 0.04 ? "good" : "bad",
    },
    { label: "Gap: approved", value: points(blue.approved - orange.approved) },
    {
      label: "Gap: approved, and would repay",
      value: points(blue.approvedAble - orange.approvedAble),
    },
  ]);

  const heaviest = Math.max(1.6, ...model.weights.map(Math.abs), Math.abs(model.bias));
  renderLeanBars(
    byId("fair-weights"),
    [
      ...model.weights.map((weight, at) => ({
        label: FEATURE_NAMES[at],
        value: weight,
        note:
          FEATURE_NAMES[at] === "test score"
            ? `${signed(weight)}: a higher score helps`
            : Math.abs(weight) < 0.12
              ? `${signed(weight)}: ignored`
              : `${signed(weight)}: counts against Orange`,
      })),
      {
        label: "everyone",
        value: model.bias,
        note: `${signed(model.bias)}: ${model.bias < -0.2 ? "counts against every applicant" : "no general lean"}`,
      },
    ],
    heaviest,
  );

  byId("fair-ledger").replaceChildren(
    ...report.groups.map((group, which) => {
      const row = document.createElement("tr");
      const cells = [
        GROUP_NAMES[which],
        group.people.toLocaleString("en-GB"),
        percent(group.approved),
        percent(group.ableApproved),
        percent(group.unableApproved),
        percent(group.approvedAble),
        `${percent(group.cutOff)} confident`,
      ];
      row.append(
        ...cells.map((value, column) => {
          const cell = document.createElement(column === 0 ? "th" : "td");
          if (column === 0) cell.scope = "row";
          cell.textContent = value;
          return cell;
        }),
      );
      return row;
    }),
  );

  byId("fair-outcome").textContent = story();
  byId("fair-name").textContent =
    `${percent(params.prejudice)} prejudice in the past, ${params.columns === "score-area-group" ? "model sees group" : params.columns === "score-area" ? "group column removed" : "test score only"}`;
  byId("fair-description").textContent =
    `Trained to agree with 3,000 past decisions, then tried on 6,000 new applicants. It agrees with what the staff would have decided ${percent(report.agreesWithPast)} of the time, which is the only score the lender can compute. Against who would in fact repay, which only this lab can see, it scores ${percent(report.agreesWithTruth)}.`;
  byId("fair-simulation-status").textContent =
    `Current · ${percent(params.prejudice)} prejudice · ${params.columns === "score-area-group" ? "sees group" : params.columns === "score-area" ? "no group column" : "score only"} · neighbourhood reveals group ${percent(params.proxy)} · head start ${percent(params.headStart)} · ${params.policy === "single" ? "one cut-off" : params.policy === "same-rate" ? "equal approval rates" : "equal chance for those who would repay"}`;
}

function schedule(): void {
  byId("fair-simulation-status").textContent = "Calculating…";
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

const panel = renderControls(byId("fair-controls"), "fair", controls, params, schedule);

byId("fair-reset").addEventListener("click", () => {
  Object.assign(params, defaults);
  panel.sync();
  schedule();
});

const loadButton = byId<HTMLButtonElement>("fair-load");
loadButton.addEventListener("click", () => {
  loadButton.disabled = true;
  loadButton.textContent = "Fetching…";
  void (async () => {
    try {
      const [{ default: url }, { default: list }] = await Promise.all([
        import("../data/glove.bin?url"),
        import("../data/glove-words.txt?raw"),
      ]);
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const vectors = decodeVectors(
        list.trim().split("\n"),
        new Int8Array(await response.arrayBuffer()),
        50,
      );
      const leans = occupationLeans(vectors);
      renderLeanBars(
        byId("fair-leans"),
        leans.map((entry) => ({
          label: entry.word,
          value: entry.lean,
          note: `${signed(entry.lean)}: ${Math.abs(entry.lean) < 0.05 ? "no lean to speak of" : entry.lean < 0 ? "leans towards “he”" : "leans towards “she”"}`,
        })),
        0.5,
      );
      const first = leans.slice(0, 4).map((entry) => entry.word);
      const last = leans.slice(-4).map((entry) => entry.word);
      byId("fair-leans-outcome").textContent =
        `Nobody labelled anything here. The vectors were trained only to predict which words turn up near which, and ${first.join(", ")} came out nearest “he”, ${last.reverse().join(", ")} nearest “she”. That is a measurement of how six billion words of Wikipedia and news used them, up to 2014. “Secretary” leans towards “he” because the news is full of Secretaries of State. A model built on these vectors, to rank CVs for instance, starts from here.`;
      loadButton.hidden = true;
    } catch {
      loadButton.disabled = false;
      loadButton.textContent = "Could not fetch the vectors. Try again";
    }
  })();
});

mountCodePeek(byId("code-peek"), {
  summary: "the training loop, which contains nothing about groups or fairness",
  source,
  marker: "fairness",
  pythonCaption: "The same audit with scikit-learn",
  python: `from sklearn.linear_model import LogisticRegression

model = LogisticRegression().fit(past[columns], past["approved_by_staff"])   # agree with the past
new["approved"] = model.predict_proba(new[columns])[:, 1] >= 0.5

print("agrees with staff:", (new.approved == new.approved_by_staff).mean())   # looks fine

# The audit is one groupby. It needs the group column, even if the model never saw it,
# and it needs to know who really repaid, which a lender learns only for people it approved.
for group, people in new.groupby("group"):
    print(group,
          "approved:", people.approved.mean(),
          "would repay and approved:", people.approved[people.repaid].mean(),
          "approved and would repay:", people.repaid[people.approved].mean())`,
});

draw();
redrawOnResize([chart], drawChart);
initLabPage();
