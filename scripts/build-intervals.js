/**
 * Generates src/intervals.json from the official ICS chart RDF data at
 * https://github.com/i-c-stratigraphy/chart (the linked-data rendition of the
 * International Chronostratigraphic Chart, maintained by the ICS).
 *
 * Usage:
 *   node scripts/build-intervals.js                # English -> src/intervals.json
 *   node scripts/build-intervals.js --lang=nl      # Dutch   -> src/intervals.nl.json
 *   node scripts/build-intervals.js chart.ttl      # use a local TTL copy
 *   node scripts/build-intervals.js --convention=stratigraphic
 *                                                  # "Lower Jurassic" etc.
 *
 * Any language tag present in the TTL works (en, nl, nl-be, de, fr, es, zh, ...);
 * labels missing in the chosen language fall back to English. Languages
 * without a LOCALE entry below get English subseries qualifiers and root
 * name, with a warning.
 *
 * The subseries qualifiers follow one of the two conventions shown on the
 * ICS chart, selectable with --convention:
 *   chronometric  (default)  geochronologic units of time: Early/Middle/Late
 *   stratigraphic            chronostratigraphic units of rock: Lower/Middle/Upper
 *
 * Output is a nested tree consumed by d3.hierarchy() in src/index.js:
 *   { name, abbr?, color, textColor?, start, end, children? }
 * with ages in Ma, children ordered oldest-first.
 *
 * The script runs in five steps:
 *   1. Load the TTL file (from GitHub or disk).
 *   2. Parse each `gtsd:<Name> ... .` block into a plain "concept" record.
 *   3. Assemble the concepts into a nested tree, eon down to age.
 *   4. Validate that children exactly tile their parent's time span.
 *   5. Write the JSON file.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { wcagLuminance } from "culori";

const TTL_URL =
  "https://raw.githubusercontent.com/i-c-stratigraphy/chart/main/chart.ttl";

// The subseries concepts (LowerJurassic etc.) carry no prefLabel in any
// language, so their names are composed from a qualifier and the base unit's
// label, per language and convention (the TTL ids use the stratigraphic
// Lower/Middle/Upper). The root node's name is also not part of the chart.
const LOCALE = {
  en: {
    root: "Geologic Time",
    qualifiers: {
      chronometric: { Lower: "Early", Middle: "Middle", Upper: "Late" },
      stratigraphic: { Lower: "Lower", Middle: "Middle", Upper: "Upper" },
    },
    compose: (qualifier, base) => `${qualifier} ${base}`,
  },
  nl: {
    root: "Geologische tijd",
    qualifiers: {
      chronometric: { Lower: "Vroeg", Middle: "Midden", Upper: "Laat" },
      stratigraphic: { Lower: "Onder", Middle: "Midden", Upper: "Boven" },
    },
    compose: (qualifier, base) => `${qualifier}-${base}`,
  },
  "nl-be": {
    root: "Geologische tijd",
    qualifiers: {
      chronometric: { Lower: "Vroeg", Middle: "Midden", Upper: "Laat" },
      stratigraphic: { Lower: "Onder", Middle: "Midden", Upper: "Boven" },
    },
    compose: (qualifier, base) => `${qualifier}-${base}`,
  },
};

// Known inconsistencies in the published TTL, corrected to the values printed
// on the chart PDF. Each entry overrides a parsed field for one concept.
const PATCHES = {
  // TTL gives Ludlow the Silurian–Devonian boundary (419.62) as its end, but
  // its own Ludfordian stage and the Pridoli base both put it at 422.7.
  Ludlow: { end: 422.7 },
  // TTL has 23.03, but the base of the Aquitanian *is* the base of the
  // Miocene/Neogene, which the chart puts at 23.04.
  Aquitanian: { start: 23.04 },
};

// Standard geologic map abbreviations (international, language-independent),
// shown when a cell is too narrow for the full name. Keyed by concept id.
const ABBREVIATIONS = {
  Paleozoic: "Pz",
  Mesozoic: "Mz",
  Cenozoic: "Cz",
  Cambrian: "Cm",
  Ordovician: "O",
  Silurian: "S",
  Devonian: "D",
  Carboniferous: "C",
  Permian: "P",
  Triassic: "Tr",
  Jurassic: "J",
  Cretaceous: "K",
  Paleogene: "Pg",
  Neogene: "Ng",
};

// --- Command line ------------------------------------------------------------

const args = process.argv.slice(2);
const langFlag = args.find((arg) => arg.startsWith("--lang="));
const lang = langFlag ? langFlag.slice("--lang=".length) : "en";
const conventionFlag = args.find((arg) => arg.startsWith("--convention="));
const convention = conventionFlag
  ? conventionFlag.slice("--convention=".length)
  : "chronometric";
const ttlPath = args.find((arg) => !arg.startsWith("--"));

if (convention !== "chronometric" && convention !== "stratigraphic") {
  throw new Error(
    `Unknown --convention "${convention}": use "chronometric" (Early/Late) ` +
      `or "stratigraphic" (Lower/Upper).`,
  );
}

if (!LOCALE[lang]) {
  console.warn(
    `No LOCALE entry for "${lang}": the root name and the subseries ` +
      `qualifiers will be in English ("Early Jura" etc.). Add a LOCALE ` +
      `entry to this script to localize them.`,
  );
}
const locale = LOCALE[lang] ?? LOCALE.en;
const outFileName = lang === "en" ? "intervals.json" : `intervals.${lang}.json`;
const outPath = fileURLToPath(
  new URL(`../src/${outFileName}`, import.meta.url),
);

// --- Step 1: load the TTL file -----------------------------------------------

let ttlSource;
if (ttlPath) {
  ttlSource = await readFile(ttlPath, "utf8");
} else {
  const response = await fetch(TTL_URL);
  if (!response.ok) {
    throw new Error(
      `Fetching ${TTL_URL} failed: ${response.status} ${response.statusText}`,
    );
  }
  ttlSource = await response.text();
}

// --- Step 2: parse the TTL into plain concept records --------------------------
// The file is regular enough that each `gtsd:<Name> ... .` block can be
// treated as a record; no full RDF parser is needed. A parsed concept looks
// like: { id: "Anisian", rank: "Age", parent: "MiddleTriassic",
//         label: "Anisian", color: "#BC75B7", start: 247, end: 241.464 }

/** The first capture group of `pattern` in `text`, or undefined. */
function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

