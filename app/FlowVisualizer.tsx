"use client";

import { useRef, useState } from "react";

export type FlowNode = {
  id: string;
  label: string;
  sub: string;
  addr: string;
  layer: number;
  type: "entity" | "wallet" | "token";
  flagged: boolean;
  source: "gotham" | "arkham";
};

export type FlowEdge = {
  from: string;
  to: string;
  usd: number;
  token: string;
  ts: number;
  sig: string;
  flagged: boolean;
  dir: "in" | "out";
  hop: number;
};

const DEFAULT_NODES: FlowNode[] = [
  { id: "cex", label: "Binance", sub: "CEX hot wallet", addr: "2ojv…8Kdp", layer: 0, type: "entity", flagged: false, source: "arkham" },
  { id: "src", label: "Unlabeled", sub: "origin cluster", addr: "4kPq…j2Wn", layer: 0, type: "wallet", flagged: true, source: "gotham" },
  { id: "h1a", label: "Hop 1", sub: "funded 6 deployers", addr: "9wRt…5mHz", layer: 1, type: "wallet", flagged: true, source: "gotham" },
  { id: "h1b", label: "Hop 1", sub: "clean", addr: "3bYu…7nFq", layer: 1, type: "wallet", flagged: false, source: "gotham" },
  { id: "h2", label: "Hop 2", sub: "splitter", addr: "6cLm…2xTv", layer: 2, type: "wallet", flagged: true, source: "gotham" },
  { id: "dep", label: "Deployer", sub: "3 hours old", addr: "8vNq…3pLk", layer: 3, type: "wallet", flagged: true, source: "gotham" },
  { id: "h20a", label: "Top holder", sub: "12.4% supply", addr: "5tGh…9wSx", layer: 3, type: "wallet", flagged: true, source: "gotham" },
  { id: "h20b", label: "Top holder", sub: "profitable wallet", addr: "7yUi…4kMn", layer: 3, type: "wallet", flagged: false, source: "arkham" },
  { id: "tok", label: "$TOKEN", sub: "the mint", addr: "7xKX…9fQm", layer: 4, type: "token", flagged: false, source: "gotham" },
];

const NOW = 1784820000000;
const H = (h: number) => NOW - h * 3600 * 1000;

const DEFAULT_EDGES: FlowEdge[] = [
  { from: "cex", to: "src", usd: 128400, token: "SOL", ts: H(71), sig: "5Ke…a91", flagged: false, dir: "out", hop: 0 },
  { from: "src", to: "h1a", usd: 62100, token: "SOL", ts: H(69), sig: "2Wq…f30", flagged: true, dir: "out", hop: 1 },
  { from: "src", to: "h1b", usd: 18700, token: "SOL", ts: H(66), sig: "8Rt…c72", flagged: false, dir: "out", hop: 1 },
  { from: "h1a", to: "h2", usd: 41300, token: "SOL", ts: H(52), sig: "3Yu…d18", flagged: true, dir: "out", hop: 2 },
  { from: "h1b", to: "h2", usd: 9200, token: "SOL", ts: H(48), sig: "6Pl…b44", flagged: false, dir: "out", hop: 2 },
  { from: "h2", to: "dep", usd: 27800, token: "SOL", ts: H(6), sig: "9Nm…e07", flagged: true, dir: "out", hop: 3 },
  { from: "h2", to: "h20a", usd: 12600, token: "SOL", ts: H(5), sig: "4Jk…a55", flagged: true, dir: "out", hop: 3 },
  { from: "dep", to: "tok", usd: 22400, token: "SOL", ts: H(3), sig: "7Zx…f81", flagged: true, dir: "out", hop: 4 },
  { from: "h20a", to: "tok", usd: 11900, token: "USDC", ts: H(2.4), sig: "1Qw…c63", flagged: true, dir: "in", hop: 4 },
  { from: "h20b", to: "tok", usd: 8300, token: "USDC", ts: H(2.1), sig: "5Vb…d29", flagged: false, dir: "in", hop: 4 },
  { from: "tok", to: "h20a", usd: 34200, token: "TOKEN", ts: H(0.6), sig: "8Hn…b90", flagged: true, dir: "out", hop: 4 },
  { from: "tok", to: "h20b", usd: 4100, token: "TOKEN", ts: H(0.4), sig: "2Fg…e12", flagged: false, dir: "out", hop: 4 },
];

