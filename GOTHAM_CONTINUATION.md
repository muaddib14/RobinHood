# GOTHAM — Continuation Brief (M2–M4)

For any AI agent picking up this repo after M1. Read this before touching code — it captures decisions already made with the project owner that override the original developer brief in specific places.

**Repo:** `muaddib14/RobinHood` · branch `main` · Next.js App Router, TypeScript, no Tailwind (hand-written CSS in `app/globals.css`)

**Prod:** `https://robin-hood-rho.vercel.app`, custom domain `gothamintel.xyz` wrapped around the same Vercel deploy as of 2026-07-25 (Vercel auto-deploys `main` on push). **Note for future agents:** everything in §2.4 onward (Neon, cache, watchlist, streaming, banned-phrase CI, the null-deref bugfix, extension skeleton) sat uncommitted in the local working tree for most of the 2026-07-24 session — prod was still serving the old M1 commit (`5c0e2d3`) the whole time, including the null-deref bug that was "fixed" locally but still live. Caught by smoke-testing prod directly after the owner shared the URL, not by anything automatic. **Lesson: verify against prod, not just local dev, once a deploy URL exists — local build passing doesn't mean prod has the same code.** Everything below was committed and pushed same day (2026-07-24) once this was caught; if a future gap between local and prod is suspected, `git status`/`git log origin/main..HEAD` first.

**Second note for future agents (2026-07-25):** this repo was edited outside this agent's session at least once — two commits (`0e69dcc`, `62a6e78`) appeared with a `FlowVisualizer.tsx` component (a near-verbatim port of a mockup the owner had shared) wired unconditionally into `app/page.tsx`, rendering hardcoded fake data (fake addresses, "47 transfers indexed", etc.) permanently on the homepage regardless of what was actually scanned. Neither commit came from this agent. Caught when the owner asked why a scan wasn't reflecting in "the UI" and the fake section turned out to be the source of confusion, not a bug in the real `FundingGraph.tsx` (§8) which *does* use real data but only renders inside an actual scan result. Owner chose to delete `FlowVisualizer.tsx` and its CSS block and keep `FundingGraph.tsx` (2026-07-25) — resolved, but **if you're picking this repo up cold, run `git log --oneline -20` and diff against what this doc describes before assuming the working tree matches** — someone else may be editing concurrently (another session, or the owner directly), and neither side is automatically aware of the other's changes.

---

## 1. Status: M1 shipped (commit `3706af1`)

Real scan pipeline is live. `/api/scan` returns the official contract from `lib/types.ts` (`ScanResult`, `Finding`). Five reads run in parallel via `Promise.allSettled` in `lib/aggregate.ts`:

| Read | Source | File |
|---|---|---|
| `deployer` | Gotham engine (Helius RPC) | `lib/solana.ts` |
| `funding_trace` | Gotham engine (5-hop backward walk) | `lib/solana.ts` |
| `token_checks` | RugCheck.xyz (free, no key) → falls back to raw RPC + Raydium | `lib/rugcheck.ts`, `lib/raydium.ts` |
| `entity_match` | Arkham (optional — `unavailable` without a key) | `lib/arkham.ts` |
| `smart_money` | Gotham half (holder concentration) + Arkham half (top-trader) | `lib/aggregate.ts` |

Verdict synthesis: OpenRouter (`mistralai/ministral-8b-2512`), with a deterministic rule-based fallback in `lib/aggregate.ts:ruleBasedVerdict()` that fires automatically if the model call fails or returns malformed JSON. **Never edit this fallback out** — it's the thing that makes a scan unable to fail.

Do not restructure `lib/types.ts`. Every downstream milestone below builds against that exact shape.

---

## 2. Decisions already made — DO NOT relitigate these

These were explicitly discussed and agreed with the project owner. An agent proposing to "fix" or "upgrade" any of these without being asked is working against agreed scope, not helping.

### 2.1 No Arkham API key, and that's fine
- **Reason:** Arkham's self-serve trial requires a credit card on file with a $1,500/mo auto-charge if not cancelled in 30 days. Owner is a solo builder testing personal use — too risky for the current stage.
- **Current state:** `lib/arkham.ts` is fully implemented and wired into `lib/aggregate.ts`. Every call is wrapped so an unset `ARKHAM_API_KEY` degrades to `status: 'unavailable'` findings — this is **not a bug**, it's the intended behavior per the original brief's own principle ("findings are sourced, never blended").
- **If a key becomes available later:** just set `ARKHAM_API_KEY` in env. Zero code changes needed — the integration is already complete and tested against real Arkham API schemas (verified via `arkm.com/llms/schemas/*.md`, not guessed).
- **Do not** re-propose Arkham integration work. It's done; it's just unauthenticated.

