/**
 * SolanaFM account labels — free, public, no key required.
 * Fills the entity-label gap left by not having an Arkham key (§2.1):
 * not as rich (no funding-source labeling, no smart-money score), but
 * covers known exchanges/programs/scam-tagged accounts for free.
 * Endpoint is marked "deprecated" in SolanaFM's docs with no replacement
 * published as of 2026-07-25 — still live, wrapped defensively like every
 * other optional source in this codebase.
 */

export type SolanaFmLabel = {
  friendlyName: string | null;
  category: string | null;
  tags: string[];
};

const TIMEOUT_MS = 3000;

export async function getAccountLabel(address: string): Promise<SolanaFmLabel | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.solana.fm/v0/accounts/${address}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data;
    if (!data?.friendlyName && !data?.tags?.length) return null;
    return {
      friendlyName: data.friendlyName ?? null,
      category: data.category ?? null,
      tags: Array.isArray(data.tags) ? data.tags : [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
