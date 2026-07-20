const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const path = require("path");

if (!process.env.DATABASE_URL) {
  console.error("ERREUR : DATABASE_URL manquant dans .env");
  process.exit(1);
}

// Pool de connexions PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Client Supabase (utilisé uniquement pour le Storage des photos)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = process.env.SUPABASE_BUCKET || "photos";

// Upload un fichier image (multer) vers le bucket Supabase et renvoie son URL publique
async function uploadImage(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname) || ".jpg";
  const filename = `${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

module.exports = { pool, supabase, BUCKET, uploadImage };
