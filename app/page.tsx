import Image from "next/image";
import Reveal from "./Reveal";
import ScanShell from "./ScanShell";

export default function Home() {
  return (
    <>
      {/* shared engraving defs: hatch + dither patterns */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#CCFF00" strokeWidth="1" opacity=".5" />
          </pattern>
          <pattern id="hatchx" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M0 0L6 6M6 0L0 6" stroke="#CCFF00" strokeWidth=".6" opacity=".45" />
          </pattern>
          <pattern id="dither" width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".7" fill="#CCFF00" opacity=".55" />
            <circle cx="3" cy="3" r=".5" fill="#CCFF00" opacity=".35" />
          </pattern>
          <pattern id="dither-sparse" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r=".6" fill="#CCFF00" opacity=".4" />
          </pattern>
        </defs>
      </svg>

      {/* ============ NAV ============ */}
      <nav>
        <a className="nav-brand" href="#" aria-label="GOTHAM home">
          <Image src="/logo.png" width={32} height={32} alt="" className="brand-mark" />
          <span className="wordmark">GOTHAM</span>
        </a>
        <div className="nav-links">
          <a href="#scan">Scan</a>
          <a href="#coverage">Coverage</a>
          <a href="#engines">Engines</a>
          <a href="#">Docs</a>
        </div>
        <button className="nav-cta">Launch app</button>
      </nav>

      {/* ============ HERO ============ */}
      <header className="hero">
        <div className="hero-watermark" aria-hidden="true">
          <span>WHO</span>
          <span>MADE IT</span>
        </div>

        {/* engraved sunburst + mask */}
        <div className="hero-art reveal in">
          <svg viewBox="0 0 460 300" fill="none" aria-hidden="true">
            {/* radiating engraved rays */}
            <g stroke="#CCFF00" strokeWidth="1" opacity=".8">
              <g id="rays">
                <line x1="230" y1="150" x2="230" y2="6" />
                <line x1="230" y1="150" x2="300" y2="14" />
                <line x1="230" y1="150" x2="360" y2="38" />
                <line x1="230" y1="150" x2="404" y2="82" />
                <line x1="230" y1="150" x2="430" y2="140" />
                <line x1="230" y1="150" x2="160" y2="14" />
                <line x1="230" y1="150" x2="100" y2="38" />
                <line x1="230" y1="150" x2="56" y2="82" />
                <line x1="230" y1="150" x2="30" y2="140" />
              </g>
            </g>
            {/* short ray ticks between long rays */}
            <g stroke="#CCFF00" strokeWidth=".7" opacity=".45">
              <line x1="230" y1="150" x2="265" y2="40" />
              <line x1="230" y1="150" x2="332" y2="60" />
              <line x1="230" y1="150" x2="390" y2="108" />
              <line x1="230" y1="150" x2="195" y2="40" />
              <line x1="230" y1="150" x2="128" y2="60" />
              <line x1="230" y1="150" x2="70" y2="108" />
            </g>
            {/* concentric halo rings */}
            <circle cx="230" cy="150" r="118" stroke="#CCFF00" strokeWidth=".8" opacity=".5" />
            <circle cx="230" cy="150" r="96" stroke="#CCFF00" strokeWidth=".6" strokeDasharray="2 4" opacity=".6" />
            {/* dither cloud behind mask */}
            <ellipse cx="230" cy="152" rx="120" ry="66" fill="url(#dither-sparse)" />
            {/* field mask backdrop to seat the mask */}
            <ellipse cx="230" cy="152" rx="86" ry="48" fill="#0B3B17" />
            {/* stars */}
            <g fill="#CCFF00">
              <path d="M92 52 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" opacity=".9" />
              <path d="M372 46 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" opacity=".7" />
              <path d="M414 170 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" opacity=".6" />
              <path d="M44 176 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" opacity=".6" />
            </g>
          </svg>
          <Image src="/logo.png" width={220} height={220} alt="" className="hero-art-logo" />
        </div>

        <div className="hero-kicker reveal in">
          Wallet intelligence <span className="dot">·</span> Solana <span className="dot">·</span> est. 2026
        </div>
        <h1 className="reveal in">GOTHAM</h1>
        <p className="hero-tag reveal in">Every wallet has a past. See it before you buy.</p>
        <div className="hero-ctas reveal in">
          <button className="btn btn-solid">Launch app</button>
          <button className="btn btn-line">Read the docs</button>
        </div>
      </header>

      {/* ============ SCAN DEMO ============ */}
      <section id="scan">
        <div className="sec-head reveal">
          <span className="eyebrow">The instrument</span>
          <h2>
            Paste. Scan. <em>Decide.</em>
          </h2>
        </div>

        <ScanShell />
      </section>

      {/* ============ COVERAGE TRIPTYCH ============ */}
      <section id="coverage">
        <div className="sec-head reveal">
          <span className="eyebrow">One scan covers</span>
          <h2>
            Five reads, <em>one answer</em>
          </h2>
        </div>

        <div className="triptych">
          {/* PANEL 1: deployer history — engraved family tree */}
          <article className="panel reveal">
            <h3>
              Deployer
              <br />
              History
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* root wallet */}
                <circle cx="150" cy="60" r="26" fill="url(#hatch)" stroke="#CCFF00" strokeWidth="1.4" />
                {/* branches to past deployments */}
                <g stroke="#CCFF00" strokeWidth="1">
                  <path d="M150 86 C150 130 70 120 70 170" />
                  <path d="M150 86 C150 140 150 140 150 170" />
                  <path d="M150 86 C150 130 230 120 230 170" />
                </g>
                {/* dead tokens (hatched X boxes) */}
                <g>
                  <rect x="46" y="170" width="48" height="48" fill="url(#hatchx)" stroke="#CCFF00" strokeWidth="1.2" />
                  <rect x="126" y="170" width="48" height="48" fill="url(#hatchx)" stroke="#CCFF00" strokeWidth="1.2" />
                  <rect x="206" y="170" width="48" height="48" fill="url(#hatch)" stroke="#CCFF00" strokeWidth="1.2" />
                </g>
                <g fontFamily="IBM Plex Mono" fontSize="9" fill="#CCFF00" textAnchor="middle" letterSpacing="1">
                  <text x="70" y="238">RUGGED</text>
                  <text x="150" y="238">RUGGED</text>
                  <text x="230" y="238">ALIVE</text>
                  <text x="150" y="64" fontSize="8">DEPLOYER</text>
                </g>
                {/* timeline base */}
                <line x1="20" y1="270" x2="280" y2="270" stroke="#CCFF00" strokeWidth="1" />
                <g stroke="#CCFF00" strokeWidth="1">
                  <line x1="70" y1="264" x2="70" y2="276" />
                  <line x1="150" y1="264" x2="150" y2="276" />
                  <line x1="230" y1="264" x2="230" y2="276" />
                </g>
                <text
                  x="150"
                  y="296"
                  fontFamily="IBM Plex Mono"
                  fontSize="8"
                  fill="#CCFF00"
                  opacity=".6"
                  textAnchor="middle"
                  letterSpacing="2"
                >
                  PRIOR DEPLOYMENTS
                </text>
              </svg>
            </div>
            <p>
              Wallet age, prior deployments, and how those tokens ended. <b>New address doesn&apos;t mean new actor.</b>
            </p>
          </article>

          {/* PANEL 2: funding trace — engraved river/hops */}
          <article className="panel reveal">
            <h3>
              Funding
              <br />
              Trace
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* upstream source: sun with rays */}
                <g stroke="#CCFF00" strokeWidth=".9" opacity=".85">
                  <line x1="150" y1="46" x2="150" y2="12" />
                  <line x1="150" y1="46" x2="118" y2="20" />
                  <line x1="150" y1="46" x2="182" y2="20" />
                  <line x1="150" y1="46" x2="104" y2="44" />
                  <line x1="150" y1="46" x2="196" y2="44" />
                </g>
                <circle cx="150" cy="58" r="20" fill="url(#hatch)" stroke="#CCFF00" strokeWidth="1.4" />
                {/* winding river of hops */}
                <path
                  d="M150 78 C150 120 90 116 90 152 C90 188 210 176 210 214 C210 244 160 244 150 266"
                  stroke="#CCFF00"
                  strokeWidth="1.4"
                  fill="none"
                />
                <path
                  d="M150 78 C150 120 90 116 90 152 C90 188 210 176 210 214 C210 244 160 244 150 266"
                  stroke="#CCFF00"
                  strokeWidth=".6"
                  fill="none"
                  strokeDasharray="1 5"
                  transform="translate(6,0)"
                  opacity=".6"
                />
                {/* hop nodes */}
                <circle cx="90" cy="152" r="9" fill="#0B3B17" stroke="#CCFF00" strokeWidth="1.3" />
                <circle cx="210" cy="214" r="9" fill="#0B3B17" stroke="#CCFF00" strokeWidth="1.3" />
                {/* destination: deployer square */}
                <rect x="126" y="266" width="48" height="34" fill="url(#hatch)" stroke="#CCFF00" strokeWidth="1.3" />
                <g fontFamily="IBM Plex Mono" fontSize="8" fill="#CCFF00" textAnchor="middle" letterSpacing="1.5">
                  <text x="150" y="34" opacity=".7">SOURCE</text>
                  <text x="62" y="156">HOP 1</text>
                  <text x="243" y="218">HOP 2</text>
                  <text x="150" y="311" opacity=".7">DEPLOYER</text>
                </g>
              </svg>
            </div>
            <p>
              The SOL that paid for deployment has a source. <b>We follow it upstream, hop by hop.</b>
            </p>
          </article>

          {/* PANEL 3: entity match — engraved seal/stamp */}
          <article className="panel reveal">
            <h3>
              Entity
              <br />
              Match
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* grand seal: concentric rings + stars */}
                <circle cx="150" cy="150" r="104" stroke="#CCFF00" strokeWidth="1.4" fill="none" />
                <circle cx="150" cy="150" r="92" stroke="#CCFF00" strokeWidth=".7" strokeDasharray="3 3" fill="none" />
                <circle cx="150" cy="150" r="66" fill="url(#dither)" stroke="#CCFF00" strokeWidth="1" />
                {/* ring text substitute: tick marks */}
                <g stroke="#CCFF00" strokeWidth="1">
                  <line x1="150" y1="46" x2="150" y2="56" />
                  <line x1="150" y1="244" x2="150" y2="254" />
                  <line x1="46" y1="150" x2="56" y2="150" />
                  <line x1="244" y1="150" x2="254" y2="150" />
                  <line x1="77" y1="77" x2="84" y2="84" />
                  <line x1="216" y1="216" x2="223" y2="223" />
                  <line x1="223" y1="77" x2="216" y2="84" />
                  <line x1="84" y1="216" x2="77" y2="223" />
                </g>
                {/* mask at seal center */}
                <g transform="translate(102,128) scale(0.8)">
                  <path
                    d="M60 10 C42 2 20 0 6 8 C0 12 0 22 4 32 C10 48 24 58 38 56 C48 54 54 44 60 38 C66 44 72 54 82 56 C96 58 110 48 116 32 C120 22 120 12 114 8 C100 0 78 2 60 10 Z M34 30 a12 9 0 1 0 0.1 0 Z M86 30 a12 9 0 1 0 0.1 0 Z"
                    fill="#0B3B17"
                    stroke="#CCFF00"
                    strokeWidth="2"
                    fillRule="evenodd"
                  />
                </g>
                <g fill="#CCFF00">
                  <path d="M150 24 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" />
                  <path d="M150 274 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" opacity=".7" />
                </g>
                <text
                  x="150"
                  y="302"
                  fontFamily="IBM Plex Mono"
                  fontSize="8"
                  fill="#CCFF00"
                  opacity=".6"
                  textAnchor="middle"
                  letterSpacing="2"
                >
                  ARKHAM ENTITY DATABASE
                </text>
              </svg>
            </div>
            <p>
              Upstream wallets checked against Arkham&apos;s database — <b>names, not addresses.</b>
            </p>
          </article>
        </div>

        <div className="triptych">
          {/* PANEL 4: smart money — engraved procession */}
          <article className="panel reveal">
            <h3>
              Smart
              <br />
              Money
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* mountain of holders: stacked engraved bars */}
                <g stroke="#CCFF00" strokeWidth="1.2">
                  <rect x="40" y="230" width="220" height="34" fill="url(#dither)" />
                  <rect x="70" y="184" width="160" height="34" fill="url(#dither)" />
                  <rect x="100" y="138" width="100" height="34" fill="url(#hatch)" />
                  <rect x="126" y="92" width="48" height="34" fill="url(#hatchx)" />
                </g>
                {/* crown star above apex: the profitable wallet */}
                <path d="M150 48 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" fill="#CCFF00" />
                <g fontFamily="IBM Plex Mono" fontSize="8" fill="#CCFF00" textAnchor="middle" letterSpacing="1.5">
                  <text x="150" y="252" opacity=".8">ALL HOLDERS</text>
                  <text x="150" y="206" opacity=".8">TOP 100</text>
                  <text x="150" y="160">TOP 20</text>
                  <text x="150" y="114">PROVEN</text>
                </g>
                <text
                  x="150"
                  y="296"
                  fontFamily="IBM Plex Mono"
                  fontSize="8"
                  fill="#CCFF00"
                  opacity=".6"
                  textAnchor="middle"
                  letterSpacing="2"
                >
                  WHO IS ALREADY IN
                </text>
              </svg>
            </div>
            <p>
              Holders cross-checked against historically profitable wallets. <b>Their presence is information.</b>
            </p>
          </article>

          {/* PANEL 5: exit watch — engraved bell tower */}
          <article className="panel reveal">
            <h3>
              Exit
              <br />
              Watch
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* watch tower */}
                <rect x="122" y="120" width="56" height="140" fill="url(#hatch)" stroke="#CCFF00" strokeWidth="1.3" />
                <path d="M112 120 L150 78 L188 120 Z" fill="url(#hatchx)" stroke="#CCFF00" strokeWidth="1.3" />
                {/* bell */}
                <path d="M141 100 a9 9 0 0 1 18 0 v8 h-18 Z" fill="#0B3B17" stroke="#CCFF00" strokeWidth="1.2" />
                {/* signal waves */}
                <g stroke="#CCFF00" fill="none" strokeWidth="1">
                  <path d="M196 96 a24 24 0 0 1 0 24" opacity=".9" />
                  <path d="M206 88 a36 36 0 0 1 0 40" opacity=".6" />
                  <path d="M216 80 a48 48 0 0 1 0 56" opacity=".35" />
                  <path d="M104 96 a24 24 0 0 0 0 24" opacity=".9" />
                  <path d="M94 88 a36 36 0 0 0 0 40" opacity=".6" />
                  <path d="M84 80 a48 48 0 0 0 0 56" opacity=".35" />
                </g>
                {/* ground */}
                <line x1="30" y1="260" x2="270" y2="260" stroke="#CCFF00" strokeWidth="1.2" />
                {/* fleeing wallet dots */}
                <g fill="#CCFF00">
                  <circle cx="220" cy="252" r="4" />
                  <circle cx="242" cy="252" r="3" opacity=".7" />
                  <circle cx="260" cy="252" r="2" opacity=".4" />
                </g>
                <text
                  x="150"
                  y="296"
                  fontFamily="IBM Plex Mono"
                  fontSize="8"
                  fill="#CCFF00"
                  opacity=".6"
                  textAnchor="middle"
                  letterSpacing="2"
                >
                  INSIDERS MOVING → TELEGRAM
                </text>
              </svg>
            </div>
            <p>
              Track a token after you scan. If deployer-linked wallets move out, <b>you hear it first.</b>
            </p>
          </article>

          {/* PANEL 6: the answer — engraved open book/tablet */}
          <article className="panel reveal">
            <h3>
              One
              <br />
              Answer
            </h3>
            <div className="panel-art">
              <svg viewBox="0 0 300 315" fill="none" aria-hidden="true">
                <rect width="300" height="315" fill="url(#dither-sparse)" />
                {/* rays behind tablet */}
                <g stroke="#CCFF00" strokeWidth=".8" opacity=".5">
                  <line x1="150" y1="150" x2="150" y2="30" />
                  <line x1="150" y1="150" x2="60" y2="52" />
                  <line x1="150" y1="150" x2="240" y2="52" />
                  <line x1="150" y1="150" x2="34" y2="120" />
                  <line x1="150" y1="150" x2="266" y2="120" />
                </g>
                {/* tablet */}
                <rect x="82" y="96" width="136" height="170" fill="#0B3B17" stroke="#CCFF00" strokeWidth="1.4" />
                <rect x="90" y="104" width="120" height="154" fill="none" stroke="#CCFF00" strokeWidth=".6" opacity=".5" />
                {/* verdict line */}
                <circle cx="104" cy="126" r="4" fill="#CCFF00" />
                <line x1="116" y1="126" x2="196" y2="126" stroke="#CCFF00" strokeWidth="2" />
                {/* finding lines */}
                <g stroke="#CCFF00" strokeWidth="1" opacity=".7">
                  <line x1="102" y1="150" x2="198" y2="150" />
                  <line x1="102" y1="168" x2="180" y2="168" />
                  <line x1="102" y1="186" x2="190" y2="186" />
                  <line x1="102" y1="204" x2="170" y2="204" />
                </g>
                {/* source pills */}
                <rect x="102" y="222" width="40" height="12" fill="#CCFF00" />
                <rect x="150" y="222" width="40" height="12" fill="none" stroke="#CCFF00" strokeWidth=".8" />
                <text
                  x="150"
                  y="296"
                  fontFamily="IBM Plex Mono"
                  fontSize="8"
                  fill="#CCFF00"
                  opacity=".6"
                  textAnchor="middle"
                  letterSpacing="2"
                >
                  SOURCES ON EVERY FINDING
                </text>
              </svg>
            </div>
            <p>
              All five reads synthesized into a single verdict — <b>sources shown, confidence stated.</b>
            </p>
          </article>
        </div>
      </section>

      {/* ============ ENGINES ============ */}
      <section className="engines" id="engines">
        <div className="sec-head reveal">
          <span className="eyebrow">Why two engines</span>
          <h2>
            Fast where they&apos;re slow.
            <br />
            <em>Deep where we&apos;re new.</em>
          </h2>
        </div>
        <div className="engine-grid">
          <div className="engine own reveal">
            <span className="e-tag">Gotham engine</span>
            <h3>Live on-chain reads</h3>
            <p>
              Built for wallets that are minutes old — before any database has labeled them. Runs on every scan,
              instantly.
            </p>
            <ul>
              <li>Deployer wallet age &amp; history</li>
              <li>Upstream funding hops</li>
              <li>Mint / freeze authority status</li>
              <li>LP lock verification</li>
              <li>Holder concentration</li>
            </ul>
          </div>
          <div className="engine ark reveal">
            <span className="e-tag">Arkham intelligence</span>
            <h3>The entity layer</h3>
            <p>Once a wallet has history, the largest labeling database in crypto confirms who&apos;s actually behind it.</p>
            <ul>
              <li>Entity &amp; address labels</li>
              <li>Counterparty mapping</li>
              <li>Cross-chain flows</li>
              <li>Top trader tracking</li>
              <li>Token holder intelligence</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============ HONESTY STRIP ============ */}
      <section className="strip">
        <svg className="strip-art" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="1200" height="300" fill="url(#dither-sparse)" />
        </svg>
        <p className="reveal">&quot;We show you what a wallet did — never what to buy.&quot;</p>
        <span className="strip-mono reveal">
          Intelligence, not financial advice · sources on every finding · decisions are yours
        </span>
      </section>

      {/* ============ CTA ============ */}
      <section className="cta">
        <div className="mask-halo reveal">
          <svg viewBox="0 0 320 200" fill="none" aria-hidden="true">
            <circle cx="160" cy="100" r="88" stroke="#CCFF00" strokeWidth="1" opacity=".5" />
            <circle cx="160" cy="100" r="72" stroke="#CCFF00" strokeWidth=".7" strokeDasharray="2 4" opacity=".6" />
            <g stroke="#CCFF00" strokeWidth=".8" opacity=".55">
              <line x1="160" y1="100" x2="160" y2="4" />
              <line x1="160" y1="100" x2="72" y2="26" />
              <line x1="160" y1="100" x2="248" y2="26" />
              <line x1="160" y1="100" x2="40" y2="76" />
              <line x1="160" y1="100" x2="280" y2="76" />
            </g>
            <ellipse cx="160" cy="102" rx="76" ry="42" fill="#0B3B17" />
          </svg>
          <Image src="/logo.png" width={140} height={140} alt="" className="mask-halo-logo" />
        </div>
        <h2 className="reveal">
          SCAN BEFORE
          <br />
          YOU APE
        </h2>
        <p className="reveal">
          Free during early access. Paste any Solana token or wallet address and get your first answer in seconds.
        </p>
        <div className="hero-ctas reveal">
          <button className="btn btn-solid">Launch app</button>
          <button className="btn btn-line">Read the docs</button>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer>
        <div className="foot-grid">
          <div className="foot-brand">
            <Image src="/logo.png" width={36} height={36} alt="" className="brand-mark" />
            <div className="wordmark">GOTHAM</div>
          </div>
          <div className="foot-col">
            <h4>Product</h4>
            <a href="#scan">Scan</a>
            <a href="#coverage">Coverage</a>
            <a href="#engines">Engines</a>
            <a href="#">Telegram alerts</a>
          </div>
          <div className="foot-col">
            <h4>Resources</h4>
            <a href="#">Docs</a>
            <a href="#">API</a>
            <a href="#">Changelog</a>
          </div>
          <div className="foot-col">
            <h4>Company</h4>
            <a href="#">X / Twitter</a>
            <a href="#">Telegram</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="foot-legal">
          <span className="disclaimer">
            Gotham provides on-chain data analysis for informational purposes only. Nothing here is financial,
            investment, or trading advice. Entity data partially sourced from Arkham Intelligence. Gotham is not
            affiliated with Arkham, Robinhood Markets, or Hermès.
          </span>
          <span>© 2026 GOTHAM — MIT-adjacent vibes, all rights reserved</span>
        </div>
      </footer>

      <Reveal />
    </>
  );
}
