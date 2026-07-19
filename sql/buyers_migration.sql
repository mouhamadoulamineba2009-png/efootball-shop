-- Migration : comptes acheteurs + favoris
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  phone text,
  created_at timestamptz default now()
);

create table if not exists favorites (
  buyer_id uuid references buyers(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (buyer_id, account_id)
);
