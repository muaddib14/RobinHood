/**
 * Official data contract for Gotham scans — defined once, used everywhere.
 * Mirrors the developer brief's shape exactly so future milestones (Arkham,
 * Claude, Supabase, Chrome extension) plug in without re-shaping this.
 */

export type Source = "gotham" | "arkham" | "solanafm" | "vybe";

export type Verdict = "high_risk" | "mixed" | "clean" | "insufficient_data";

export type ReadKey = "deployer" | "funding_trace" | "entity_match" | "token_checks" | "smart_money";

export type FindingStatus = "ok" | "warn" | "flag" | "unavailable";

export interface Finding {
  read: ReadKey;
  label: string; // "Funding trace"
  source: Source;
  status: FindingStatus;
  summary: string; // one sentence, may contain <b> emphasis
  data: Record<string, unknown>; // raw payload for the detail view
}

export interface ScanResult {
  address: string;
  kind: "token" | "wallet";
  verdict: Verdict;
  verdict_line: string; // "High risk — funding traces to a serial deployer"
  findings: Finding[];
  answered_ms: number;
  cached: boolean;
  scanned_at: string; // ISO
}
