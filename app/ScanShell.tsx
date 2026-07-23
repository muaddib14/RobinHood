"use client";

import { useState, type FormEvent } from "react";

type Finding = { label: string; value: string; source: "own" | "arkham" };
type ScanResult = {
  address: string;
  verdict: string;
  confidence: "low" | "medium" | "high";
  elapsedMs: number;
  findings: Finding[];
};

const PLACEHOLDER = "Paste a Solana token or wallet address";

export default function ScanShell() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: ScanResult }
  >({ status: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!address.trim() || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setState({ status: "done", result: data });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Scan failed" });
    }
  }

  return (
    <div className="scan-shell reveal">
      <form className="scan-input" onSubmit={onSubmit}>
        <span className="prompt">❯</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-label="Token or wallet address"
        />
        <button className="scan-btn" type="submit" disabled={state.status === "loading"}>
          {state.status === "loading" ? "Scanning…" : "Scan"}
        </button>
      </form>

      <div className="scan-body">
        {state.status === "idle" && (
          <p className="scan-footnote">
            Every finding shows its source. <em>Gotham engine</em> reads the chain live — it works on wallets
            minutes old. <em>Arkham</em> confirms against the largest entity database in crypto once history
            exists. Never blended into false certainty.
          </p>
        )}

        {state.status === "error" && (
          <p className="scan-footnote">Scan failed: {state.message}</p>
        )}

        {state.status === "done" && (
          <>
            <div className="verdict">
              <span className="verdict-dot" aria-hidden="true"></span>
              <strong>{state.result.verdict}</strong>
              <span className="time">Answered in {(state.result.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
            {state.result.findings.length === 0 && (
              <p className="scan-footnote">No findings returned — address may have no on-chain history.</p>
            )}
            {state.result.findings.map((f, i) => (
              <div className="finding" key={i}>
                <span className="f-label">{f.label}</span>
                <span className="f-value">{f.value}</span>
                <span className={`src ${f.source}`}>{f.source === "own" ? "Gotham engine" : "Arkham"}</span>
              </div>
            ))}
            <p className="scan-footnote">
              Confidence: <em>{state.result.confidence}</em>. Every finding shows its source — never blended into
              false certainty.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
