import { sql } from "@/lib/db";
import type { ScanResult } from "@/lib/types";

const TTL_MS = 15 * 60 * 1000;

export async function getCachedScan(address: string): Promise<ScanResult | null> {
  const rows = await sql`select result, scanned_at from scans where address = ${address}`;
  const row = rows[0] as { result: ScanResult; scanned_at: string } | undefined;
  if (!row) return null;
  if (Date.now() - new Date(row.scanned_at).getTime() > TTL_MS) return null;
  return { ...row.result, cached: true };
}

export async function setCachedScan(address: string, result: ScanResult): Promise<void> {
  await sql`
    insert into scans (address, result, scanned_at)
    values (${address}, ${JSON.stringify(result)}, ${result.scanned_at})
    on conflict (address) do update set result = excluded.result, scanned_at = excluded.scanned_at
  `;
}
