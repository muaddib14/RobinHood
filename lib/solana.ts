/**
 * Gotham engine — live on-chain reads via raw Solana JSON-RPC.
 * No @solana/web3.js dependency: keeps the serverless bundle tiny.
 * Never depends on Arkham; this is what still works when Arkham is down.
 */

import { classifyMintOutcome } from "./rugcheck";

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

export type FundingHop = { hop: number; address: string };
export type FundingTrace = {
  hops: FundingHop[];
  terminated: "no_source" | "hop_limit" | "trail_found";
  ruggedFunderCount: number;
  sampledRecipients: number;
};

type NativeTransferIx = {
  program?: string;
  parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } };
};

/** Earliest inbound native SOL transfer into `address` within a recent window — that's who funded it. */
async function findFirstFunder(address: string): Promise<string | null> {
  // Bounded window, not the full 1000-signature history: this is "earliest
  // funder within recent history", not a guarantee for very old wallets.
  // Fetched concurrently (bounded pool) rather than one-by-one from the
  // back — sequential lookups over hundreds of signatures were the actual
  // cause of multi-minute hangs before this fix.
  const SAMPLE = 60;
  const CONCURRENCY = 10;
  const sigs = await rpc<Array<{ signature: string }>>("getSignaturesForAddress", [address, { limit: SAMPLE }]);
  if (!sigs.length) return null;

  let earliest: { blockTime: number; source: string } | null = null;
  for (let i = 0; i < sigs.length; i += CONCURRENCY) {
    const chunk = sigs.slice(i, i + CONCURRENCY);
    const txs = await Promise.all(
      chunk.map((s) =>
        rpc<{ blockTime?: number | null; transaction?: { message?: { instructions?: NativeTransferIx[] } } } | null>(
          "getTransaction",
          [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        ).catch(() => null)
      )
    );
    for (const tx of txs) {
      const instructions = tx?.transaction?.message?.instructions ?? [];
      for (const ix of instructions) {
        if (ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
        const info = ix.parsed.info;
        if (info?.destination !== address || !info.source || info.source === address) continue;
        const blockTime = tx?.blockTime ?? Infinity;
        if (!earliest || blockTime < earliest.blockTime) earliest = { blockTime, source: info.source };
      }
    }
  }
  return earliest?.source ?? null;
}

/**
 * Walks backward from `address` through its funding chain, max 5 hops,
 * per the brief. At hop 1 (the immediate funder), samples up to 8 of its
 * other outbound SOL transfers and checks whether the recipients went on
 * to deploy a mint that's now rugged (near-zero liquidity via RugCheck).
 * Bounded fan-out — this is a real check, not a claim about named exchange
 * wallets (we never fabricate CEX address identities we can't verify).
 */
export async function getFundingTrace(address: string, maxHops = 5): Promise<FundingTrace> {
  if (!RPC_URL) throw new Error("SOLANA_RPC_URL is not configured");

  const hops: FundingHop[] = [];
  let current = address;
  let terminated: FundingTrace["terminated"] = "hop_limit";

  for (let i = 1; i <= maxHops; i++) {
    const funder = await findFirstFunder(current);
    if (!funder) {
      terminated = "no_source";
      break;
    }
    hops.push({ hop: i, address: funder });
    current = funder;
    if (i === maxHops) terminated = "trail_found";
  }

  let ruggedFunderCount = 0;
  let sampledRecipients = 0;
  if (hops.length > 0) {
    const immediateFunder = hops[0].address;
    const sigs = await rpc<Array<{ signature: string }>>("getSignaturesForAddress", [
      immediateFunder,
      { limit: 15 },
    ]).catch(() => []);

    const txs = await Promise.all(
      sigs.map((s) =>
        rpc<{ transaction?: { message?: { instructions?: NativeTransferIx[] } } } | null>("getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null)
      )
    );
    const recipients = new Set<string>();
    for (const tx of txs) {
      const instructions = tx?.transaction?.message?.instructions ?? [];
      for (const ix of instructions) {
        if (ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
        const dest = ix.parsed.info?.destination;
        if (dest && dest !== immediateFunder && dest !== address) recipients.add(dest);
      }
    }
    const sampled = [...recipients].slice(0, 6);
    sampledRecipients = sampled.length;

    const rugFlags = await Promise.all(
      sampled.map(async (recipient) => {
        const history = await getDeployerHistory(recipient, 20).catch(() => null);
        if (!history?.priorMints.length) return 0;
        const outcomes = await Promise.all(
          history.priorMints.slice(0, 2).map((mint) => classifyMintOutcome(mint))
        );
        return outcomes.filter((o) => o === "rugged").length;
      })
    );
    ruggedFunderCount = rugFlags.reduce((sum, n) => sum + n, 0);
  }

  return { hops, terminated, ruggedFunderCount, sampledRecipients };
}
