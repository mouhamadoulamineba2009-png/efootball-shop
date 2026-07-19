-- Migration : comptes en vente flash
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table accounts add column if not exists is_flash boolean default false;