/**
 * A concept can list several ranks. That happens once: Pridoli, an epoch
 * with no stages, is marked both Epoch and Age. Treat it as an Epoch.
 */
function parseRank(body) {
  const section = firstMatch(body, /gts:rank([\s\S]*?);/) ?? "";
  const ranks = Array.from(section.matchAll(/rank:([\w-]+)/g), (m) => m[1]);
  if (ranks.includes("Epoch")) {
    return "Epoch";
  }
  return ranks[0];
}

/** The concept's display name in the requested language, or English. */
function parseLabel(body) {
  const section = firstMatch(body, /skos:prefLabel([\s\S]*?);\n/) ?? "";
  return labelIn(section, lang) ?? labelIn(section, "en");
}

function labelIn(labelSection, languageTag) {
  // The (?![-\w]) guard keeps e.g. @nl from also matching @nl-be labels.
  const pattern = new RegExp(`"([^"]+)"@${languageTag}(?![-\\w])`);
  return firstMatch(labelSection, pattern);
}

/**
 * A boundary age in Ma, from a `time:hasBeginning`/`time:hasEnd` block like:
 *   time:hasBeginning [ gtsd:inMYA 247.0 ; schema:marginOfError 0.28 ; ]
 */
function parseBoundaryAge(body, boundaryPattern) {
  const block = firstMatch(body, boundaryPattern);
  if (!block) {
    return undefined;
  }
  return Number(firstMatch(block, /gtsd:inMYA ([\d.]+)/));
}

function parseConcepts(ttl) {
  const parsed = {};
  const conceptBlock = /^gtsd:(\w+)\n([\s\S]*?)^\.$/gm;
  for (const [, id, body] of ttl.matchAll(conceptBlock)) {
    if (!body.includes("a skos:Concept")) {
      continue;
    }
    const concept = {
      id,
      rank: parseRank(body),
      parent: firstMatch(body, /skos:broader gtsd:(\w+)/),
      label: parseLabel(body),
      color: firstMatch(body, /schema:color "([^"]+)"/),
      start: parseBoundaryAge(body, /time:hasBeginning\s*\[([\s\S]*?)\]/),
      end: parseBoundaryAge(body, /time:hasEnd\s*\[([\s\S]*?)\]/),
    };
    parsed[id] = Object.assign(concept, PATCHES[id]);
  }
  return parsed;
}

const concepts = parseConcepts(ttlSource);

// Ids of the Lower/Middle/Upper subdivisions of the Mississippian and
// Pennsylvanian sub-periods. They are collapsed out of the tree (see
// stagesOf) to keep it a uniform five levels deep.
const subEpochIds = new Set();
for (const concept of Object.values(concepts)) {
  if (
    concept.parent === "Mississippian" ||
    concept.parent === "Pennsylvanian"
  ) {
    subEpochIds.add(concept.id);
  }
}

// --- Step 3: assemble the tree -------------------------------------------------

function oldestFirst(list) {
  return list.slice().sort((a, b) => b.start - a.start);
}

