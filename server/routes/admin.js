const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { pool, supabase, BUCKET } = require("../db");
const {
  checkAdminCode,
  issueSessionCookie,
  clearSessionCookie,
  requireAdmin,
} = require("../auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Le fichier doit être une image"));
    }
    cb(null, true);
  },
});

// --- Connexion admin ---
router.post("/login", (req, res) => {
  const { code } = req.body;
  if (!checkAdminCode(code)) {
    return res.status(401).json({ error: "Code incorrect" });
  }
  issueSessionCookie(res);
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/check", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// Tout ce qui suit nécessite d'être authentifié
router.use(requireAdmin);

// --- Liste admin (avec numéro de téléphone, visible uniquement ici) ---
router.get("/accounts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, old_price, description, photo_url, phone_number, is_flash, created_at
       from accounts order by created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

async function uploadPhoto(file) {
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

// --- Créer un compte ---
router.post("/accounts", upload.single("photo"), async (req, res) => {
  try {
    const { title, price, description, phone_number, old_price, is_flash } = req.body;
    if (!title || !price) {
      return res.status(400).json({ error: "Titre et prix sont obligatoires" });
    }
    const photoUrl = await uploadPhoto(req.file);

    const { rows } = await pool.query(
      `insert into accounts (title, price, old_price, description, photo_url, phone_number, is_flash)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [title, price, old_price ? old_price : null, description || "", photoUrl, phone_number || null, is_flash === "true" || is_flash === true]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la création" });
  }
});

// --- Modifier un compte ---
router.put("/accounts/:id", upload.single("photo"), async (req, res) => {
  try {
    const { title, price, description, phone_number, old_price, is_flash } = req.body;
    const photoUrl = req.file ? await uploadPhoto(req.file) : null;

    const fields = [];
    const values = [];
    let i = 1;

    if (title) { fields.push(`title = $${i++}`); values.push(title); }
    if (price) { fields.push(`price = $${i++}`); values.push(price); }
    if (old_price !== undefined) { fields.push(`old_price = $${i++}`); values.push(old_price === "" ? null : old_price); }
    if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description); }
    if (phone_number) { fields.push(`phone_number = $${i++}`); values.push(phone_number); }
    if (photoUrl) { fields.push(`photo_url = $${i++}`); values.push(photoUrl); }
    if (is_flash !== undefined) { fields.push(`is_flash = $${i++}`); values.push(is_flash === "true" || is_flash === true); }

    if (!fields.length) return res.status(400).json({ error: "Rien à mettre à jour" });

    values.push(req.params.id);
    await pool.query(
      `update accounts set ${fields.join(", ")} where id = $${i}`,
      values
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la modification" });
  }
});

// --- Supprimer un compte ---
router.delete("/accounts/:id", async (req, res) => {
  try {
    await pool.query(`delete from accounts where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
});

// --- Bannière promo (site_settings) ---
router.get("/settings", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select banner_text, banner_active, banner_image_url, banner_end_time, whatsapp_number from site_settings where id = 1`
    );
    res.json(rows[0] || { banner_text: "", banner_active: false, banner_image_url: null, banner_end_time: null, whatsapp_number: "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/settings", upload.single("banner_image"), async (req, res) => {
  try {
    const { banner_text, banner_active, remove_banner_image, banner_end_time, remove_banner_end_time, whatsapp_number } = req.body;

    let banner_image_url;
    if (req.file) {
      banner_image_url = await uploadPhoto(req.file);
    } else if (remove_banner_image === "true") {
      banner_image_url = null;
    }

    let endTimeValue;
    if (remove_banner_end_time === "true") {
      endTimeValue = null;
    } else if (banner_end_time) {
      endTimeValue = banner_end_time;
    }

    const activeValue = banner_active === "true" || banner_active === true;

    // On construit la requête dynamiquement pour ne toucher que les champs fournis
    const setClauses = ["banner_text = $1", "banner_active = $2"];
    const values = [banner_text || "", activeValue];
    let i = 3;

    if (banner_image_url !== undefined) {
      setClauses.push(`banner_image_url = $${i++}`);
      values.push(banner_image_url);
    }
    if (endTimeValue !== undefined) {
      setClauses.push(`banner_end_time = $${i++}`);
      values.push(endTimeValue);
    }
    if (whatsapp_number) {
      setClauses.push(`whatsapp_number = $${i++}`);
      values.push(whatsapp_number);
    }

    const insertCols = ["id", "banner_text", "banner_active"];
    const insertVals = ["1", "$1", "$2"];
    if (banner_image_url !== undefined) { insertCols.push("banner_image_url"); insertVals.push(`$${insertCols.length - 1}`); }
    if (endTimeValue !== undefined) { insertCols.push("banner_end_time"); insertVals.push(`$${insertCols.length - 1}`); }
    if (whatsapp_number) { insertCols.push("whatsapp_number"); insertVals.push(`$${insertCols.length - 1}`); }

    await pool.query(
      `insert into site_settings (${insertCols.join(", ")})
       values (${insertVals.join(", ")})
       on conflict (id) do update set ${setClauses.join(", ")}`,
      values
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
