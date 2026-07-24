# GOTHAM — Continuation Brief (M2–M4)

For any AI agent picking up this repo after M1. Read this before touching code — it captures decisions already made with the project owner that override the original developer brief in specific places.

**Repo:** `muaddib14/RobinHood` · branch `main` · Next.js App Router, TypeScript, no Tailwind (hand-written CSS in `app/globals.css`)

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

### 2.4 Supabase — not yet wired, deferred to M2/M3 on purpose
- M1 shipped with **zero database**. Rate limiting (`app/api/scan/route.ts`) is an in-memory `Map`, which is explicitly documented in code comments as resetting on every cold start/redeploy — this is an accepted limitation for now, not an oversight.
- Do not add Supabase speculatively. Only wire it in when you're actually building the M2 cache or M3 watchlist (see below) — introducing the dependency without a consumer is exactly the kind of premature complexity to avoid.

---

## 3. M2 — Entity Layer polish (small, mostly optional)

Since Arkham is already fully integrated (§2.1) and Claude was swapped for OpenRouter (§2.2) in M1 itself, M2 per the original brief is **mostly already done**. What's left:

- [ ] **`address_cache` Supabase table** — only worth building once Arkham has a real key (caching `unavailable` responses is pointless). 24h TTL per the original brief. Skip until §2.1 changes.
- [ ] **Scan result caching** (15-min TTL, `cached: true` flag) — this one's useful regardless of Arkham. Same table or a separate `scans` cache keyed by address. This is the first real reason to add Supabase.
- [ ] **Streaming findings to the client** as each read completes, instead of waiting for all five (brief §13). `ScanShell.tsx` already has staged loading-copy that cycles — real streaming would replace the fake stage cycling with actual progressive reveal. Needs `/api/scan` to become a streaming response (SSE or chunked) instead of a single JSON blob. Non-trivial refactor of the route handler; UI reveal animation already supports it structurally.

**Recommendation:** do §3's caching item first (cheap, real value, introduces Supabase for a genuine reason) and treat streaming + Arkham cache as stretch goals.

---

## 4. M3 — Retention (auth, watchlist, Telegram alerts)

Not started. This is where Supabase becomes mandatory — no way around it for user accounts and persistent watchlists.

### 4.1 Schema
Use the original brief's schema as-is (`users`, `watchlist`, `alert_rules`, `alerts_sent`, `known_rug_wallets`, `scans`). RLS on every user-scoped table.

### 4.2 Auth
Brief doesn't specify a provider. Recommend Supabase Auth directly (magic link or Telegram-based, since the product's primary channel is Telegram anyway) — avoids introducing a second auth system.

### 4.3 Alert worker
Vercel Cron → `/api/cron/watch`, guarded by `CRON_SECRET`. Five rules from the original brief (deployer-linked sell, LP pull, top-20 holder exit, upstream funder redeploys, new Arkham label). **Rule 5 will never fire without an Arkham key** (§2.1) — implement it, but it's a no-op in the current environment. Document that in the code, don't skip writing it.

**Deduplication is mandatory** (60-min window per `alerts_sent`) — this was explicit in the original brief and still applies.

### 4.4 Telegram bot
`TELEGRAM_BOT_TOKEN` + `/api/telegram/link` to bind a chat id to a user account. Standard Bot API, no surprises. Keep alert message copy compliant with §6 below (no predictions, no recommendations) — this constraint applies to Telegram output just as much as UI copy.

---

## 5. M4 — Distribution

Not started. Chrome extension is explicitly called out in the original brief as "the highest-leverage item" — do this before the public API/MCP server if choosing what to build first.

- Chrome extension: inject a risk badge on pump.fun / DexScreener pages by calling `/api/scan` with the address parsed from the page URL/DOM.
- Public API + issued keys: straightforward once rate limiting (§2.4, currently in-memory) is Supabase-backed — anonymous in-memory limits don't work for issued API keys across serverless instances.
- MCP server: lowest priority, no urgency signal from the owner.

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
- Supabase project doesn't exist yet as of this writing — confirm one has been created before writing schema migrations.
- Re-run `npm run build && npm run lint` before considering any milestone item done. No exceptions carried over from M1's own verification standard.
