-- ponytail: owner_ip stands in for user_id until auth lands (M3). Swap the
-- column + backfill once accounts exist; not adding a users table for this yet.
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  owner_ip text not null,
  address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (owner_ip, address)
);