### 2.2 No Anthropic/Claude — stay on OpenRouter
- **Reason:** cost. Owner explicitly said no budget for Claude on a single-user personal deploy.
- **Current state:** `lib/openrouter.ts` uses `mistralai/ministral-8b-2512` via OpenRouter. Confirmed working with a real key (verified live: ~$0.00002/scan). `max_tokens: 75` — do not raise this without checking the account's OpenRouter credit balance first; a prior incident had `max_tokens: 200` trigger an HTTP 402 because the account balance couldn't cover it.
- **Do not** swap to `ANTHROPIC_API_KEY` / Claude unless the owner explicitly asks and confirms budget.

### 2.3 RugCheck.xyz replaces most of what Arkham would have covered for token safety
- Public API, **zero cost, no key**. `GET https://api.rugcheck.xyz/v1/tokens/{mint}/report` — verified live, schema confirmed from a real response, not from docs alone.
- Covers: deployer/creator, mint/freeze authority, LP lock per-pool, top holders, risk flags.
- This is why Layer 1 (`token_checks`, `smart_money`-half) doesn't depend on Arkham at all.

### 2.4 Database: Neon Postgres, not Supabase (decided 2026-07-24)
- Owner chose Neon over Supabase for M2+. `DATABASE_URL` in `.env`, driver is `@neondatabase/serverless` (`lib/db.ts`, tagged-template `sql`).
- M3 auth consequence: Neon has no built-in auth service, unlike Supabase Auth. §4.2 below (originally "use Supabase Auth to avoid a second auth system") no longer applies as written — M3 will need a separate auth lib (e.g. Auth.js) on top of Neon. Flag this to the owner before starting M3, don't just pick one.
- In-memory rate limiter (`app/api/scan/route.ts`) is unaffected — still resets on cold start, still an accepted limitation, not wired to Neon.

### 2.5 Watchlist shipped early, IP-tagged, no auth (decided 2026-07-24)
- Owner wanted watchlist usable now, ahead of M3 auth. `POST /api/watchlist` is live (`app/api/watchlist/route.ts`, `lib/watchlist.ts`, table in `lib/migrations/002_watchlist.sql`).
- Rows are keyed by `owner_ip` (same IP extraction as the scan rate limiter), **not** `user_id` — there is no `users` table yet. This is a deliberate stand-in, marked with a `ponytail:` comment in the migration. When M3 auth lands, add `user_id`, backfill, and migrate ownership — don't just bolt auth on top of `owner_ip`.
- GET (list) and DELETE are **not built** — only POST exists. Don't assume the other verbs work.
- Wired into the UI: "Watch this address" button in `ScanShell.tsx`, appears after a completed scan.

### 2.6 Alert worker: external cron, not Vercel Cron (decided 2026-07-24)
- Owner wants an external cron service (e.g. cron-job.org, GitHub Actions schedule) hitting `/api/cron/watch`, not Vercel Cron. Overrides brief §11.
- Functionally identical either way — the route stays guarded by `CRON_SECRET`, only the caller changes. Not yet built.

---

## 3. M2 — Entity Layer polish (small, mostly optional)

Since Arkham is already fully integrated (§2.1) and Claude was swapped for OpenRouter (§2.2) in M1 itself, M2 per the original brief is **mostly already done**. What's left:

