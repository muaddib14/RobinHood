import Image from "next/image";
import Link from "next/link";
import { getShare } from "@/lib/shares";
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

function Nav() {
  return (
    <nav>
      <Link className="nav-brand" href="/" aria-label="GOTHAM home">
        <Image src="/logo.png" width={32} height={32} alt="" className="brand-mark" />
        <span className="wordmark">GOTHAM</span>
      </Link>
      <Link href="/" className="nav-cta">
        New scan
      </Link>
    </nav>
  );
}

export default async function SharedScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getShare(id);

  if (!result) {
    return (
      <>
        <Nav />
        <section id="scan">
          <div className="sec-head">
            <span className="eyebrow">Shared scan</span>
            <h2>Link not found</h2>
          </div>
          <div className="scan-shell">
            <div className="scan-body">
              <p className="scan-footnote">This share link doesn&apos;t exist or has been removed.</p>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Nav />
      <section id="scan">
        <div className="sec-head">
          <span className="eyebrow">Shared scan</span>
          <h2>
            {result.kind === "token" ? "Token" : "Wallet"} <em>read-only snapshot</em>
          </h2>
        </div>

        <div className="scan-shell">
          <div className="scan-input" style={{ padding: "16px 26px" }}>
            <span className="prompt">❯</span>
            <span style={{ opacity: 0.8, wordBreak: "break-all" }}>{result.address}</span>
          </div>
          <div className="scan-body">
            {result.verdict === "insufficient_data" ? (
              <p className="scan-footnote">
                This address had too little history for a meaningful read at scan time.
              </p>
            ) : (
              <>
                <div className="verdict">
                  <span className="verdict-dot" aria-hidden="true"></span>
                  <strong>{result.verdict_line}</strong>
                  <span className="time">Scanned {new Date(result.scanned_at).toLocaleString()}</span>
                </div>
                {result.findings.map(renderFinding)}
              </>
            )}
            <p className="scan-footnote">
              Verdict: <em>{result.verdict.replace("_", " ")}</em>. Snapshot from scan time — on-chain state may
              have changed since. Informational only — not financial advice.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link href="/" className="btn btn-line">
            Run your own scan
          </Link>
        </div>
      </section>
    </>
  );
}
