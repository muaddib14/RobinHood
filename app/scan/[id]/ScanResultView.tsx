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

export default function ScanResultView({ address, findings }: { address: string; findings: Finding[] }) {
  return (
    <>
      {findings.map(renderFinding)}
      <p className="scan-footnote" style={{ padding: "16px 26px 0", opacity: 0.7 }}>
        Funding flow
      </p>
      <FundingGraph address={address} findings={findings} />
    </>
  );
}
