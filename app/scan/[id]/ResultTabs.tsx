"use client";

import { useState } from "react";
import FundingGraph from "../../FundingGraph";
import type { Finding, FindingStatus } from "@/lib/types";

const STATUS_LABEL: Record<FindingStatus, string> = {
  ok: "OK",
  warn: "WARN",
  flag: "FLAG",
  unavailable: "N/A",
};

function renderFinding(f: Finding, i: number) {
  return (
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
  );
}

export default function ResultTabs({ address, findings }: { address: string; findings: Finding[] }) {
  const [tab, setTab] = useState<"findings" | "graph">("findings");

  return (
    <>
      <div style={{ display: "flex", gap: "8px", padding: "0 26px 10px" }}>
        <button
          type="button"
          className={`src ${tab === "findings" ? "own" : ""}`}
          style={{ cursor: "pointer", opacity: tab === "findings" ? 1 : 0.5 }}
          onClick={() => setTab("findings")}
        >
          Findings
        </button>
        <button
          type="button"
          className={`src ${tab === "graph" ? "own" : ""}`}
          style={{ cursor: "pointer", opacity: tab === "graph" ? 1 : 0.5 }}
          onClick={() => setTab("graph")}
        >
          Flow graph
        </button>
      </div>
      {tab === "findings" ? findings.map(renderFinding) : <FundingGraph address={address} findings={findings} />}
    </>
  );
}
