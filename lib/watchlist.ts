import { sql } from "@/lib/db";

export async function addToWatchlist(ownerIp: string, address: string, label?: string) {
  const rows = await sql`
    insert into watchlist (owner_ip, address, label)
    values (${ownerIp}, ${address}, ${label ?? null})
    on conflict (owner_ip, address) do update set label = excluded.label
    returning id, address, label, created_at
  `;
  return rows[0];
}
