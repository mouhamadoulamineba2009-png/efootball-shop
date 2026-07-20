-- Migration : avatar, appareils connectés, notifications (alertes prix + flash)
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table buyers add column if not exists avatar_url text;
alter table buyers add column if not exists session_version integer default 1;

create table if not exists buyer_sessions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references buyers(id) on delete cascade,
  message text not null,
  account_id uuid references accounts(id) on delete set null,
  is_read boolean default false,
  created_at timestamptz default now()
);
