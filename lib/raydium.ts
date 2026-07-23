/**
 * LP-lock check via Raydium's public pool API — deliberately not parsing raw
 * AMM program accounts (would need verified byte-offset layouts we can't
 * confirm without their SDK source). `burnPercent` is Raydium's own computed
 * field: % of LP supply sent to a burn address, i.e. can't be pulled by the
 * deployer. No API key required.
 */

const RAYDIUM_POOLS_URL = "https://api-v3.raydium.io/pools/info/mint";

type RaydiumPool = {
  id: string;
  type: string;
  tvl: number;
  burnPercent: number;
};

export type LpLockResult =
  | { found: false }
  | { found: true; poolId: string; tvl: number; burnPercent: number };

/** Picks the highest-TVL pool for a mint; that's the one liquidity actually sits in. */
export async function getLpLockStatus(mintAddress: string): Promise<LpLockResult> {
  const url = `${RAYDIUM_POOLS_URL}?mint1=${mintAddress}&poolType=all&poolSortField=default&sortType=desc&pageSize=10&page=1`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Raydium pool lookup failed: ${res.status}`);

  const json = await res.json();
  const pools: RaydiumPool[] = json?.data?.data ?? [];
  if (!pools.length) return { found: false };

  const top = pools.reduce((best, p) => (p.tvl > best.tvl ? p : best), pools[0]);
  return { found: true, poolId: top.id, tvl: top.tvl, burnPercent: top.burnPercent };
}
