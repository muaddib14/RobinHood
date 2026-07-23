/**
 * Gotham engine — live on-chain reads via raw Solana JSON-RPC.
 * No @solana/web3.js dependency: keeps the serverless bundle tiny.
 * Never depends on Arkham; this is what still works when Arkham is down.
 */

const RPC_URL = process.env.SOLANA_RPC_URL;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!RPC_URL) throw new Error("SOLANA_RPC_URL is not configured");
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC ${method} failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Solana RPC ${method} error: ${json.error.message}`);
  return json.result as T;
}

export type WalletAge = { ageMs: number | null; firstSeenAt: string | null; txCount: number };

/** Oldest known signature for an address = proxy for wallet/account age. */
export async function getWalletAge(address: string): Promise<WalletAge> {
  const sigs = await rpc<Array<{ blockTime: number | null }>>("getSignaturesForAddress", [
    address,
    { limit: 1000 },
  ]);
  if (!sigs.length) return { ageMs: null, firstSeenAt: null, txCount: 0 };
  const oldest = sigs[sigs.length - 1];
  if (!oldest.blockTime) return { ageMs: null, firstSeenAt: null, txCount: sigs.length };
  const firstSeenAt = new Date(oldest.blockTime * 1000).toISOString();
  return { ageMs: Date.now() - oldest.blockTime * 1000, firstSeenAt, txCount: sigs.length };
}

export type MintChecks = {
  isMint: boolean;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
};

/** If `address` is an SPL mint, report authority status. Otherwise isMint=false. */
export async function getMintChecks(address: string): Promise<MintChecks> {
  const result = await rpc<{
    value: { data?: { parsed?: { type?: string; info?: { mintAuthority?: string | null; freezeAuthority?: string | null } } } } | null;
  }>("getAccountInfo", [address, { encoding: "jsonParsed" }]);

  const parsed = result?.value?.data?.parsed;
  if (!parsed || parsed.type !== "mint") {
    return { isMint: false, mintAuthorityRevoked: null, freezeAuthorityRevoked: null };
  }
  return {
    isMint: true,
    mintAuthorityRevoked: !parsed.info?.mintAuthority,
    freezeAuthorityRevoked: !parsed.info?.freezeAuthority,
  };
}

export type DeployerHistory = { scannedTx: number; priorMints: string[] };

// SPL Token program instructions that create a new mint.
const MINT_INIT_TYPES = new Set(["initializeMint", "initializeMint2"]);

type ParsedIx = { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } };

/**
 * Scans the last `sampleSize` transactions signed by `address` for
 * SPL `initializeMint` instructions it authored — i.e. tokens this wallet
 * has deployed before. Issues individual getTransaction calls with bounded
 * concurrency (NOT a JSON-RPC batch array): free-tier RPC providers (Helius
 * included) reject batch requests outright with -32403 "paid plans only",
 * confirmed against a live key, so this fans out real concurrent HTTP
 * requests instead. Bounded window: this is "prior deployments in recent
 * history", not a guarantee of zero for wallets with more transactions.
 */
export async function getDeployerHistory(address: string, sampleSize = 40): Promise<DeployerHistory> {
  if (!RPC_URL) throw new Error("SOLANA_RPC_URL is not configured");

  const sigs = await rpc<Array<{ signature: string }>>("getSignaturesForAddress", [
    address,
    { limit: sampleSize },
  ]);
  if (!sigs.length) return { scannedTx: 0, priorMints: [] };

  const priorMints = new Set<string>();
  const CONCURRENCY = 8;
  for (let i = 0; i < sigs.length; i += CONCURRENCY) {
    const chunk = sigs.slice(i, i + CONCURRENCY);
    const txs = await Promise.all(
      chunk.map((s) =>
        rpc<{ transaction?: { message?: { instructions?: ParsedIx[] } } } | null>("getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null)
      )
    );
    for (const tx of txs) {
      const instructions = tx?.transaction?.message?.instructions ?? [];
      for (const ix of instructions) {
        if (ix.program !== "spl-token") continue;
        if (!ix.parsed?.type || !MINT_INIT_TYPES.has(ix.parsed.type)) continue;
        const info = ix.parsed.info as { mint?: string; mintAuthority?: string } | undefined;
        if (info?.mintAuthority === address && info.mint) priorMints.add(info.mint);
      }
    }
  }

  return { scannedTx: sigs.length, priorMints: [...priorMints] };
}
