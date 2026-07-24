"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Finding, ScanResult, FindingStatus } from "@/lib/types";

const PLACEHOLDER = "Paste a Solana token or wallet address";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Real, verified addresses — not mock data. A live scan of a known token
 * is more convincing than a mockup, per the brief. */
const SAMPLES = [
  { label: "BONK (token)", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { label: "BONK deployer (wallet)", address: "9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw" },
  { label: "USDC (clean baseline)", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
];

const LOADING_STAGES = ["Reading chain…", "Tracing funding…", "Querying entity layer…", "Synthesizing verdict…"];

const STATUS_LABEL: Record<FindingStatus, string> = {
  ok: "OK",
  warn: "WARN",
  flag: "FLAG",
  unavailable: "N/A",
};

type ApiError = { error: string; message: string; remaining?: number };
type ScanResponse = ScanResult & { remaining_scans: number };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; kind: "invalid" | "rate_limited" | "failed"; message: string }
  | { status: "done"; result: ScanResponse };

export default function ScanShell() {
  const [address, setAddress] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [stageIndex, setStageIndex] = useState(0);
  const stageTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (state.status !== "loading") {
      clearInterval(stageTimer.current);
      return;
    }
    stageTimer.current = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, LOADING_STAGES.length - 1));
    }, 1500);
    return () => {
      clearInterval(stageTimer.current);
    };
  }, [state.status]);

  async function runScan(target: string) {
    if (!target || state.status === "loading") return;
    if (!SOLANA_ADDRESS_RE.test(target)) {
      setInlineError("Not a valid Solana address — check the length and characters.");
      return;
    }
    setInlineError(null);
    setStageIndex(0);
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data as ApiError;
        if (res.status === 429) {
          setState({ status: "error", kind: "rate_limited", message: err.message });
        } else if (res.status === 400) {
          setState({ status: "error", kind: "invalid", message: err.message });
        } else {
          setState({ status: "error", kind: "failed", message: err.message ?? "Scan failed" });
        }
        return;
      }
      setState({ status: "done", result: data as ScanResponse });
    } catch {
      setState({ status: "error", kind: "failed", message: "Scan failed. Try again." });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    runScan(address.trim());
  }

  return (
    <div className="scan-shell reveal">
      <form className="scan-input" onSubmit={onSubmit}>
        <span className="prompt">❯</span>
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            if (inlineError) setInlineError(null);
          }}
          placeholder={PLACEHOLDER}
          aria-label="Token or wallet address"
        />
        <button className="scan-btn" type="submit" disabled={state.status === "loading"}>
          {state.status === "loading" ? "Scanning…" : "Scan"}
        </button>
      </form>

      {inlineError && (
        <p className="scan-footnote" style={{ color: "#ff6b6b" }}>
          {inlineError}
        </p>
      )}

      <div className="scan-samples" style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "0 26px 16px" }}>
        {SAMPLES.map((s) => (
          <button
            key={s.address}
            type="button"
            className="src own"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setAddress(s.address);
              runScan(s.address);
            }}
            disabled={state.status === "loading"}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="scan-body">
        {state.status === "idle" && (
          <p className="scan-footnote">
            Every finding shows its source. <em>Gotham engine</em> reads the chain live — it works on wallets
            minutes old. <em>Arkham</em> confirms against the largest entity database in crypto once history
            exists. Never blended into false certainty.
          </p>
        )}

        {state.status === "loading" && (
          <p className="scan-footnote">{LOADING_STAGES[stageIndex]}</p>
        )}

        {state.status === "error" && state.kind === "rate_limited" && (
          <p className="scan-footnote">You&apos;ve used your 20 free scans today. Come back tomorrow.</p>
        )}
        {state.status === "error" && state.kind === "invalid" && (
          <p className="scan-footnote">{state.message}</p>
        )}
        {state.status === "error" && state.kind === "failed" && (
          <p className="scan-footnote">Scan failed: {state.message}</p>
        )}

        {state.status === "done" && state.result.verdict === "insufficient_data" && (
          <p className="scan-footnote">
            This address has too little history for a meaningful read. Check back in an hour.
          </p>
        )}

        {state.status === "done" && state.result.verdict !== "insufficient_data" && (
          <>
            <div className="verdict">
              <span className="verdict-dot" aria-hidden="true"></span>
              <strong>{state.result.verdict_line}</strong>
              <span className="time">Answered in {(state.result.answered_ms / 1000).toFixed(1)}s</span>
            </div>
            {state.result.findings.map((f: Finding, i: number) => (
              <div className="finding" key={i}>
                <span className="f-label">
                  {f.label} <span style={{ opacity: 0.6 }}>[{STATUS_LABEL[f.status]}]</span>
                </span>
                <span
                  className="f-value"
                  dangerouslySetInnerHTML={{
                    __html: f.status === "unavailable" ? `<i>${f.summary}</i>` : f.summary,
                  }}
                />
                <span className={`src ${f.source === "gotham" ? "own" : "arkham"}`}>
                  {f.source === "gotham" ? "Gotham engine" : "Arkham"}
                </span>
              </div>
            ))}
            <p className="scan-footnote">
              Verdict: <em>{state.result.verdict.replace("_", " ")}</em>. {state.result.remaining_scans} free
              scans remaining today. Informational only — not financial advice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
