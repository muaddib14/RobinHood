create table if not exists scans (
  address text primary key,
  result jsonb not null,
  scanned_at timestamptz not null default now()
);
