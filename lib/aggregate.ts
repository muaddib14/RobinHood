import { getWalletAge, getMintChecks, getDeployerHistory, getFundingTrace } from "./solana";
import { getLpLockStatus } from "./raydium";
import { getTokenReport, topMarket, classifyMintOutcome } from "./rugcheck";
import {
  getAddressIntel,
  getRisk,
  getCounterparties,
  getTokenHolders,
  getRiskBatch,
  createExitWatchAlert,
} from "./arkham";
import { getAccountLabel } from "./solanafm";
import { getWalletLabel } from "./vybe";
import { synthesizeVerdict } from "./openrouter";
import type { Finding, ScanResult, Verdict } from "./types";

/**
 * Rule-based verdict — the deterministic floor beneath Claude/OpenRouter
 * synthesis. Per the brief: synthesis is the phrasing layer, never the
 * decision layer, so a scan must never fail because a model call failed.
 */
export function ruleBasedVerdict(findings: Finding[]): { verdict: Verdict; verdict_line: string } {
  const flagged = findings.filter((f) => f.status === "flag").length;
  const ok = findings.filter((f) => f.status === "ok").length;

  if (flagged >= 2) {
    return { verdict: "high_risk", verdict_line: `${flagged} of ${findings.length} reads flagged risk signals.` };
  }
  if (flagged === 1) {
    return { verdict: "mixed", verdict_line: "One read flagged a risk signal; the rest are clean or unavailable." };
  }
  if (flagged === 0 && ok >= 4) {
    return { verdict: "clean", verdict_line: `${ok} of ${findings.length} reads came back clean, none flagged.` };
  }
  return { verdict: "insufficient_data", verdict_line: "Too little history across sources for a confident read." };
}

/**
 * Streamed scan — same two-tier fan-out as before, but yields findings as
 * each layer finishes instead of making the client wait for all five.
 * Layer 1 (Gotham/RugCheck) has no Arkham dependency, so it always yields
 * first; Layer 2 (Arkham) yields second, then verdict synthesis.
 */
export type ScanStreamEvent = { type: "findings"; findings: Finding[] } | { type: "done"; result: ScanResult };

