-- Migration : ventes, vues par compte, visites du site
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table accounts add column if not exists is_sold boolean default false;
alter table accounts add column if not exists views_total integer default 0;
alter table accounts add column if not exists views_today integer default 0;
alter table accounts add column if not exists views_date date;

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  title text not null,
  price numeric(12, 0) not null,
  sold_at timestamptz default now()
);

create table if not exists site_visits (
  visit_date date primary key,
  count integer default 0
);
