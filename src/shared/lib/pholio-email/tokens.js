/**
 * Pholio Email — design tokens.
 *
 * Derived from the shipped talent dashboard, not invented for email. The
 * dashboard's own token files are the source: cream canvas, warm ink, one gold,
 * and a three-weight hairline system. Two rules are load-bearing and were got
 * wrong before:
 *
 *   1. Gold #C9A55A is 2.33:1 on cream. It is a RULE and BORDER value only.
 *      Gold that has to be read is #806634 (4.7:1).
 *   2. The dashboard's faint text (rgba(26,26,26,.38) => ~#A5A29E) is 2.38:1
 *      once flattened onto cream — the same failure. Secondary text is #6F6D6A
 *      (4.8:1); rank is carried by size, tracking and weight instead of tint.
 */

const COLOR = {
  paper: "#FAF7F2",       // canvas — never #FFFFFF (dodges forced-inversion)
  white: "#FFFFFF",       // reserved: "these are someone else's words"
  tint: "#F6EFDF",        // gold 8% — reserved: a quoted/foreign region
  well: "#F8F8F7",        // avatar/initial backdrop

  ink: "#14120F",         // 17.6:1 — headlines, values, verdicts
  body: "#6F6D6A",        // 4.83:1 — secondary text, labels, footers
  goldText: "#806634",    // 5.08:1 — gold that must be legible as type
  attention: "#9A5B32",   // warm brown for "stale"/failed. Not red.

  gold: "#C9A55A",        // rules, borders, the sweep. NEVER type.
  goldDeep: "#A8894E",    // initials on a well
  bronzeRule: "#E4D6C0",  // the kept-on-file standing outline

  rule: "#EAE7E2",        // group  — rows inside one object
  ruleStrong: "#DBD7D1",  // separate — object from object
  ruleGold: "#EEE2C9",    // elevate — belongs to the gold system
};

const FONT = {
  serif: "Georgia,'Times New Roman',Times,serif",
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "'SF Mono',Consolas,'Courier New',monospace",
};

/** Micro-label tracking tiers. Tracking encodes rank, per the dashboard. */
const TRACK = {
  kicker: ".28em",  // chapter label
  key: ".22em",     // definition-list key
  label: ".18em",   // working label
  stamp: ".16em",   // status marker
  time: ".14em",    // timestamp
};

const LAYOUT = { width: 600, gutter: 52 };

module.exports = { COLOR, FONT, TRACK, LAYOUT };
