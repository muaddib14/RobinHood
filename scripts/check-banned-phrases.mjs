// Compliance guardrail from the brief (§14/§17): no predictions, no
// recommendations, ever, in user-facing copy. Catches drift when someone
// edits UI copy later without reading the brief.
import { readFileSync } from "node:fs";

const TARGET_FILES = [
  "app/page.tsx",
  "app/ScanShell.tsx",
  "app/Reveal.tsx",
  "app/layout.tsx",
  "app/scan/[id]/page.tsx",
];

// Whole-word, case-insensitive. Keep in sync with brief §14.
const BANNED_PHRASES = [
  "buy",
  "sell",
  "safe to ape",
  "will rug",
  "will moon",
  "guaranteed",
  "definitely",
  "recommend",
  "you should",
  "avoid this",
];

let violations = [];

for (const file of TARGET_FILES) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    for (const phrase of BANNED_PHRASES) {
      const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(line)) {
        violations.push({ file, line: i + 1, phrase, text: line.trim() });
      }
    }
  });
}

if (violations.length) {
  console.error("Banned-phrase check failed — user-facing copy must never predict or recommend:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  "${v.phrase}"  →  ${v.text}`);
  }
  process.exit(1);
}

console.log("Banned-phrase check passed.");
