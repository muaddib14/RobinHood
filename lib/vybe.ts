/**
 * Vybe Network API — free tier, Arkham-free entity source.
 * Base host is api.vybenetwork.xyz (NOT .com — the docs site's own curl
 * examples point at the wrong host; confirmed live against a real key).
 *
 * Endpoints verified live against api.vybenetwork.xyz with a real key,
 * not assumed from docs text:
 *   GET /v4/tokens/{mint}                -> 200
 *   GET /v4/tokens/{mint}/top-holders    -> 200 (holders carry ownerName)
 *   GET /v4/wallets/labeled-accounts     -> 403 "insufficient permissions"
 *                                            (exists, gated to paid plans)
 *
 * Free tier has NO generic "look up any wallet's label" endpoint — that's
 * paid-only. getWalletLabel() below is a real but narrow substitute: it
 * checks whether `address` shows up as a labeled top holder of a small set
 * of high-liquidity reference tokens (wSOL, USDC), which is where most
 * labeled entities (CEX hot wallets, pool authorities, market makers)
 * concentrate. This covers major players for free; it will miss anything
 * that isn't a top-1000 holder of one of the reference tokens — that's a
 * real coverage gap, not hidden behind a fake "not found".
 */

const BASE_URL = "https://api.vybenetwork.xyz/v4";

// wSOL and USDC — the two highest-liquidity Solana tokens, whose top-holder
// lists concentrate the labeled entities (CEX wallets, pool authorities)
// most likely to also show up as counterparties elsewhere.
const REFERENCE_MINTS = [
  "So11111111111111111111111111111111111111112", // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
];

async function vybeFetch<T>(path: string): Promise<T | null> {
  const key = process.env.VYBE_API_KEY;
  if (!key) return null; // optional source — absence degrades silently, like Arkham/SolanaFM

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-API-Key": key },
    cache: "no-store",
  });

  if (res.status === 404) return null; // not a token Vybe tracks
  if (res.status === 403) return null; // endpoint gated behind a paid tier — degrade, don't crash
  if (!res.ok) throw new Error(`Vybe ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export type VybeTokenDetails = {
  mintAddress: string;
  name: string;
  symbol: string;
  price: number;
  marketCap?: number;
};

export function getTokenDetails(mint: string) {
  return vybeFetch<VybeTokenDetails>(`/tokens/${mint}`);
}

type VybeTopHolder = {
  rank: number;
  ownerAddress: string;
  ownerName: string | null;
  mintAddress: string;
  tokenSymbol: string;
};

export function getTopHolders(mint: string) {
  return vybeFetch<{ data: VybeTopHolder[] }>(`/tokens/${mint}/top-holders`);
}

export type VybeWalletLabel = { name: string | null; entityName: string | null; labels: string[] };

/** See module doc — narrow substitute for the paid-only generic wallet-label endpoint. */
export async function getWalletLabel(address: string): Promise<VybeWalletLabel | null> {
  for (const mint of REFERENCE_MINTS) {
    const result = await getTopHolders(mint);
    const hit = result?.data?.find((h) => h.ownerAddress === address && h.ownerName);
    if (hit?.ownerName) {
      return { name: hit.ownerName, entityName: hit.ownerName, labels: [hit.tokenSymbol + " top holder"] };
    }
  }
  return null;
}
