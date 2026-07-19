-- Migration : compte à rebours sur la bannière promo
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table site_settings add column if not exists banner_end_time timestamptz;
