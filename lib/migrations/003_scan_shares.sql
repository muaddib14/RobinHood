-- Permanent, id-keyed scan snapshots for shareable links. Separate from
-- `scans` (lib/migrations/001_scans_cache.sql), which is address-keyed,
-- 15-min TTL, and gets overwritten on every fresh scan — it can't double
-- as permanent share storage.
create table if not exists scan_shares (
  id uuid primary key default gen_random_uuid(),
  result jsonb not null,
  created_at timestamptz not null default now()
);
