import { sql } from "@/lib/db";
import type { ScanResult } from "@/lib/types";

export async function saveShare(result: ScanResult): Promise<string> {
  const rows = await sql`insert into scan_shares (result) values (${JSON.stringify(result)}) returning id`;
  return (rows[0] as { id: string }).id;
}

export async function getShare(id: string): Promise<ScanResult | null> {
  const rows = await sql`select result from scan_shares where id = ${id}`;
  const row = rows[0] as { result: ScanResult } | undefined;
  return row ? row.result : null;
}
