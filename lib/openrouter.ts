/**
 * Verdict-line synthesis via OpenRouter — single-user personal deploy, zero
 * budget, so this deliberately runs on a free-tier model, not a paid one.
 * `google/gemma-4-26b-a4b-it:free` confirmed live: clean JSON output,
 * `finish_reason: "stop"` (not truncated), no hidden reasoning-token
 * burn. Reasoning models (e.g. gpt-oss-20b:free) were tried and rejected —
 * they spend the entire token budget on chain-of-thought before ever
 * emitting content, so `max_tokens: 75` returns null every time.
 *
 * This ONLY writes the one-sentence phrasing. The verdict enum itself is
 * always rule-based (see `ruleBasedVerdict` in aggregate.ts) — confirmed
 * live that this model can write an accurate sentence while mislabeling
 * severity (called a scan "clean" despite a flagged LP-lock finding), so
 * its judgment on severity is never trusted, only its prose.
 */

import type { Finding } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

export type SynthesisInput = { address: string; findings: Finding[] };
export type SynthesisResult = { verdict_line: string };

const SYSTEM_PROMPT = `You write one-line risk summaries for a Solana wallet/token scanner from structured findings.
Rules:
- Base the summary ONLY on the findings given. Never invent data.
- Mention every flagged finding — never omit a flag to sound more positive than the findings support.
- State what was FOUND, never what to do. Never write "buy", "sell", "safe to ape", "will rug", or any prediction/recommendation.
- Must be a single sentence, under 20 words, no hedging filler like "it appears that".
- Output strict JSON only, no markdown fences, no preamble: {"verdict_line": string}`;

export async function synthesizeVerdict(input: SynthesisInput): Promise<SynthesisResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 75,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter synthesis failed (${res.status}): ${errText}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");

  // Strip stray markdown fences some models add despite instructions.
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as SynthesisResult;
  if (!parsed.verdict_line) {
    throw new Error("Malformed synthesis result");
  }
  return parsed;
}