- [ ] **`address_cache` Neon table** — only worth building once Arkham has a real key (caching `unavailable` responses is pointless). 24h TTL per the original brief. Skip until §2.1 changes.
- [x] **Scan result caching** (15-min TTL, `cached: true` flag) — done. `scans` table (`lib/migrations/001_scans_cache.sql`), `lib/cache.ts`, wired into `app/api/scan/route.ts`. Cache lookup/write both fail-open (swallowed errors fall through to a live scan) so a Neon outage can't break scanning.
- [x] **Streaming findings to the client** (brief §13) — done 2026-07-24. `/api/scan` now returns `text/event-stream`: `lib/aggregate.ts:scanAddressStream()` yields Layer 1 (Gotham/RugCheck) findings first, then Layer 2 (Arkham) findings, then a `done` event with the full `ScanResult`. Cache hits collapse to one `findings` event + `done`. `scanAddress()` kept as a non-streaming wrapper that drains the generator, for future callers (cron worker) that just want the final result. `ScanShell.tsx` renders findings as they arrive during `loading`; the staged loading-copy (`LOADING_STAGES`) stays as filler text under the real partial results, not replaced.
- [x] **Watchlist POST** — done ahead of schedule, see §2.5. GET/DELETE still open.
- [x] **`/api/scan/[id]`** (GET, brief §9) — done 2026-07-24. Separate permanent table `scan_shares` (`lib/migrations/003_scan_shares.sql`, `lib/shares.ts`), distinct from the 15-min-TTL `scans` cache which gets overwritten on every fresh scan and can't double as share storage. **Opt-in, not automatic** — a share row is only written when the user clicks "Copy share link" in `ScanShell.tsx`, which `POST`s the already-computed result to `app/api/share/route.ts` (new endpoint, not in the original brief's §9 table but needed to create the share in the first place). `app/api/scan/[id]/route.ts` is the brief's GET-by-id, returns 404 for unknown ids. `app/scan/[id]/page.tsx` is a server component viewer page (not just a raw JSON endpoint) so a shared link is actually browsable, reusing the same finding-row markup as `ScanShell.tsx` (small intentional duplication, not extracted to a shared component — see `renderFinding` in both files). Added to the banned-phrase `TARGET_FILES` list.
- [x] **Banned-phrase CI check** (brief §14/§17) — done. `scripts/check-banned-phrases.mjs` (`npm run check:copy`), wired into `.github/workflows/check-copy.yml` on PRs touching `app/**`. Scans `app/page.tsx`, `ScanShell.tsx`, `Reveal.tsx`, `layout.tsx` for whole-word hits on buy/sell/safe-to-ape/will-rug/etc. Caught 3 real hits in hero copy ("before you buy") — reworded to "before you decide" / "what to do next", not whitelisted. Add new user-facing files (Telegram templates in M3, extension copy in M4) to `TARGET_FILES`.
- [x] **Trademark check on "Gotham"** (brief §17) — done 2026-07-24, web search only (not a legal opinion). Three real collisions found: **Palantir Gotham** (established defense/intelligence platform, biggest risk — same "intelligence software" category the brief itself calls out, likely trademarked, big company), **Gotham City** (ZenGo-X open-source Bitcoin HD wallet, close to this product's crypto-wallet context), **Gotham Security** (NYC pentest/cybersecurity firm since 2013). Flagged to owner, not resolved — rename is a product decision, not something to act on unilaterally. Revisit before any public launch or paid marketing spend.

**Recommendation:** do §3's caching item first (cheap, real value, introduces Neon for a genuine reason) and treat streaming + Arkham cache as stretch goals.

**Known pre-existing bug, fixed 2026-07-24:** `lib/aggregate.ts` had two unguarded nested optional-chains (`report?.topHolders.length`, `market?.lp.lpLockedPct`) that threw when RugCheck returned a report with a null sub-field — crashed the whole scan with a 502, not caught by the "scan can't fail" fallback because it happened outside the synthesis step. Both now null-guarded properly.

**Two more pre-existing bugs found and fixed 2026-07-24 (`lib/solana.ts:findFirstFunder`), while wiring up real per-edge data for a future flow-graph feature (§8):**
1. `FundingHop` only ever stored `{hop, address}` — the transfer amount/timestamp/signature were read off the RPC response but discarded, not persisted. Now stored as `amountSol`/`ts`/`sig` on each hop.
2. **Bigger bug:** `findFirstFunder` sampled the 60 *newest* signatures (`getSignaturesForAddress(..., {limit: 60})`), but the funding transaction is by definition a wallet's *oldest* activity. For any wallet with more than 60 lifetime transactions, the real funding tx was **never in the sampled window at all** — confirmed empirically: every test address (BONK token, WIF token, BONK deployer wallet) returned `hops: []` / `terminated: "no_source"` before the fix, despite raw RPC showing the destination-matching transfer existed. Fixed by fetching up to 1000 signatures (RPC max, same bound as `getWalletAge`) and taking the oldest 60 of that batch, not the newest. Still bounded — a wallet with >1000 lifetime txs can still miss its true origin — but now it's actually looking in the right direction.
3. Also fixed while in there: `findFirstFunder` only scanned top-level instructions, missing transfers issued via CPI (a DEX swap or launchpad program invoking System Program `transfer` internally) — now also scans `meta.innerInstructions`.
4. **Caveat, not yet addressed:** "earliest inbound transfer" has no minimum-amount filter, so a dust/rent transaction (observed: `amountSol: 1e-9`, i.e. 1 lamport) can win the "earliest" slot ahead of the actual meaningful funding transfer if it happened first chronologically. Worth a minimum-lamports threshold before this feeds a user-facing amount figure.

---

## 4. M3 — Retention (auth, watchlist, Telegram alerts)

Not started. This is where Neon becomes mandatory — no way around it for user accounts and persistent watchlists.

### 4.1 Schema
Use the original brief's schema as-is (`users`, `alert_rules`, `alerts_sent`, `known_rug_wallets`, `scans`) — **except `watchlist`, which already exists** (§2.5) keyed by `owner_ip`, not `user_id`. Migrating it to the real schema (add `user_id`, backfill/reconcile IP-tagged rows, drop or repurpose `owner_ip`) is part of M3, not a fresh table create. RLS on every user-scoped table — note RLS alone won't enforce ownership without `user_id` in place first.

### 4.2 Auth
Brief doesn't specify a provider. Original recommendation was Supabase Auth (magic link or Telegram-based) to avoid a second auth system — **no longer applies**, DB is Neon as of §2.4 (2026-07-24), which has no built-in auth. Needs its own decision (e.g. Auth.js) before M3 starts; confirm with owner. **Owner explicitly deferred this (2026-07-24)** — "later, not now" — don't start auth work unprompted; watchlist stays IP-tagged (§2.5) until they ask for it.

### 4.3 Alert worker
**External cron, not Vercel Cron** (§2.6, overrides brief §11) → `/api/cron/watch`, guarded by `CRON_SECRET`. Five rules from the original brief (deployer-linked sell, LP pull, top-20 holder exit, upstream funder redeploys, new Arkham label). **Rule 5 will never fire without an Arkham key** (§2.1) — implement it, but it's a no-op in the current environment. Document that in the code, don't skip writing it.

**Deduplication is mandatory** (60-min window per `alerts_sent`) — this was explicit in the original brief and still applies.

### 4.4 Telegram bot
`TELEGRAM_BOT_TOKEN` + `/api/telegram/link` to bind a chat id to a user account. Standard Bot API, no surprises. Keep alert message copy compliant with §6 below (no predictions, no recommendations) — this constraint applies to Telegram output just as much as UI copy.

---

## 5. M4 — Distribution

Chrome extension **started 2026-07-24** (confirmed no M3 dependency — it only calls the already-public `/api/scan`, no auth/watchlist/Telegram needed).

- **Chrome extension** — skeleton built in `extension/` (Manifest V3), same repo, not a separate one. `content.js` parses a base58 address from the page URL on pump.fun/DexScreener, calls `/api/scan`, drains the SSE stream, renders a fixed-position badge colored by verdict. `popup.html`/`popup.js` let the user override the API base URL (`chrome.storage.sync`); both default to `https://robin-hood-rho.vercel.app` (current prod, owner-provided 2026-07-24) hardcoded as `DEFAULT_API_BASE_URL` in both files — **when a custom domain is bought and wrapped around the Vercel deploy, update that constant in both `content.js` and `popup.js`, and add the new domain to `host_permissions` in `manifest.json`** (currently lists the `.vercel.app` URL explicitly; Vercel domain stays live per owner even after a custom domain is added, so the old entry doesn't need removing, just don't forget the new one). Icons reuse the landing page logo (`extension/icons/icon.jpeg`, copied from `app/icon.jpeg`) at all three declared sizes — same source file, not separately rendered per-size; fine for unpacked/dev use, revisit before Chrome Web Store submission if their asset guidelines want real PNGs.
  - Versioning/release strategy (owner's call, 2026-07-24): website updates ship via normal `git push` to `main` (Vercel auto-deploys, untouched by any of this). Extension updates are **tag-gated**: bump `extension/manifest.json`'s `version`, then push a `vX.Y.Z` tag. `.github/workflows/extension-release.yml` fires on that tag, **fails the build if the tag doesn't match the manifest version** (guardrail against shipping an unbumped version), zips `extension/`, and attaches it to a GitHub Release. That zip is what gets manually uploaded to the Chrome Web Store dashboard — there's no CWS auto-publish wired up (would need a Web Store API key/OAuth, not set up).
  - Not yet done: real icons, actual DOM-based fallback if URL parsing misses (pump.fun/DexScreener URL structure can change), banned-phrase check doesn't cover `extension/content.js` yet (its user-facing badge strings are minimal today — revisit if that grows).
- Public API + issued keys: straightforward once rate limiting (§2.4, currently in-memory) is Neon-backed — anonymous in-memory limits don't work for issued API keys across serverless instances. Not started.
- MCP server: lowest priority, no urgency signal from the owner. Not started.

---

## 6. Compliance guardrails — apply to every milestone above, no exceptions

Carried over unchanged from the original brief. These are product requirements, not style suggestions:

- No predictions, ever — not in UI copy, not in synthesis output, not in Telegram alerts.
- No recommendations — never "buy", "sell", "safe", "avoid". State findings only.
- Disclaimer visible on the scan result itself (already done in `ScanShell.tsx` — keep it there, don't move it to footer-only).
- Never store user wallet addresses as identity. No wallet connection anywhere in this product — this stays true through M3's auth (auth is account-based, not wallet-based) and M4 (extension reads public page data, doesn't connect a wallet).

If a future request from the owner conflicts with this section, flag it back to them rather than implementing it — the original brief called this out as a hard product line, and nothing since has walked it back.

---

## 7. Before doing M2/M3/M4 work

- Confirm with the owner whether §2.1 (Arkham) or §2.2 (Claude) has changed before assuming either is still out of scope — these were point-in-time budget decisions, not permanent architecture calls.
- Neon project exists (`neondb`, created 2026-07-24), `scans` and `watchlist` tables migrated. Confirm connection is still live before writing further M3 schema.
- `watchlist` is IP-tagged, not user-tagged (§2.5) — don't build M3 auth as if the table doesn't exist yet.
- Re-run `npm run build && npm run lint` before considering any milestone item done. No exceptions carried over from M1's own verification standard.

---

## 8. Flow visualizer / transaction history (owner-requested 2026-07-24, backend groundwork only)

Owner shared a static HTML/JS mockup — an interactive funding-flow graph (draggable nodes, tooltips, timeline brush) plus a sortable transaction table, styled to match the existing terminal aesthetic. Not in the original brief. Placement not yet decided ("penempatan terserah kamu" — owner left it open, likely a tab/section on the scan result or a dedicated `/scan/[id]/graph` route reusing the share-page pattern from §3).

**Status: backend-only, no UI built yet.** Owner chose backend-first (capture real data before building UI on top of mock data) — see §3's "two more pre-existing bugs" note above for what got fixed in `lib/solana.ts` to make this viable (edge amount/timestamp/signature capture, oldest-window sampling fix, inner-instruction/CPI detection).

**UI shipped 2026-07-24 — scoped down from the mockup, not a 1:1 port:**
- `app/FundingGraph.tsx` — funding chain **only** (source → hop 1 → … → scanned address), not the mockup's full multi-directional graph (CEX/origin/hops/deployer/top-holders/token with in+out edges at the token layer). Deliberately scoped to what the backend actually has real data for — rendering the token/holder layer as a transfer graph would mean fabricating edges (holders data is static % ownership, not time-stamped transfers). SOL amounts, not USD — no price feed in this codebase, and the brief explicitly avoids fabricated figures.
- Hand-rolled SVG (not a charting lib) — linear left-to-right chain, circle nodes, hover-highlight on both the SVG edge and its table row, sized to the actual hop count (not fixed like the mockup's canvas). Below the graph: a table of the same hops (hop #, funder, SOL amount, time-ago, tx signature linking to Solscan).
- Originally a click-to-switch tab ("Findings" / "Flow graph"); owner wanted both visible without a click (2026-07-25), so it's now just stacked — findings list, then a "Funding flow" label, then `FundingGraph` — always both, no toggle state. In `ScanShell.tsx` (live scan) and the share page (`app/scan/[id]/ScanResultView.tsx`, renamed from `ResultTabs.tsx` when the toggle was removed — it's plain server-renderable now, no client state left).
- **Not built:** drag-to-reposition nodes, tooltip-on-hover popup (mockup had both — this version uses simpler highlight-on-hover + a persistent table instead, given the chain only ever has ≤5 nodes, a full mockup-style interactive graph editor is disproportionate), timeline brush/filter (mockup's table assumed dozens of transactions; a funding chain has at most 5 hops, nothing to filter), sortable table columns.
- If `hops` is empty (still common — see §3 caveats, and depends on `SOLANA_RPC_URL`'s indexer depth), the tab shows the same "no funding trail" summary text as the Findings tab, not a blank graph.
