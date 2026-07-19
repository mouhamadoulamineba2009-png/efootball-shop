-- Migration : un seul numéro WhatsApp global pour toutes les ventes
-- Le "numéro" par compte devient une simple note interne (fournisseur), plus utilisé pour WhatsApp
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run

alter table site_settings add column if not exists whatsapp_number text default '221771961314';
update site_settings set whatsapp_number = '221771961314' where id = 1 and whatsapp_number is null;

-- Le numéro par compte n'est plus obligatoire (c'est juste une note interne désormais)
alter table accounts alter column phone_number drop not null;
