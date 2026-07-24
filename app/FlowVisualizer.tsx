"use client";

import { useMemo, useRef, useState } from "react";
import type { Finding } from "@/lib/types";

type FlowNode = {
  id: string;
  label: string;
  sub: string;
  addr: string;
  layer: number;
  type: "wallet" | "token";
  flagged: boolean;
};

type FlowEdge = {
  from: string;
  to: string;
  sol: number;
  ts: number;
  sig: string;
  flagged: boolean;
  hop: number;
};

type Hop = { hop: number; address: string; amountSol: number; ts: number; sig: string };

function short(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function solFmt(v: number) {
  return v.toFixed(4) + " SOL";
}

function ago(ts: number) {
  const h = (Date.now() - ts) / 3600000;
  if (h < 0) return "just now";
  return h < 1 ? Math.round(h * 60) + "m ago" : h.toFixed(1) + "h ago";
}

function weight(v: number) {
  return Math.max(1.1, Math.min(6.5, Math.log10(Math.max(v, 0.0001) * 1000 + 1) * 1.8));
}

const GRAPH_W = 1200;
const GRAPH_H = 420;
const PAD_X = 110;
const PAD_Y = 60;
const BUCKETS = 48;

/**
 * Real funding-chain flow visualizer — same interaction model as the
 * original mockup (drag nodes, hover tooltips, timeline brush, sortable
 * table), but data comes from `funding_trace`'s real hops, not fixtures.
 * SOL amounts, not USD — this app has no price feed anywhere, and
 * fabricating one just for this view would break "never fabricate figures".
 * No token/top-holder layer (unlike the original mockup): the backend
 * doesn't have transfer-level data for holders, only static % ownership —
 * drawing edges there would be fabricated, not real.
 */
export default function FlowVisualizer({ address, findings }: { address: string; findings: Finding[] }) {
  const fundingTrace = findings.find((f) => f.read === "funding_trace");
  const hops = useMemo(() => (fundingTrace?.data?.hops as Hop[] | undefined) ?? [], [fundingTrace]);

  const { nodes, edges, layerNames } = useMemo(() => {
    if (!hops.length) return { nodes: [] as FlowNode[], edges: [] as FlowEdge[], layerNames: [] as string[] };
    const chain = [...hops].reverse(); // oldest funder first
    // Node id is `${address}-hop${i}`, NOT the bare address — the same
    // wallet can legitimately appear at two different hops (oscillating
    // fund flow through a market maker/self-controlled hot wallet),
    // confirmed live: React threw a duplicate-key error on exactly this.
    // `addr` stays the real address for display/search/tooltip.
    const chainId = (i: number) => `${chain[i].address}-hop${i}`;
    const scannedId = `${address}-scanned`;
    const ns: FlowNode[] = chain.map((h, i) => ({
      id: chainId(i),
      label: i === 0 ? "Origin" : `Hop ${i}`,
      sub: short(h.address),
      addr: h.address,
      layer: i,
      type: "wallet",
      flagged: false,
    }));
    ns.push({
      id: scannedId,
      label: "Scanned",
      sub: short(address),
      addr: address,
      layer: chain.length,
      type: "token",
      flagged: false,
    });
    const es: FlowEdge[] = chain.map((h, i) => ({
      from: chainId(i),
      to: i + 1 < chain.length ? chainId(i + 1) : scannedId,
      sol: h.amountSol,
      ts: h.ts,
      sig: h.sig,
      flagged: false,
      hop: h.hop,
    }));
    const names = ns.map((n) => n.label);
    return { nodes: ns, edges: es, layerNames: names };
  }, [hops, address]);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const layers = useMemo(() => [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b), [nodes]);
  const colW = (GRAPH_W - PAD_X * 2) / (layers.length - 1 || 1);

  const initialPos = useMemo(() => {
    const p: Record<string, { x: number; y: number }> = {};
    layers.forEach((L) => {
      const ns = nodes.filter((n) => n.layer === L);
      const gap = (GRAPH_H - PAD_Y * 2) / (ns.length + 1);
      ns.forEach((n, i) => {
        p[n.id] = { x: PAD_X + L * colW, y: PAD_Y + gap * (i + 1) };
      });
    });
    return p;
  }, [nodes, layers, colW]);

  const [view, setView] = useState<"graph" | "table">("graph");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [minSol, setMinSol] = useState(0);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [tlStart, setTlStart] = useState(0);
  const [tlEnd, setTlEnd] = useState(1);
  const [sortKey, setSortKey] = useState<keyof FlowEdge>("ts");
  const [sortDir, setSortDir] = useState<-1 | 1>(-1);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, html: "" });
  const [pos, setPos] = useState(initialPos);
  const [now] = useState(() => Date.now());

  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tlBarsRef = useRef<HTMLDivElement>(null);
  const activeDrag = useRef<{ id: string; pointerId: number } | null>(null);
  const brushing = useRef(false);
  const bStart = useRef(0);

  if (!hops.length) {
    return (
      <p className="scan-footnote">
        No funding chain to draw — {fundingTrace?.summary?.toLowerCase() ?? "no trail found"}.
      </p>
    );
  }

  const oldestTs = Math.min(...edges.map((e) => e.ts));
  const tSpan = Math.max(now - oldestTs, 3600_000);
  const t0 = now - tSpan;

  function passes(e: FlowEdge) {
    if (e.sol < minSol) return false;
    if (flaggedOnly && !e.flagged) return false;
    const a = t0 + tSpan * tlStart;
    const b = t0 + tSpan * tlEnd;
    if (e.ts < a || e.ts > b) return false;
    if (search) {
      const q = search.toLowerCase();
      const f = nodeById[e.from];
      const t = nodeById[e.to];
      if (!(f.label + f.addr + t.label + t.addr).toLowerCase().includes(q)) return false;
    }
    if (focus && e.from !== focus && e.to !== focus) return false;
    return true;
  }

  const visibleEdges = edges.filter(passes);
  const liveNodeIds = new Set(visibleEdges.flatMap((e) => [e.from, e.to]));

  function resetLayout() {
    setPos(initialPos);
    setFocus(null);
  }

  function handlePointerDownNode(e: React.PointerEvent<SVGGElement>, id: string) {
    e.stopPropagation();
    activeDrag.current = { id, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setTooltip((p) => ({ ...p, show: false }));
  }
  function handlePointerMoveNode(e: React.PointerEvent<SVGGElement>) {
    if (!activeDrag.current || !svgRef.current) return;
    const { id } = activeDrag.current;
    const r = svgRef.current.getBoundingClientRect();
    const nx = Math.max(40, Math.min(GRAPH_W - 40, ((e.clientX - r.left) / r.width) * GRAPH_W));
    const ny = Math.max(44, Math.min(GRAPH_H - 40, ((e.clientY - r.top) / r.height) * GRAPH_H));
    setPos((p) => ({ ...p, [id]: { x: nx, y: ny } }));
  }
  function handlePointerUpNode(e: React.PointerEvent<SVGGElement>) {
    if (activeDrag.current) {
      try {
        e.currentTarget.releasePointerCapture(activeDrag.current.pointerId);
      } catch {}
      activeDrag.current = null;
    }
  }
  function showTip(e: React.PointerEvent, html: string) {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    let x = e.clientX - r.left + 14;
    let y = e.clientY - r.top + 14;
    if (x > r.width - 270) x = r.width - 270;
    if (y > r.height - 110) y = r.height - 110;
    setTooltip({ show: true, x, y, html });
  }
  function hideTip() {
    setTooltip((p) => ({ ...p, show: false }));
  }
  function getBucketIndex(clientX: number) {
    if (!tlBarsRef.current) return 0;
    const r = tlBarsRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }
  function handleTlDown(e: React.PointerEvent) {
    const v = getBucketIndex(e.clientX);
    bStart.current = v;
    brushing.current = true;
    setTlStart(v);
    setTlEnd(v);
  }
  function handleTlMove(e: React.PointerEvent) {
    if (!brushing.current) return;
    const p = getBucketIndex(e.clientX);
    setTlStart(Math.min(bStart.current, p));
    setTlEnd(Math.max(bStart.current, p));
  }
  function handleTlUp() {
    if (!brushing.current) return;
    brushing.current = false;
    if (tlEnd - tlStart < 0.02) {
      setTlStart(0);
      setTlEnd(1);
    }
  }
  function handleSort(key: keyof FlowEdge) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const sortedRows = [...visibleEdges].sort((a, b) => {
    let va: string | number, vb: string | number;
    if (sortKey === "from" || sortKey === "to") {
      va = nodeById[a[sortKey]].label;
      vb = nodeById[b[sortKey]].label;
    } else {
      va = a[sortKey] as string | number;
      vb = b[sortKey] as string | number;
    }
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
  });

  const vols = Array(BUCKETS).fill(0);
  edges.forEach((e) => {
    const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((e.ts - t0) / tSpan) * BUCKETS)));
    vols[i] += e.sol;
  });
  const maxVol = Math.max(...vols, 0.0001);
  const spanHours = Math.round(tSpan / 3600_000);

  return (
    <div className="flow-vis-container">
      <div className="flow-head">
        <div className="eyebrow">Scan detail · funding graph</div>
        <h2>
          Where the money <em>came from</em>
        </h2>
        <div className="addr">
          {short(address)} · {hops.length} hop{hops.length === 1 ? "" : "s"} traced · {edges.length} transfer
          {edges.length === 1 ? "" : "s"} indexed
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs">
          <button type="button" className={`tab ${view === "graph" ? "on" : ""}`} onClick={() => setView("graph")}>
            Flow graph
          </button>
          <button type="button" className={`tab ${view === "table" ? "on" : ""}`} onClick={() => setView("table")}>
            Transactions
          </button>
        </div>
        <button
          type="button"
          className={`chip ${flaggedOnly ? "on" : ""}`}
          onClick={() => setFlaggedOnly(!flaggedOnly)}
        >
          Flagged paths only
        </button>
        <div className="ctrl">
          Min SOL
          <input
            type="range"
            min="0"
            max={Math.max(...edges.map((e) => e.sol), 0.01)}
            step="0.0001"
            value={minSol}
            onChange={(e) => setMinSol(Number(e.target.value))}
          />
          <span style={{ color: "var(--neon)" }}>{minSol.toFixed(4)} SOL</span>
        </div>
        <div className="spacer"></div>
        <div className="ctrl">
          Search
          <input
            type="text"
            placeholder="address"
            style={{ width: "150px" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="stage" ref={stageRef} style={{ display: view === "graph" ? "block" : "none" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={(e) => {
            if (e.target === svgRef.current && focus) setFocus(null);
          }}
        >
          {layers.map((L) => (
            <g key={L}>
              <text x={PAD_X + L * colW} y={30} className="layer-label" textAnchor="middle">
                {layerNames[L] || `Layer ${L}`}
              </text>
              <line
                x1={PAD_X + L * colW}
                y1={40}
                x2={PAD_X + L * colW}
                y2={GRAPH_H - 24}
                stroke="rgba(204,255,0,.09)"
                strokeWidth={1}
              />
            </g>
          ))}

          {edges.map((e, idx) => {
            const on = visibleEdges.includes(e);
            const a = pos[e.from];
            const b = pos[e.to];
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const d = `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
            const edgeTip = `<b>${solFmt(e.sol)}</b><br>${nodeById[e.from]?.label} → ${nodeById[e.to]?.label}<br>${ago(e.ts)}<br><a href="https://solscan.io/tx/${e.sig}" target="_blank" rel="noreferrer" style="color:var(--neon)">${short(e.sig)}</a>`;
            return (
              <g key={idx}>
                <path d={d} className={`edge normal ${on ? "" : "dimmed"}`} strokeWidth={weight(e.sol)} />
                <path
                  d={d}
                  className="edge-hit"
                  onPointerEnter={(ev) => showTip(ev, edgeTip)}
                  onPointerLeave={hideTip}
                />
              </g>
            );
          })}

          {nodes.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const r = n.type === "token" ? 24 : 19;
            const isLive = liveNodeIds.has(n.id) || visibleEdges.length === 0;
            const nodeTip = `<b>${n.label}</b><br>${n.addr}<span class="t-src own">Gotham engine</span>`;
            return (
              <g
                key={n.id}
                className={`node ${n.flagged ? "flagged " : ""}${focus === n.id ? "focus " : ""}${isLive ? "" : "dimmed"}`}
                transform={`translate(${p.x},${p.y})`}
                tabIndex={0}
                onPointerDown={(ev) => handlePointerDownNode(ev, n.id)}
                onPointerMove={handlePointerMoveNode}
                onPointerUp={handlePointerUpNode}
                onPointerCancel={handlePointerUpNode}
                onPointerEnter={(ev) => showTip(ev, nodeTip)}
                onPointerLeave={hideTip}
                onClick={() => setFocus(focus === n.id ? null : n.id)}
              >
                <circle className="ring" r={r} />
                <text className="glyph" y={4}>
                  {n.type === "token" ? "◎" : "·"}
                </text>
                <text className="nlabel" y={r + 16}>
                  {n.label}
                </text>
                <text className="nsub" y={r + 28}>
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          className={`tip ${tooltip.show ? "show" : ""}`}
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />

        <div className="legend">
          <span>
            <i />
            Funding transfer
          </span>
          <span>
            <i className="sq" />
            Wallet
          </span>
          <span>Line weight = SOL value</span>
        </div>

        <button type="button" className="reset" onClick={resetLayout}>
          Reset layout
        </button>
      </div>

      <div className="timeline">
        <div className="tl-head">
          <span>Transfer volume over time — drag to filter</span>
          <span>
            {tlStart === 0 && tlEnd === 1
              ? `All ${spanHours}h`
              : `−${Math.round(spanHours - tlStart * spanHours)}h → −${Math.round(spanHours - tlEnd * spanHours)}h`}
          </span>
        </div>
        <div className="tl-bars" ref={tlBarsRef} onPointerDown={handleTlDown} onPointerMove={handleTlMove} onPointerUp={handleTlUp}>
          {vols.map((v, i) => {
            const f = i / BUCKETS;
            const isOn = f >= tlStart && f <= tlEnd;
            return <div key={i} className={`tl-bar ${isOn ? "on" : ""}`} style={{ height: `${Math.max(2, (v / maxVol) * 46)}px` }} />;
          })}
        </div>
        <div className="tl-axis">
          <span>−{spanHours}h</span>
          <span>−{Math.round(spanHours * 0.66)}h</span>
          <span>−{Math.round(spanHours * 0.33)}h</span>
          <span>Now</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Transaction history</h2>
          <span className="count">
            {sortedRows.length} of {edges.length} transfers
          </span>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort("ts")} className={sortKey === "ts" ? "sorted" : ""}>
                  Time <span className="arw">{sortKey === "ts" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th onClick={() => handleSort("from")} className={sortKey === "from" ? "sorted" : ""}>
                  From <span className="arw">{sortKey === "from" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th onClick={() => handleSort("to")} className={sortKey === "to" ? "sorted" : ""}>
                  To <span className="arw">{sortKey === "to" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th onClick={() => handleSort("sol")} className={sortKey === "sol" ? "sorted" : ""}>
                  Value <span className="arw">{sortKey === "sol" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th onClick={() => handleSort("hop")} className={sortKey === "hop" ? "sorted" : ""}>
                  Hop <span className="arw">{sortKey === "hop" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No transfers match these filters
                  </td>
                </tr>
              ) : (
                sortedRows.map((e, idx) => {
                  const f = nodeById[e.from];
                  const t = nodeById[e.to];
                  return (
                    <tr key={idx}>
                      <td>{ago(e.ts)}</td>
                      <td>
                        <span className="mono-b">{f?.label}</span> {f?.addr && short(f.addr)}
                      </td>
                      <td>
                        <span className="mono-b">{t?.label}</span> {t?.addr && short(t.addr)}
                      </td>
                      <td className="mono-b">{solFmt(e.sol)}</td>
                      <td>{e.hop}</td>
                      <td>
                        <a href={`https://solscan.io/tx/${e.sig}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          {short(e.sig)}
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="note">
          All rows sourced by <em>Gotham engine</em>, read live from chain. Amounts in SOL, not USD-converted — no
          price feed dependency. Click any node in the graph to filter this log to that wallet.
        </p>
      </div>
    </div>
  );
}
