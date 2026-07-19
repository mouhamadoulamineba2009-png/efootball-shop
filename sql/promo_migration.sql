-- Migration : ajoute la gestion des promotions
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table accounts add column if not exists old_price numeric(12, 0);

create table if not exists site_settings (
  id int primary key default 1,
  banner_text text default '',
  banner_active boolean default false,
  check (id = 1)
);

insert into site_settings (id, banner_text, banner_active)
values (1, '', false)
on conflict (id) do nothing;
