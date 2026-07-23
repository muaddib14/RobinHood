/**
 * Arkham Intel API client — entity/label layer.
 * Docs: https://arkm.com/llms.txt · server-side only, API-Key never reaches the client.
 */

const BASE_URL = "https://api.arkm.com";

async function arkhamFetch<T>(path: string): Promise<T | null> {
  const key = process.env.ARKHAM_API_KEY;
  if (!key) throw new Error("ARKHAM_API_KEY is not configured");

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "API-Key": key },
    cache: "no-store",
  });

  // 404 = genuinely unlabeled/no data, not an error — surface as "no signal" not a crash.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Arkham ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export type ArkhamAddressIntel = {
  address: string;
  arkhamEntity?: { name: string; id: string; type?: string } | null;
  arkhamLabel?: { name: string } | null;
  chain?: string;
};

export function getAddressIntel(address: string) {
  return arkhamFetch<ArkhamAddressIntel>(`/intelligence/address_enriched/${address}`);
}

export type ArkhamRisk = { address: string; score?: number; level?: string };

export function getRisk(address: string) {
  return arkhamFetch<ArkhamRisk>(`/risk/address/${address}`);
}

export type ArkhamCounterparty = {
  address: string;
  arkhamEntity?: { name: string } | null;
  usdVolume?: number;
};

/** Heavy endpoint — 1 req/s. Only call once per scan, never in a loop. */
export function getCounterparties(address: string) {
  return arkhamFetch<{ counterparties: ArkhamCounterparty[] }>(
    `/counterparties/address/${address}`
  );
}
