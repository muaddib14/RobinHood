/**
 * Arkham Intel API client — entity/label layer.
 * Docs: https://arkm.com/llms.txt · server-side only, API-Key never reaches the client.
 * Field names verified against https://arkm.com/llms/schemas/*.md — not guessed.
 */

const BASE_URL = "https://api.arkm.com";

async function arkhamFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const key = process.env.ARKHAM_API_KEY;
  if (!key) throw new Error("ARKHAM_API_KEY is not configured");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "API-Key": key, ...(init?.headers ?? {}) },
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

/** Schema: RiskScoreResponse — risk_level/max_score, not score/level. */
export type ArkhamRisk = {
  address: string;
  risk_level: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "SEVERE" | string;
  max_score: number;
  greatest_risk_category?: string;
};

export function getRisk(address: string) {
  return arkhamFetch<ArkhamRisk>(`/risk/address/${address}`);
}

/** Up to 200 addresses per call. Response is keyed by the address the caller sent. */
export function getRiskBatch(addresses: string[]) {
  return arkhamFetch<Record<string, ArkhamRisk>>(`/risk/address/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
}

type CounterpartyEntry = {
  address: { address: string; arkhamEntity?: { name: string } | null; arkhamLabel?: { name: string } | null };
  flow: string;
  transactionCount: number;
  usd: number;
};

/** Heavy endpoint — 1 req/s. Response is keyed by chain, not a flat array. */
export function getCounterparties(address: string) {
  return arkhamFetch<Record<string, CounterpartyEntry[]>>(`/counterparties/address/${address}`);
}

export type TopHolderResponse = {
  totalSupply: Record<string, number>;
  addressTopHolders: Record<
    string,
    Array<{
      address: { address: string; arkhamEntity?: { name: string } | null };
      balance: number;
      pctOfCap: number;
      usd: number;
    }>
  >;
};

/** Heavy in practice (large payload) — call once per scan, never per-holder. */
export function getTokenHolders(chain: string, address: string, limit = 20) {
  return arkhamFetch<TopHolderResponse>(`/token/holders/${chain}/${address}?limit=${limit}`);
}

/**
 * Creates a live transfer alert for `address` on Arkham's own alerting infra —
 * deliberately NOT rebuilding a WebSocket consumer ourselves. Requires an
 * existing alert method (create one in the Arkham dashboard) referenced by
 * ARKHAM_ALERT_METHOD_ID.
 */
export async function createExitWatchAlert(address: string, name: string): Promise<number | null> {
  const alertMethodId = process.env.ARKHAM_ALERT_METHOD_ID;
  if (!alertMethodId) return null; // feature is opt-in; no method configured yet

  const id = await arkhamFetch<number>(`/user/alerts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      enabled: true,
      base: [address],
      alertMethodId: Number(alertMethodId),
      description: "Gotham exit-watch — auto-created from a scan",
    }),
  });
  return id;
}
