import { getWalletAge, getMintChecks, getDeployerHistory } from "./solana";
import { getAddressIntel, getRisk, getCounterparties, getTokenHolders, getRiskBatch, createExitWatchAlert } from "./arkham";
import { getLpLockStatus } from "./raydium";
import { synthesizeVerdict } from "./openrouter";

export type Finding = { label: string; value: string; source: "own" | "arkham" };

export type ScanResult = {
  address: string;
  verdict: string;
  confidence: "low" | "medium" | "high";
  elapsedMs: number;
  findings: Finding[];
  exitWatch: { armed: boolean; alertId: number | null };
};

function ageLabel(ms: number | null): string {
  if (ms === null) return "unknown (no on-chain history found)";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} minutes old`;
  if (hours < 24) return `${hours.toFixed(1)} hours old`;
  return `${Math.round(hours / 24)} days old`;
}

/**
 * One scan = parallel fan-out to both engines, degrade gracefully per-source.
 * Arkham being down/rate-limited never blocks the Gotham-engine findings.
 */
export async function scanAddress(address: string): Promise<ScanResult> {
  const started = Date.now();
  const findings: Finding[] = [];

  const [age, mint, deployerHistory, lpLock, intel, risk, counterparties, holders] = await Promise.allSettled([
    getWalletAge(address),
    getMintChecks(address),
    getDeployerHistory(address),
    getLpLockStatus(address),
    getAddressIntel(address),
    getRisk(address),
    getCounterparties(address),
    getTokenHolders("solana", address),
  ]);

  if (age.status === "fulfilled") {
    findings.push({
      label: "Wallet age",
      value: `Address is ${ageLabel(age.value.ageMs)}, ${age.value.txCount} known transactions.`,
      source: "own",
    });
  }

  if (mint.status === "fulfilled" && mint.value.isMint) {
    findings.push({
      label: "Token checks",
      value: `Mint authority ${mint.value.mintAuthorityRevoked ? "revoked" : "ACTIVE"} · freeze authority ${
        mint.value.freezeAuthorityRevoked ? "revoked" : "ACTIVE"
      }.`,
      source: "own",
    });
  }

  if (deployerHistory.status === "fulfilled") {
    const { scannedTx, priorMints } = deployerHistory.value;
    if (scannedTx > 0) {
      findings.push({
        label: "Deployer history",
        value:
          priorMints.length > 0
            ? `Found ${priorMints.length} prior mint(s) deployed by this wallet in its last ${scannedTx} transactions.`
            : `No prior mint deployments found in this wallet's last ${scannedTx} transactions.`,
        source: "own",
      });
    }
  }

  if (lpLock.status === "fulfilled" && lpLock.value.found) {
    const { burnPercent, tvl } = lpLock.value;
    findings.push({
      label: "LP lock",
      value: `Top pool has $${Math.round(tvl).toLocaleString()} TVL, ${burnPercent.toFixed(
        1
      )}% of LP supply burned${burnPercent < 50 ? " — most liquidity is still pullable by the owner" : ""}.`,
      source: "own",
    });
  }

  if (intel.status === "fulfilled" && intel.value) {
    const name = intel.value.arkhamEntity?.name ?? intel.value.arkhamLabel?.name;
    findings.push({
      label: "Entity match",
      value: name ? `Matches known entity: ${name}.` : "Address has Arkham data but no entity label yet.",
      source: "arkham",
    });
  } else if (intel.status === "fulfilled") {
    findings.push({ label: "Entity match", value: "Unlabeled — no Arkham entity history yet.", source: "arkham" });
  }

  if (risk.status === "fulfilled" && risk.value) {
    findings.push({
      label: "Risk score",
      value: `Arkham risk level: ${risk.value.risk_level} (score ${risk.value.max_score}/100)${
        risk.value.greatest_risk_category ? `, driven by ${risk.value.greatest_risk_category} exposure` : ""
      }.`,
      source: "arkham",
    });
  }

  if (counterparties.status === "fulfilled" && counterparties.value) {
    const allChains = Object.values(counterparties.value).flat();
    const top = allChains.sort((a, b) => b.usd - a.usd)[0];
    if (top) {
      const name = top.address.arkhamEntity?.name ?? top.address.arkhamLabel?.name;
      findings.push({
        label: "Funding trace",
        value: name
          ? `Top counterparty is a known entity: ${name} ($${Math.round(top.usd).toLocaleString()}).`
          : `Top counterparty is an unlabeled address ($${Math.round(top.usd).toLocaleString()}).`,
        source: "arkham",
      });
    }
  }

  // Smart Money: cross-check top holders against Arkham risk data instead of
  // maintaining our own "profitable wallet" database.
  if (holders.status === "fulfilled" && holders.value) {
    const top = Object.values(holders.value.addressTopHolders)[0] ?? [];
    const holderAddresses = top.slice(0, 20).map((h) => h.address.address);
    if (holderAddresses.length) {
      try {
        const riskMap = await getRiskBatch(holderAddresses);
        const highRisk = Object.values(riskMap ?? {}).filter(
          (r) => r.risk_level === "HIGH" || r.risk_level === "SEVERE"
        ).length;
        const labeled = top.filter((h) => h.address.arkhamEntity?.name).length;
        findings.push({
          label: "Smart money",
          value: `Top ${holderAddresses.length} holders: ${labeled} carry an Arkham entity label, ${highRisk} flagged HIGH/SEVERE risk.`,
          source: "arkham",
        });
      } catch {
        // Risk batch is an enrichment on top of holders — its failure shouldn't drop the holder finding entirely.
      }
    }
  }

  let verdict = "Scan complete — insufficient data for an automated verdict.";
  let confidence: ScanResult["confidence"] = "low";
  try {
    const synthesis = await synthesizeVerdict({ address, findings });
    verdict = synthesis.verdict;
    confidence = synthesis.confidence;
  } catch {
    // Synthesis is a summarizer, not a source of truth — a failure here
    // must never hide the findings that already succeeded.
  }

  // Exit Watch: arm Arkham's own live-transfer alerting instead of running a
  // WebSocket consumer ourselves. No-ops silently if ARKHAM_ALERT_METHOD_ID
  // isn't configured — this is opt-in, not required for a scan to succeed.
  let exitWatch: ScanResult["exitWatch"] = { armed: false, alertId: null };
  try {
    const alertId = await createExitWatchAlert(address, `Gotham exit-watch: ${address.slice(0, 8)}…`);
    if (alertId !== null) exitWatch = { armed: true, alertId };
  } catch {
    // Alerting is best-effort; a failed alert must never fail the scan itself.
  }

  return { address, verdict, confidence, elapsedMs: Date.now() - started, findings, exitWatch };
}
