import { getWalletAge, getMintChecks } from "./solana";
import { getAddressIntel, getRisk, getCounterparties } from "./arkham";
import { synthesizeVerdict } from "./openrouter";

export type Finding = { label: string; value: string; source: "own" | "arkham" };

export type ScanResult = {
  address: string;
  verdict: string;
  confidence: "low" | "medium" | "high";
  elapsedMs: number;
  findings: Finding[];
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

  const [age, mint, intel, risk, counterparties] = await Promise.allSettled([
    getWalletAge(address),
    getMintChecks(address),
    getAddressIntel(address),
    getRisk(address),
    getCounterparties(address),
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

  if (risk.status === "fulfilled" && risk.value?.level) {
    findings.push({
      label: "Risk score",
      value: `Arkham risk level: ${risk.value.level}${risk.value.score ? ` (${risk.value.score})` : ""}.`,
      source: "arkham",
    });
  }

  if (counterparties.status === "fulfilled" && counterparties.value?.counterparties?.length) {
    const top = counterparties.value.counterparties[0];
    findings.push({
      label: "Funding trace",
      value: top.arkhamEntity?.name
        ? `Top counterparty is a known entity: ${top.arkhamEntity.name}.`
        : `Top counterparty is an unlabeled address.`,
      source: "arkham",
    });
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

  return { address, verdict, confidence, elapsedMs: Date.now() - started, findings };
}
