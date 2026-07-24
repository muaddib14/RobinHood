/**
 * RugCheck.xyz public token-report API — free, no key required, Solana-native.
 * Covers what would otherwise need a paid Arkham plan for token safety
 * signals: deployer, mint/freeze authority, LP lock per-pool, top holders,
 * risk flags. Verified against the live swagger spec (no ApiKeyAuth on this
 * route) and a real report, not guessed from blog posts.
 * Docs: https://api.rugcheck.xyz/swagger/doc.json — GET /v1/tokens/{id}/report
 */

const BASE_URL = "https://api.rugcheck.xyz/v1";

export type RugcheckMarketLp = {
  lpLockedPct: number;
  lpLockedUSD: number;
  baseUSD: number;
  quoteUSD: number;
};

export type RugcheckMarket = { marketType: string; lp: RugcheckMarketLp };

export type RugcheckHolder = { address: string; owner: string; pct: number; insider: boolean };

export type RugcheckRisk = { name: string; description: string; level: string; score: number };

export type RugcheckReport = {
  mint: string;
  creator: string | null;
  token: { mintAuthority: string | null; freezeAuthority: string | null; supply: number; decimals: number };
  topHolders: RugcheckHolder[];
  risks: RugcheckRisk[];
  score_normalised: number; // 0-100, higher = riskier
  markets: RugcheckMarket[];
};

/** Returns null when `address` isn't a token mint RugCheck knows about (e.g. a plain wallet). */
export async function getTokenReport(mint: string): Promise<RugcheckReport | null> {
  const res = await fetch(`${BASE_URL}/tokens/${mint}/report`, { cache: "no-store" });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`RugCheck report failed: ${res.status}`);
  const json = await res.json();
  if (json?.error) return null;
  return json as RugcheckReport;
}

/** Picks the pool holding the most liquidity — that's where an LP pull would actually hurt. */
export function topMarket(report: RugcheckReport): RugcheckMarket | null {
  if (!report.markets?.length) return null;
  return report.markets.reduce((best, m) => {
    const liq = (m.lp?.baseUSD ?? 0) + (m.lp?.quoteUSD ?? 0);
    const bestLiq = (best.lp?.baseUSD ?? 0) + (best.lp?.quoteUSD ?? 0);
    return liq > bestLiq ? m : best;
  }, report.markets[0]);
}

export type MintOutcome = "rugged" | "alive" | "unknown";

/** $500 liquidity floor: below that, a pool is functionally dead — anyone could pull what's left. */
export async function classifyMintOutcome(mint: string): Promise<MintOutcome> {
  const report = await getTokenReport(mint).catch(() => null);
  if (!report) return "unknown";
  const market = topMarket(report);
  if (!market) return "unknown";
  const liquidity = market.lp.baseUSD + market.lp.quoteUSD;
  return liquidity < 500 ? "rugged" : "alive";
}