/** Direct children of a concept that have one of the given ranks. */
function childrenOf(parentId, ranks) {
  const children = Object.values(concepts).filter(
    (concept) =>
      concept.parent === parentId &&
      ranks.includes(concept.rank) &&
      !subEpochIds.has(concept.id),
  );
  return oldestFirst(children);
}

/**
 * The display name of a concept. Subseries (LowerJurassic etc.) have no
 * label in the TTL; compose one from the base unit's name and the qualifier
 * localized for the chosen convention (chronometric "Early Jurassic" or
 * stratigraphic "Lower Jurassic").
 */
function nameOf(concept) {
  if (concept.label) {
    return concept.label;
  }
  const subseries = concept.id.match(/^(Lower|Middle|Upper)(\w+)$/);
  if (subseries && concepts[subseries[2]]) {
    const qualifier = locale.qualifiers[convention][subseries[1]];
    const baseName = nameOf(concepts[subseries[2]]);
    return locale.compose(qualifier, baseName);
  }
  // Last resort: split the CamelCase concept id into words.
  return concept.id.replace(/(?<!^)(?=[A-Z])/g, " ");
}

/**
 * White text on dark backgrounds, black (the default) on light ones,
 * decided by the WCAG relative luminance of the background color.
 */
function textColorFor(hexColor) {
  if (wcagLuminance(hexColor) < 0.36) {
    return "white";
  }
  return undefined;
}

/** An output tree node. Optional fields are omitted rather than null. */
function makeNode(concept, children) {
  const node = { name: nameOf(concept) };
  if (ABBREVIATIONS[concept.id]) {
    node.abbr = ABBREVIATIONS[concept.id];
  }
  const textColor = textColorFor(concept.color);
  if (textColor) {
    node.textColor = textColor;
  }
  node.color = concept.color;
  node.start = concept.start;
  node.end = concept.end;
  if (children.length > 0) {
    node.children = children;
  }
  return node;
}

/**
 * The stages (ages) belonging to an epoch-level concept, with two special
 * cases that keep every branch of the tree exactly five levels deep:
 *
 * - The Mississippian and Pennsylvanian are sub-periods sitting in the epoch
 *   slot; their Lower/Middle/Upper subepochs are skipped and their stages
 *   attached directly.
 * - An epoch with no stages at all (Pridoli) repeats itself as its own leaf,
 *   so that leaf spans still sum to the full timescale (src/index.js sizes
 *   cells by summing leaves).
 */
function stagesOf(epoch) {
  if (epoch.rank === "Sub-Period") {
    const stages = [];
    for (const subEpochId of subEpochIds) {
      if (concepts[subEpochId].parent === epoch.id) {
        stages.push(...childrenOf(subEpochId, ["Age"]));
      }
    }
    return oldestFirst(stages);
  }
  const stages = childrenOf(epoch.id, ["Age"]);
  if (stages.length === 0) {
    return [epoch];
  }
  return stages;
}

function buildEpoch(epoch) {
  const stageNodes = stagesOf(epoch).map((stage) => makeNode(stage, []));
  return makeNode(epoch, stageNodes);
}

function buildPeriod(period) {
  const epochs = childrenOf(period.id, ["Epoch", "Sub-Period"]);
  return makeNode(period, epochs.map(buildEpoch));
}

function buildEra(era) {
  const periods = childrenOf(era.id, ["Period"]);
  return makeNode(era, periods.map(buildPeriod));
}

function buildEon(eon) {
  const eras = childrenOf(eon.id, ["Era"]);
  return makeNode(eon, eras.map(buildEra));
}

const eons = oldestFirst(
  Object.values(concepts).filter((concept) => concept.rank === "Eon"),
);

const tree = {
  name: locale.root,
  textColor: "white",
  color: "#000",
  start: eons[0].start,
  end: 0,
  children: eons.map(buildEon),
};

// --- Step 4: validate ----------------------------------------------------------
// Children must exactly tile their parent's time span, or the partition
// layout would silently draw gaps or overlaps.

function validate(node) {
  if (!node.children) {
    return;
  }
  const children = node.children;
  const problems = [];
  if (children[0].start !== node.start) {
    problems.push("first child does not start at parent start");
  }
  if (children[children.length - 1].end !== node.end) {
    problems.push("last child does not end at parent end");
  }
  for (let i = 1; i < children.length; i++) {
    if (children[i].start !== children[i - 1].end) {
      problems.push(`gap or overlap at ${children[i].name}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`${node.name}: ${problems.join(", ")}`);
  }
  children.forEach(validate);
}

validate(tree);

// --- Step 5: write -------------------------------------------------------------

await writeFile(outPath, JSON.stringify(tree, null, 2) + "\n");

function countNodes(node) {
  let count = 1;
  for (const child of node.children ?? []) {
    count += countNodes(child);
  }
  return count;
}

console.log(`Wrote ${countNodes(tree)} intervals to ${outPath}`);
