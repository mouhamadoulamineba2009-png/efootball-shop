-- Migration : bannière promo en image
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table site_settings add column if not exists banner_image_url text;
