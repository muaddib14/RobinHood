import { getWalletAge, getMintChecks, getDeployerHistory } from "./solana";
import { getLpLockStatus } from "./raydium";
import { getTokenReport, topMarket } from "./rugcheck";
import {
  getAddressIntel,
  getRisk,
  getCounterparties,
  getTokenHolders,
  getRiskBatch,
  createExitWatchAlert,
} from "./arkham";
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
 * One scan = parallel fan-out to every source, degrade gracefully per-source.
 * Two tiers, both optional:
 *  - RugCheck (free, no key) covers token-safety signals Arkham would
 *    otherwise gate behind a paid plan — deployer, mint/freeze, LP lock,
 *    holder concentration.
 *  - Arkham (needs ARKHAM_API_KEY) adds the entity graph + smart-money +
 *    exit-watch layer on top, when/if a key is configured. Its absence
 *    never blocks a scan — Promise.allSettled already isolates every
 *    Arkham call, so an unset key just means those findings don't appear.
 */
export async function scanAddress(address: string): Promise<ScanResult> {
  const started = Date.now();
  const findings: Finding[] = [];

  const reportResult = await Promise.allSettled([getTokenReport(address)]);
  const report = reportResult[0].status === "fulfilled" ? reportResult[0].value : null;

  // If RugCheck knows this as a token, the deployer is its creator, not the
  // mint address itself — every deployer-scoped lookup below should target that.
  const deployerAddress = report?.creator ?? address;

  const [age, deployerHistory, mintFallback, lpFallback, intel, risk, counterparties, holders] =
    await Promise.allSettled([
      getWalletAge(deployerAddress),
      getDeployerHistory(deployerAddress),
      report ? Promise.resolve(null) : getMintChecks(address),
      report ? Promise.resolve(null) : getLpLockStatus(address),
      getAddressIntel(address),
      getRisk(address),
      getCounterparties(address),
      getTokenHolders("solana", address),
    ]);

  if (age.status === "fulfilled") {
    findings.push({
      label: "Deployer age",
      value: `${report ? "Deployer wallet" : "Address"} is ${ageLabel(age.value.ageMs)}, ${age.value.txCount} known transactions.`,
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

  if (report) {
    // ---- Token path: RugCheck has this mint indexed. ----
    findings.push({
      label: "Token checks",
      value: `Mint authority ${report.token.mintAuthority ? "ACTIVE" : "revoked"} · freeze authority ${
        report.token.freezeAuthority ? "ACTIVE" : "revoked"
      }.`,
      source: "own",
    });

    const market = topMarket(report);
    if (market) {
      const { lpLockedPct, lpLockedUSD, baseUSD, quoteUSD } = market.lp;
      findings.push({
        label: "LP lock",
        value: `Top pool (${market.marketType}) has $${Math.round(baseUSD + quoteUSD).toLocaleString()} liquidity, ${lpLockedPct.toFixed(
          1
        )}% locked ($${Math.round(lpLockedUSD).toLocaleString()})${lpLockedPct < 50 ? " — most liquidity is still pullable" : ""}.`,
        source: "own",
      });
    }

    if (report.topHolders.length) {
      const insiders = report.topHolders.filter((h) => h.insider).length;
      const topPct = report.topHolders[0]?.pct ?? 0;
      findings.push({
        label: "Holder concentration",
        value: `Top holder owns ${topPct.toFixed(1)}% of supply; ${insiders} of top ${report.topHolders.length} holders flagged as insider wallets.`,
        source: "own",
      });
    }

    if (report.risks.length) {
      const names = report.risks.map((r) => r.name).join(", ");
      findings.push({
        label: "Risk signals",
        value: `RugCheck score ${report.score_normalised}/100 (higher = riskier). Flags: ${names}.`,
        source: "own",
      });
    }
  } else {
    // ---- Wallet path: not a mint RugCheck knows about — fall back to raw RPC. ----
    if (mintFallback.status === "fulfilled" && mintFallback.value?.isMint) {
      findings.push({
        label: "Token checks",
        value: `Mint authority ${mintFallback.value.mintAuthorityRevoked ? "revoked" : "ACTIVE"} · freeze authority ${
          mintFallback.value.freezeAuthorityRevoked ? "revoked" : "ACTIVE"
        }.`,
        source: "own",
      });
    }
    if (lpFallback.status === "fulfilled" && lpFallback.value?.found) {
      const { burnPercent, tvl } = lpFallback.value;
      findings.push({
        label: "LP lock",
        value: `Top pool has $${Math.round(tvl).toLocaleString()} TVL, ${burnPercent.toFixed(1)}% of LP supply burned.`,
        source: "own",
      });
    }
  }

  // ---- Arkham layer: entirely optional, only populates if ARKHAM_API_KEY is set. ----
  if (intel.status === "fulfilled" && intel.value) {
    const name = intel.value.arkhamEntity?.name ?? intel.value.arkhamLabel?.name;
    findings.push({
      label: "Entity match",
      value: name ? `Matches known entity: ${name}.` : "Address has Arkham data but no entity label yet.",
      source: "arkham",
    });
  }

  if (risk.status === "fulfilled" && risk.value) {
    findings.push({
      label: "Arkham risk score",
      value: `Risk level: ${risk.value.risk_level} (score ${risk.value.max_score}/100)${
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

  let exitWatch: ScanResult["exitWatch"] = { armed: false, alertId: null };
  try {
    const alertId = await createExitWatchAlert(address, `Gotham exit-watch: ${address.slice(0, 8)}…`);
    if (alertId !== null) exitWatch = { armed: true, alertId };
  } catch {
    // Alerting is best-effort; a failed alert must never fail the scan itself.
  }

  return { address, verdict, confidence, elapsedMs: Date.now() - started, findings, exitWatch };
}
