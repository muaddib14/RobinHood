/**
 * Verdict synthesis via OpenRouter (Ministral) — single-user personal deploy,
 * so a cheap small model is deliberate, not a compromise: this is a summarizer,
 * not a reasoning engine. Findings are computed upstream; the model only writes
 * the one-line verdict + states which layer answered.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "mistralai/ministral-8b";

export type SynthesisInput = {
  address: string;
  findings: Array<{ label: string; value: string; source: "own" | "arkham" }>;
};

export type SynthesisResult = { verdict: string; confidence: "low" | "medium" | "high" };

const SYSTEM_PROMPT = `You write one-line risk verdicts for a Solana wallet/token scanner.
Rules:
- Base the verdict ONLY on the findings given. Never invent data.
- If findings mostly come from "own" (live on-chain) with no "arkham" (entity) data, confidence is at most "medium" — the wallet may simply be too new to have entity history yet. State that plainly instead of implying certainty.
- If findings include arkham entity/risk data, you may go up to "high" confidence.
- Output strict JSON only: {"verdict": string, "confidence": "low"|"medium"|"high"}
- verdict must be a single sentence, under 20 words, no hedging filler like "it appears that".`;

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
      max_tokens: 200,
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`OpenRouter synthesis failed: ${res.status}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");

  const parsed = JSON.parse(content) as SynthesisResult;
  if (!parsed.verdict || !parsed.confidence) throw new Error("Malformed synthesis result");
  return parsed;
}
