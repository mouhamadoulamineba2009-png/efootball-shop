-- À exécuter dans Supabase : Project > SQL Editor > New query > Run

create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price numeric(12, 0) not null,
  description text default '',
  photo_url text,
  phone_number text not null, -- avec indicatif, ex: 22890123456 (jamais exposé au public)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger simple pour mettre à jour updated_at automatiquement
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_accounts_updated_at on accounts;
create trigger trg_accounts_updated_at
before update on accounts
for each row execute function set_updated_at();
