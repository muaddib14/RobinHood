/**
 * Verdict synthesis via OpenRouter (Ministral) — single-user personal deploy,
 * so a cheap small model is deliberate, not a compromise: this is a summarizer,
 * not a reasoning engine. Findings are computed upstream; the model only picks
 * one of the four verdict enums and writes the one-sentence verdict line.
 * Per the brief: Claude/Ministral is the phrasing layer, never the decision
 * layer — `lib/aggregate.ts` always has a rule-based fallback ready.
 */

import type { Finding, Verdict } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const envModel = process.env.OPENROUTER_MODEL;
const MODEL = !envModel || envModel === "mistralai/ministral-8b" ? "mistralai/ministral-8b-2512" : envModel;

export type SynthesisInput = { address: string; findings: Finding[] };
export type SynthesisResult = { verdict: Verdict; verdict_line: string };

const VALID_VERDICTS = new Set<Verdict>(["high_risk", "mixed", "clean", "insufficient_data"]);

const SYSTEM_PROMPT = `You write one-line risk verdicts for a Solana wallet/token scanner from structured findings.
Rules:
- Base the verdict ONLY on the findings given. Never invent data.
- Choose exactly one verdict: "high_risk" | "mixed" | "clean" | "insufficient_data".
- "insufficient_data" is a real, honest verdict — use it when findings are thin or mostly "unavailable", not as a failure.
- The verdict_line states what was FOUND, never what to do. Never write "buy", "sell", "safe to ape", "will rug", or any prediction/recommendation.
- verdict_line must be a single sentence, under 20 words, no hedging filler like "it appears that".
- Output strict JSON only, no markdown fences, no preamble: {"verdict": string, "verdict_line": string}`;

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
  if (!parsed.verdict_line || !VALID_VERDICTS.has(parsed.verdict)) {
    throw new Error("Malformed synthesis result");
  }
  return parsed;
}