const LAYER_NAMES = ["Origin", "Hop 1", "Hop 2", "Deployer & holders", "Token"];
const BUCKETS = 48;
const T_SPAN = 72 * 3600 * 1000;

function usdFmt(v: number) {
  return "$" + v.toLocaleString("en-US");
}

function ago(ts: number) {
  const h = (NOW - ts) / 3600000;
  return h < 1 ? Math.round(h * 60) + "m ago" : h.toFixed(1) + "h ago";
}

function weight(v: number) {
  return Math.max(1.1, Math.min(6.5, Math.log10(Math.max(v, 10)) * 1.45));
}
const NODE_BY_ID: Record<string, FlowNode> = DEFAULT_NODES.reduce((acc, n) => {
  acc[n.id] = n;
  return acc;
}, {} as Record<string, FlowNode>);

const GRAPH_W = 1200;
const GRAPH_H = 560;
const PAD_X = 110;
const PAD_Y = 70;
const LAYERS = Array.from(new Set(DEFAULT_NODES.map((n) => n.layer))).sort((a, b) => a - b);
const COL_W = (GRAPH_W - PAD_X * 2) / (LAYERS.length - 1 || 1);

const INITIAL_POS: Record<string, { x: number; y: number }> = {};
LAYERS.forEach((L) => {
  const ns = DEFAULT_NODES.filter((n) => n.layer === L);
  const gap = (GRAPH_H - PAD_Y * 2) / (ns.length + 1);
  ns.forEach((n, i) => {
    INITIAL_POS[n.id] = { x: PAD_X + L * COL_W, y: PAD_Y + gap * (i + 1) };
  });
});
export default function FlowVisualizer() {
  const [view, setView] = useState<"graph" | "table">("graph");
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [minUsd, setMinUsd] = useState(0);
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [tlStart, setTlStart] = useState(0);
  const [tlEnd, setTlEnd] = useState(1);
  const [sortKey, setSortKey] = useState<keyof FlowEdge | "source">("ts");
  const [sortDir, setSortDir] = useState<-1 | 1>(-1);

  const [tooltip, setTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    html: string;
  }>({ show: false, x: 0, y: 0, html: "" });

  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tlBarsRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({ ...INITIAL_POS });

  const resetLayout = () => {
    setPos({ ...INITIAL_POS });
    setFocus(null);
  };


  const passes = (e: FlowEdge) => {
    if (e.usd < minUsd) return false;
    if (dir !== "all" && e.dir !== dir) return false;
    if (flaggedOnly && !e.flagged) return false;
    const t0 = NOW - T_SPAN;
    const a = t0 + T_SPAN * tlStart;
    const b = t0 + T_SPAN * tlEnd;
    if (e.ts < a || e.ts > b) return false;
    if (search) {
      const q = search.toLowerCase();
      const f = NODE_BY_ID[e.from];
      const t = NODE_BY_ID[e.to];
      if (!(f.label + f.addr + t.label + t.addr + e.token).toLowerCase().includes(q)) return false;
    }
    if (focus && e.from !== focus && e.to !== focus) return false;
    return true;
  };

  const visibleEdges = DEFAULT_EDGES.filter(passes);

  // Dragging support
  const activeDrag = useRef<{ id: string; pointerId: number } | null>(null);

  const handlePointerDownNode = (e: React.PointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    activeDrag.current = { id, pointerId: e.pointerId };
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    setTooltip((prev) => ({ ...prev, show: false }));
  };

  const handlePointerMoveNode = (e: React.PointerEvent<SVGGElement>) => {
    if (!activeDrag.current || !svgRef.current) return;
    const { id } = activeDrag.current;
    const r = svgRef.current.getBoundingClientRect();
    const nx = Math.max(40, Math.min(GRAPH_W - 40, ((e.clientX - r.left) / r.width) * GRAPH_W));
    const ny = Math.max(44, Math.min(GRAPH_H - 40, ((e.clientY - r.top) / r.height) * GRAPH_H));
    setPos((prev) => ({ ...prev, [id]: { x: nx, y: ny } }));
  };

  const handlePointerUpNode = (e: React.PointerEvent<SVGGElement>) => {
    if (activeDrag.current) {
      try {
        (e.currentTarget as SVGGElement).releasePointerCapture(activeDrag.current.pointerId);
      } catch {}
      activeDrag.current = null;
    }
  };

  // Tooltip handlers
  const handleShowTip = (e: React.PointerEvent, html: string) => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    let x = e.clientX - r.left + 14;
    let y = e.clientY - r.top + 14;
    if (x > r.width - 270) x = r.width - 270;
    if (y > r.height - 110) y = r.height - 110;
    setTooltip({ show: true, x, y, html });
  };

  const handleHideTip = () => {
    setTooltip((prev) => ({ ...prev, show: false }));
  };

  // Timeline brush support
  const [brushing, setBrushing] = useState(false);
  const bStart = useRef(0);

  const getBucketIndex = (clientX: number) => {
    if (!tlBarsRef.current) return 0;
    const r = tlBarsRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const handleTlDown = (e: React.PointerEvent) => {
    const val = getBucketIndex(e.clientX);
    bStart.current = val;
    setBrushing(true);
    setTlStart(val);
    setTlEnd(val);
  };

  const handleTlMove = (e: React.PointerEvent) => {
    if (!brushing) return;
    const p = getBucketIndex(e.clientX);
    setTlStart(Math.min(bStart.current, p));
    setTlEnd(Math.max(bStart.current, p));
  };

  const handleTlUp = () => {
    if (!brushing) return;
    setBrushing(false);
    if (tlEnd - tlStart < 0.02) {
      setTlStart(0);
      setTlEnd(1);
    }
  };

  // Sorted Table Rows
  const sortedRows = [...visibleEdges].sort((a, b) => {
    let va: string | number | boolean;
    let vb: string | number | boolean;
    if (sortKey === "from" || sortKey === "to") {
      va = NODE_BY_ID[a[sortKey]].label;
      vb = NODE_BY_ID[b[sortKey]].label;
    } else if (sortKey === "source") {
      va = a.flagged ? "gotham" : "arkham";
      vb = b.flagged ? "gotham" : "arkham";
    } else {
      va = a[sortKey];
      vb = b[sortKey];
    }
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
  });

  const handleSort = (key: keyof FlowEdge | "source") => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  // Timeline bars data
  const t0 = NOW - T_SPAN;
  const vols = Array(BUCKETS).fill(0);
  const flags = Array(BUCKETS).fill(false);
  DEFAULT_EDGES.forEach((e) => {
    const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((e.ts - t0) / T_SPAN) * BUCKETS)));
    vols[i] += e.usd;
    if (e.flagged) flags[i] = true;
  });
  const maxVol = Math.max(...vols, 1);

  const liveNodeIds = new Set(visibleEdges.flatMap((e) => [e.from, e.to]));

  return (
    <div className="flow-vis-container reveal">
      {/* HEAD */}
      <div className="flow-head">
        <div className="eyebrow">Scan detail · funding graph</div>
        <h2>
          Where the money <em>came from</em>
        </h2>
        <div className="addr">
          Token <b>7xKX…9fQm</b> · deployer <b>8vNq…3pLk</b> · 5 hops traced · 47 transfers indexed
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${view === "graph" ? "on" : ""}`}
            onClick={() => setView("graph")}
          >
            Flow graph
          </button>
          <button
            type="button"
            className={`tab ${view === "table" ? "on" : ""}`}
            onClick={() => setView("table")}
          >
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
          Min USD
          <input
            type="range"
            min="0"
            max="50000"
            step="500"
            value={minUsd}
            onChange={(e) => setMinUsd(Number(e.target.value))}
          />
          <span style={{ color: "var(--neon)" }}>${minUsd.toLocaleString()}</span>
        </div>

        <div className="ctrl">
          Direction
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as "all" | "in" | "out")}
          >
            <option value="all">All</option>
            <option value="in">Inflow</option>
            <option value="out">Outflow</option>
          </select>
        </div>

        <div className="spacer"></div>

        <div className="ctrl">
          Search
          <input
            type="text"
            placeholder="address / label"
            style={{ width: "150px" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* GRAPH STAGE */}
      <div
        className="stage"
        ref={stageRef}
        style={{ display: view === "graph" ? "block" : "none" }}
      >
        <svg
          ref={svgRef}
          id="graph"
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={(e) => {
            if (e.target === svgRef.current && focus) {
              setFocus(null);
            }
          }}
        >
          {/* Layer headings & guide lines */}
          {LAYERS.map((L) => (
            <g key={L}>
              <text x={PAD_X + L * COL_W} y={30} className="layer-label" textAnchor="middle">
                {LAYER_NAMES[L] || `Layer ${L}`}
              </text>
              <line
                x1={PAD_X + L * COL_W}
                y1={40}
                x2={PAD_X + L * COL_W}
                y2={GRAPH_H - 24}
                stroke="rgba(204,255,0,.09)"
                strokeWidth={1}
              />
            </g>
          ))}

          {/* Edges */}
          <g>
            {DEFAULT_EDGES.map((e, idx) => {
              const on = visibleEdges.includes(e);
              const a = pos[e.from];
              const b = pos[e.to];
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const d = `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
              const edgeTip = `<b>${usdFmt(e.usd)}</b> ${e.token}<br>${NODE_BY_ID[e.from]?.label ?? ""} → ${
                NODE_BY_ID[e.to]?.label ?? ""
              }<br>${ago(e.ts)} · ${e.sig}<span class="t-src ${
                e.flagged ? "own" : "arkham"
              }">${e.flagged ? "flagged path" : "normal"}</span>`;

              return (
                <g key={idx}>
                  <path
                    d={d}
                    className={`edge ${e.flagged ? "flagged" : "normal"} ${on ? "" : "dimmed"}`}
                    strokeWidth={weight(e.usd)}
                  />
                  <path
                    d={d}
                    className="edge-hit"
                    onPointerEnter={(ev) => handleShowTip(ev, edgeTip)}
                    onPointerLeave={handleHideTip}
                  />
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          {DEFAULT_NODES.map((n) => {
            const p = pos[n.id];
            if (!p) return null;
            const r = n.type === "token" ? 24 : 19;
            const isLive = liveNodeIds.has(n.id) || visibleEdges.length === 0;

            const nodeTip = `<b>${n.label}</b><br>${n.addr}<br>${n.sub}<span class="t-src ${
              n.source === "gotham" ? "own" : "arkham"
            }">${n.source === "gotham" ? "Gotham engine" : "Arkham"}</span>`;

            return (
              <g
                key={n.id}
                className={`node ${n.flagged ? "flagged " : ""}${n.type === "entity" ? "entity " : ""}${
                  focus === n.id ? "focus " : ""
                }${isLive ? "" : "dimmed"}`}
                transform={`translate(${p.x},${p.y})`}
                tabIndex={0}
                onPointerDown={(ev) => handlePointerDownNode(ev, n.id)}
                onPointerMove={handlePointerMoveNode}
                onPointerUp={handlePointerUpNode}
                onPointerCancel={handlePointerUpNode}
                onPointerEnter={(ev) => handleShowTip(ev, nodeTip)}
                onPointerLeave={handleHideTip}
                onClick={() => setFocus(focus === n.id ? null : n.id)}
              >
                <circle className="ring" r={r} />
                <text className="glyph" y={4}>
                  {n.type === "token" ? "◎" : n.type === "entity" ? "▣" : n.flagged ? "!" : "·"}
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

        {/* Tooltip */}
        <div
          className={`tip ${tooltip.show ? "show" : ""}`}
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />

        {/* Legend */}
        <div className="legend">
          <span>
            <i />
            Flagged path
          </span>
          <span>
            <i className="dash" />
            Normal transfer
          </span>
          <span>
            <i className="sq fill" />
            Flagged wallet
          </span>
          <span>
            <i className="sq" />
            Clean / unknown
          </span>
          <span>Line weight = USD value</span>
        </div>

        <button type="button" className="reset" onClick={resetLayout}>
          Reset layout
        </button>
      </div>

      {/* TIMELINE */}
      <div className="timeline">
        <div className="tl-head">
          <span>Transfer volume over time — drag to filter</span>
          <span>
            {tlStart === 0 && tlEnd === 1
              ? "All 72 hours"
              : `−${Math.round(72 - tlStart * 72)}h → −${Math.round(72 - tlEnd * 72)}h`}
          </span>
        </div>

        <div
          className="tl-bars"
          ref={tlBarsRef}
          onPointerDown={handleTlDown}
          onPointerMove={handleTlMove}
          onPointerUp={handleTlUp}
        >
          {vols.map((v, i) => {
            const f = i / BUCKETS;
            const isOn = f >= tlStart && f <= tlEnd;
            return (
              <div
                key={i}
                className={`tl-bar ${flags[i] ? "flag" : ""} ${isOn ? "on" : ""}`}
                style={{ height: `${Math.max(2, (v / maxVol) * 46)}px` }}
              />
            );
          })}
        </div>

        <div className="tl-axis">
          <span>−72h</span>
          <span>−48h</span>
          <span>−24h</span>
          <span>Now</span>
        </div>
      </div>

      {/* TRANSACTION TABLE PANEL */}
      <div className="panel">
        <div className="panel-head">
          <h2>Transaction history</h2>
          <span className="count">
            {sortedRows.length} of {DEFAULT_EDGES.length} transfers
          </span>
        </div>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("ts")}
                  className={sortKey === "ts" ? "sorted" : ""}
                >
                  Time <span className="arw">{sortKey === "ts" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("from")}
                  className={sortKey === "from" ? "sorted" : ""}
                >
                  From <span className="arw">{sortKey === "from" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("to")}
                  className={sortKey === "to" ? "sorted" : ""}
                >
                  To <span className="arw">{sortKey === "to" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("usd")}
                  className={sortKey === "usd" ? "sorted" : ""}
                >
                  Value <span className="arw">{sortKey === "usd" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("token")}
                  className={sortKey === "token" ? "sorted" : ""}
                >
                  Token <span className="arw">{sortKey === "token" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("dir")}
                  className={sortKey === "dir" ? "sorted" : ""}
                >
                  Dir <span className="arw">{sortKey === "dir" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("hop")}
                  className={sortKey === "hop" ? "sorted" : ""}
                >
                  Hop <span className="arw">{sortKey === "hop" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th
                  onClick={() => handleSort("source")}
                  className={sortKey === "source" ? "sorted" : ""}
                >
                  Source <span className="arw">{sortKey === "source" ? (sortDir === -1 ? "▾" : "▴") : "▾"}</span>
                </th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    No transfers match these filters
                  </td>
                </tr>
              ) : (
                sortedRows.map((e, idx) => {
                  const f = NODE_BY_ID[e.from];
                  const t = NODE_BY_ID[e.to];
                  const src = f?.source === "arkham" || t?.source === "arkham" ? "arkham" : "own";
                  return (
                    <tr key={idx} className={e.flagged ? "flagged" : ""}>
                      <td>{ago(e.ts)}</td>
                      <td>
                        <span className="mono-b">{f?.label}</span> {f?.addr}
                      </td>
                      <td>
                        <span className="mono-b">{t?.label}</span> {t?.addr}
                      </td>
                      <td className="mono-b">{usdFmt(e.usd)}</td>
                      <td>{e.token}</td>
                      <td>
                        <span className={`tag dir-${e.dir}`}>{e.dir}</span>
                      </td>
                      <td>{e.hop}</td>
                      <td>
                        <span className={`tag ${src}`}>
                          {src === "own" ? "Gotham engine" : "Arkham"}
                        </span>
                      </td>
                      <td>{e.flagged ? <span className="flagmark">▲ flagged</span> : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="note">
          Rows sourced by <em>Gotham engine</em> are read live from chain. Rows tagged <em>Arkham</em> carry an
          entity label resolved from their database. Click any node in the graph to filter this log to that
          wallet.
        </p>
      </div>
    </div>
  );
}
