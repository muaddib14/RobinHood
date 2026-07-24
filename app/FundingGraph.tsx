"use client";

import { useState } from "react";
import type { Finding } from "@/lib/types";

type Hop = { hop: number; address: string; amountSol: number; ts: number; sig: string };

function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function ago(ts: number) {
  const h = (Date.now() - ts) / 3_600_000;
  return h < 1 ? `${Math.round(h * 60)}m ago` : `${h.toFixed(1)}h ago`;
}

/**
 * Funding chain only — not the full multi-directional graph (token layer,
 * top holders) from the original mockup. Those need transfer data (amount +
 * time) this app doesn't capture for holders, only static % ownership.
 * Rendering a graph implying transfer history there would be fabricated.
 */
export default function FundingGraph({ address, findings }: { address: string; findings: Finding[] }) {
  const [hoveredSig, setHoveredSig] = useState<string | null>(null);
  const fundingTrace = findings.find((f) => f.read === "funding_trace");
  const hops = (fundingTrace?.data?.hops as Hop[] | undefined) ?? [];

  if (!hops.length) {
    return (
      <p className="scan-footnote">
        No funding chain to draw — {fundingTrace?.summary?.toLowerCase() ?? "no trail found"}.
      </p>
    );
  }

  // Chain runs oldest -> newest: last hop funded the one before it, ... hop 1 funded the scanned address.
  const chain = [...hops].reverse().map((h) => ({ ...h, target: null as string | null }));
  const nodeAddrs = [...chain.map((h) => h.address), address];

  const W = Math.max(560, nodeAddrs.length * 170);
  const H = 160;
  const gap = (W - 80) / (nodeAddrs.length - 1 || 1);
  const positions = nodeAddrs.map((_, i) => ({ x: 40 + gap * i, y: H / 2 }));

  return (
    <div>
      <div style={{ overflowX: "auto", padding: "16px 0" }}>
        <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
          {chain.map((h, i) => {
            const a = positions[i];
            const b = positions[i + 1];
            return (
              <g key={h.sig}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--neon)"
                  strokeWidth={hoveredSig === h.sig ? 2.5 : 1.4}
                  opacity={hoveredSig && hoveredSig !== h.sig ? 0.3 : 1}
                />
                <rect
                  x={(a.x + b.x) / 2 - 45}
                  y={a.y - 22}
                  width={90}
                  height={16}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredSig(h.sig)}
                  onMouseLeave={() => setHoveredSig(null)}
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={a.y - 10}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--pale, #B9E88F)"
                  style={{ pointerEvents: "none" }}
                >
                  {h.amountSol.toFixed(4)} SOL
                </text>
              </g>
            );
          })}
          {positions.map((p, i) => {
            const isLast = i === positions.length - 1;
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={isLast ? 16 : 12} fill="none" stroke="var(--neon)" strokeWidth={1.4} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fill="var(--neon)">
                  {isLast ? "◎" : "•"}
                </text>
                <text x={p.x} y={p.y + 32} textAnchor="middle" fontSize="9" fill="var(--pale, #B9E88F)">
                  {isLast ? "Scanned" : short(nodeAddrs[i])}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="tbl-wrap" style={{ border: "1px solid var(--line)", overflowX: "auto", marginTop: "12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", opacity: 0.6 }}>Hop</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", opacity: 0.6 }}>Funder</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", opacity: 0.6 }}>Amount</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", opacity: 0.6 }}>When</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", opacity: 0.6 }}>Tx</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((h) => (
              <tr
                key={h.sig}
                onMouseEnter={() => setHoveredSig(h.sig)}
                onMouseLeave={() => setHoveredSig(null)}
                style={{ background: hoveredSig === h.sig ? "rgba(204,255,0,.08)" : "transparent" }}
              >
                <td style={{ padding: "10px 12px", fontSize: "11px", borderTop: "1px dashed rgba(204,255,0,.13)" }}>
                  {h.hop}
                </td>
                <td style={{ padding: "10px 12px", fontSize: "11px", borderTop: "1px dashed rgba(204,255,0,.13)" }}>
                  {short(h.address)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: "11px", borderTop: "1px dashed rgba(204,255,0,.13)" }}>
                  {h.amountSol.toFixed(6)} SOL
                </td>
                <td style={{ padding: "10px 12px", fontSize: "11px", borderTop: "1px dashed rgba(204,255,0,.13)" }}>
                  {ago(h.ts)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: "11px", borderTop: "1px dashed rgba(204,255,0,.13)" }}>
                  <a
                    href={`https://solscan.io/tx/${h.sig}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "underline" }}
                  >
                    {short(h.sig)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="scan-footnote" style={{ marginTop: "10px" }}>
        Funding chain only, oldest funder to scanned address. Amounts and timestamps read live from chain — not
        USD-converted (no price feed dependency).
      </p>
    </div>
  );
}
