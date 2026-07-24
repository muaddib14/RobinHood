import FlowVisualizer from "../../FlowVisualizer";
import type { Finding, FindingStatus } from "@/lib/types";

const STATUS_LABEL: Record<FindingStatus, string> = {
  ok: "OK",
  warn: "WARN",
  flag: "FLAG",
  unavailable: "N/A",
};

const SOURCE_LABEL: Record<Finding["source"], string> = {
  gotham: "Gotham engine",
  arkham: "Arkham",
  solanafm: "SolanaFM",
  vybe: "Vybe",
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
      <span className={`src ${f.source === "gotham" ? "own" : "arkham"}`}>{SOURCE_LABEL[f.source]}</span>
    </div>
  );
}

export default function ScanResultView({ address, findings }: { address: string; findings: Finding[] }) {
  return (
    <>
      {findings.map(renderFinding)}
      <FlowVisualizer address={address} findings={findings} />
    </>
  );
}
