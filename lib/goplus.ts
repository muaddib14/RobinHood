/**
 * GoPlus Security — free, public, no key required for reasonable personal
 * use (confirmed live: /solana/token_security returns 200 with real data
 * anonymously). Used as a silent cross-check layered into the existing
 * "Token checks" finding, not surfaced as its own source pill — the
 * malicious-creator flag is real signal RugCheck doesn't carry, but
 * exposing raw vendor plumbing ("GoPlus: N/A") every time it's
 * unavailable erodes trust for no benefit; it only ever adds to an
 * existing confident read, never creates a new uncertain one.
 */

const BASE_URL = "https://api.gopluslabs.io/api/v1";

export type GoPlusCreatorFlag = { address: string; malicious: boolean };

async function goPlusFetch<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.code !== 1) return null; // GoPlus wraps errors in a 200 with code != 1
    return json.result as T;
  } catch {
    return null; // best-effort enrichment — never throws into the caller
  }
}

/** Returns flagged creator addresses for a Solana mint, or [] if clean/unavailable. */
export async function getFlaggedCreators(mint: string): Promise<GoPlusCreatorFlag[]> {
  type TokenSecurityEntry = { creators?: Array<{ address: string; malicious_address?: number }> };
  const result = await goPlusFetch<Record<string, TokenSecurityEntry>>(
    `/solana/token_security?contract_addresses=${mint}`
  );
  const entry = result?.[mint];
  if (!entry?.creators) return [];
  return entry.creators
    .filter((c) => c.malicious_address === 1)
    .map((c) => ({ address: c.address, malicious: true }));
}