export async function* scanAddressStream(address: string): AsyncGenerator<ScanStreamEvent> {
  const started = Date.now();
  const findings: Finding[] = [];

  const report = await getTokenReport(address).catch(() => null);
  const kind: ScanResult["kind"] = report ? "token" : "wallet";

  // If RugCheck knows this as a token, the deployer is its creator, not the
  // mint address itself — every deployer-scoped lookup below targets that.
  const deployerAddress = report?.creator ?? address;

  // ---- Layer 1: Gotham engine + RugCheck, no Arkham dependency ----
  const [age, deployerHistory, fundingTrace, mintFallback, lpFallback] = await Promise.allSettled([
    getWalletAge(deployerAddress),
    getDeployerHistory(deployerAddress),
    getFundingTrace(deployerAddress),
    report ? Promise.resolve(null) : getMintChecks(address),
    report ? Promise.resolve(null) : getLpLockStatus(address),
  ]);

  // ---- deployer read ----
  if (age.status === "fulfilled" && deployerHistory.status === "fulfilled") {
    const { priorMints, scannedTx } = deployerHistory.value;
    const outcomes = await Promise.all(priorMints.slice(0, 5).map((m) => classifyMintOutcome(m)));
    const ruggedCount = outcomes.filter((o) => o === "rugged").length;
    const status: Finding["status"] =
      age.value.txCount === 0 ? "unavailable" : ruggedCount >= 2 ? "flag" : ruggedCount === 1 ? "warn" : "ok";
    findings.push({
      read: "deployer",
      label: "Deployer",
      source: "gotham",
      status,
      summary:
        age.value.txCount === 0
          ? "Deployer wallet has no on-chain history yet."
          : `Deployer wallet is <b>${Math.round((age.value.ageMs ?? 0) / 3_600_000)}h old</b>; ${ruggedCount} of ${priorMints.length} prior mints (last ${scannedTx} tx) rugged.`,
      data: { ageMs: age.value.ageMs, txCount: age.value.txCount, priorMints, ruggedCount, scannedTx },
    });
  }

  // ---- funding_trace read (the most important one per the brief) ----
  if (fundingTrace.status === "fulfilled") {
    const { hops, terminated, ruggedFunderCount, sampledRecipients } = fundingTrace.value;
    const status: Finding["status"] =
      hops.length === 0
        ? "unavailable"
        : ruggedFunderCount >= 3
          ? "flag"
          : ruggedFunderCount >= 1
            ? "warn"
            : "ok";
    findings.push({
      read: "funding_trace",
      label: "Funding trace",
      source: "gotham",
      status,
      summary:
        hops.length === 0
          ? "No inbound funding transfer found — funding trail could not be traced."
          : `Traced ${hops.length} hop(s) upstream (${terminated.replace("_", " ")}). Immediate funder's other transfers: ${ruggedFunderCount} of ${sampledRecipients} sampled recipients later rugged.`,
      data: { hops, terminated, ruggedFunderCount, sampledRecipients },
    });
  }

  // ---- token_checks read ----
  if (report) {
    const mintActive = !!report.token.mintAuthority;
    const freezeActive = !!report.token.freezeAuthority;
    const market = topMarket(report);
    const lpLockedPct = market?.lp?.lpLockedPct ?? 0;
    const status: Finding["status"] = mintActive || lpLockedPct < 20 ? "flag" : freezeActive ? "warn" : "ok";
    findings.push({
      read: "token_checks",
      label: "Token checks",
      source: "gotham",
      status,
      summary: `Mint authority ${mintActive ? "<b>ACTIVE</b>" : "revoked"} · freeze authority ${
        freezeActive ? "<b>ACTIVE</b>" : "revoked"
      } · LP ${lpLockedPct.toFixed(1)}% locked${market ? ` ($${Math.round(market.lp.baseUSD + market.lp.quoteUSD).toLocaleString()} pool)` : ""}.`,
      data: { mintAuthority: report.token.mintAuthority, freezeAuthority: report.token.freezeAuthority, market },
    });
  } else if (mintFallback.status === "fulfilled" && mintFallback.value?.isMint) {
    const mintActive = !mintFallback.value.mintAuthorityRevoked;
    const freezeActive = !mintFallback.value.freezeAuthorityRevoked;
    const lpFound = lpFallback.status === "fulfilled" && lpFallback.value?.found;
    const burnPercent = lpFound ? (lpFallback as PromiseFulfilledResult<{ found: true; burnPercent: number; tvl: number }>).value.burnPercent : 0;
    const status: Finding["status"] = mintActive || (lpFound && burnPercent < 20) ? "flag" : freezeActive ? "warn" : "ok";
    findings.push({
      read: "token_checks",
      label: "Token checks",
      source: "gotham",
      status,
      summary: `Mint authority ${mintActive ? "<b>ACTIVE</b>" : "revoked"} · freeze authority ${
        freezeActive ? "<b>ACTIVE</b>" : "revoked"
      }${lpFound ? ` · ${burnPercent.toFixed(1)}% LP burned` : ""}.`,
      data: { mintFallback: mintFallback.value, lpFallback: lpFallback.status === "fulfilled" ? lpFallback.value : null },
    });
  }

  // ---- smart_money read: Gotham half (holder concentration) ----
  const fundingAddresses = new Set(
    fundingTrace.status === "fulfilled" ? fundingTrace.value.hops.map((h) => h.address) : []
  );
  if (report?.topHolders?.length) {
    const top1 = report.topHolders[0]?.pct ?? 0;
    const top5 = report.topHolders.slice(0, 5).reduce((sum, h) => sum + h.pct, 0);
    const top20 = report.topHolders.slice(0, 20).reduce((sum, h) => sum + h.pct, 0);
    const deployerLinked = report.topHolders.filter((h) => fundingAddresses.has(h.owner)).length;
    const status: Finding["status"] = deployerLinked > 0 || top1 > 30 ? "flag" : top5 > 50 ? "warn" : "ok";
    findings.push({
      read: "smart_money",
      label: "Holder concentration",
      source: "gotham",
      status,
      summary: `Top-1 <b>${top1.toFixed(1)}%</b>, top-5 ${top5.toFixed(1)}%, top-20 ${top20.toFixed(1)}%${
        deployerLinked > 0 ? ` — <b>${deployerLinked} holder(s) linked to the funding trace</b>` : ""
      }.`,
      data: { top1, top5, top20, deployerLinked, holders: report.topHolders },
    });
  }

  yield { type: "findings", findings: [...findings] };

  // ---- Layer 2: Arkham entity graph, isolated behind its own settle so a
  // slow/missing key never blocks Layer 1 from reaching the client first ----
  const [intel, risk, counterparties, holders, fmLabel, vybeLabel] = await Promise.allSettled([
    getAddressIntel(address),
    getRisk(address),
    getCounterparties(address),
    getTokenHolders("solana", address),
    getAccountLabel(address),
    getWalletLabel(address),
  ]);
  const arkhamFindingsStart = findings.length;

  // ---- entity_match read: Arkham first (richer), SolanaFM as a free
  // fallback when there's no Arkham key (§2.1) — never blended, each
  // finding states which source it actually came from ----
  if (intel.status === "fulfilled" && intel.value) {
    const name = intel.value.arkhamEntity?.name ?? intel.value.arkhamLabel?.name;
    findings.push({
      read: "entity_match",
      label: "Entity match",
      source: "arkham",
      status: name ? "warn" : "ok",
      summary: name ? `Matches known entity: ${name}.` : "Address has Arkham data but no entity label yet.",
      data: { entity: intel.value.arkhamEntity, label: intel.value.arkhamLabel },
    });
  } else if (fmLabel.status === "fulfilled" && fmLabel.value) {
    const { friendlyName, category, tags } = fmLabel.value;
    const flagged = tags.some((t) => /scam|hack|exploit|drain/i.test(t));
    findings.push({
      read: "entity_match",
      label: "Entity match",
      source: "solanafm",
      status: flagged ? "flag" : friendlyName ? "warn" : "ok",
      summary: friendlyName
        ? `Matches known entity: ${friendlyName}${category ? ` (${category})` : ""}${tags.length ? ` — tags: ${tags.join(", ")}` : ""}.`
        : `Tagged: ${tags.join(", ")}.`,
      data: { friendlyName, category, tags },
    });
  } else if (vybeLabel.status === "fulfilled" && vybeLabel.value) {
    const { name, entityName, labels } = vybeLabel.value;
    const display = entityName ?? name;
    findings.push({
      read: "entity_match",
      label: "Entity match",
      source: "vybe",
      status: display ? "warn" : "ok",
      summary: display
        ? `Matches known entity: ${display}${labels.length ? ` — tags: ${labels.join(", ")}` : ""}.`
        : `Tagged: ${labels.join(", ")}.`,
      data: { name, entityName, labels },
    });
  } else {
    findings.push({
      read: "entity_match",
      label: "Entity match",
      source: "arkham",
      status: "unavailable",
      summary: "Entity layer did not respond — no Arkham key, no SolanaFM/Vybe label found.",
      data: {},
    });
  }

  if (risk.status === "fulfilled" && risk.value) {
    findings.push({
      read: "entity_match",
      label: "Arkham risk score",
      source: "arkham",
      status: risk.value.risk_level === "HIGH" || risk.value.risk_level === "SEVERE" ? "flag" : "ok",
      summary: `Risk level: ${risk.value.risk_level} (score ${risk.value.max_score}/100)${
        risk.value.greatest_risk_category ? `, driven by ${risk.value.greatest_risk_category} exposure` : ""
      }.`,
      data: risk.value,
    });
  }

  if (counterparties.status === "fulfilled" && counterparties.value) {
    const allChains = Object.values(counterparties.value).flat();
    const top = allChains.sort((a, b) => b.usd - a.usd)[0];
    if (top) {
      const name = top.address.arkhamEntity?.name ?? top.address.arkhamLabel?.name;
      findings.push({
        read: "funding_trace",
        label: "Arkham counterparty",
        source: "arkham",
        status: "ok",
        summary: name
          ? `Top counterparty is a known entity: ${name} ($${Math.round(top.usd).toLocaleString()}).`
          : `Top counterparty is an unlabeled address ($${Math.round(top.usd).toLocaleString()}).`,
        data: top,
      });
    }
  }

  // ---- smart_money read: Arkham half (top-trader profitability) ----
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
          read: "smart_money",
          label: "Arkham smart money",
          source: "arkham",
          status: highRisk > 0 ? "flag" : "ok",
          summary: `Top ${holderAddresses.length} holders: ${labeled} carry an Arkham entity label, ${highRisk} flagged HIGH/SEVERE risk.`,
          data: { holderAddresses, highRisk, labeled },
        });
      } catch {
        // Risk batch is an enrichment on top of holders — its failure shouldn't drop the holder finding entirely.
      }
    }
  }

  yield { type: "findings", findings: findings.slice(arkhamFindingsStart) };

  // ---- verdict: Ministral synthesis with rule-based fallback ----
  const fallback = ruleBasedVerdict(findings);
  let verdict: Verdict = fallback.verdict;
  let verdict_line = fallback.verdict_line;
  try {
    const synthesis = await synthesizeVerdict({ address, findings });
    verdict = synthesis.verdict;
    verdict_line = synthesis.verdict_line;
  } catch (err) {
    console.error("Synthesis failed, using rule-based fallback:", err);
  }

  try {
    await createExitWatchAlert(address, `Gotham exit-watch: ${address.slice(0, 8)}…`);
  } catch {
    // Alerting is best-effort; a failed alert must never fail the scan itself.
  }

  yield {
    type: "done",
    result: {
      address,
      kind,
      verdict,
      verdict_line,
      findings,
      answered_ms: Date.now() - started,
      cached: false,
      scanned_at: new Date().toISOString(),
    },
  };
}

/** Non-streaming convenience wrapper — drains the generator for callers that just want the final result (e.g. a future cron worker). */
export async function scanAddress(address: string): Promise<ScanResult> {
  let result: ScanResult | undefined;
  for await (const event of scanAddressStream(address)) {
    if (event.type === "done") result = event.result;
  }
  if (!result) throw new Error("Scan produced no result");
  return result;
}
