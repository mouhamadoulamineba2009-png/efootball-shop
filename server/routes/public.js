const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/accounts -> liste publique (le numéro de téléphone n'est JAMAIS inclus ici)
router.get("/accounts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, old_price, description, photo_url, is_flash, created_at
       from accounts
       order by created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/settings -> infos publiques (bannière promo)
router.get("/settings", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select banner_text, banner_active, banner_image_url, banner_end_time from site_settings where id = 1`
    );
    res.json(rows[0] || { banner_text: "", banner_active: false, banner_image_url: null, banner_end_time: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/accounts/:id -> détail public (toujours sans le numéro)
router.get("/accounts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, old_price, description, photo_url, is_flash, created_at
       from accounts where id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Introuvable" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/accounts/:id/contact
// Un seul numéro WhatsApp est utilisé pour toutes les ventes (configuré dans site_settings).
// Le numéro éventuellement saisi par compte est une note interne (fournisseur) et n'est jamais utilisé ici.
router.get("/accounts/:id/contact", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select title from accounts where id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).send("Compte introuvable");

    const settingsResult = await pool.query(
      `select whatsapp_number from site_settings where id = 1`
    );
    const whatsappNumber = settingsResult.rows[0]?.whatsapp_number;
    if (!whatsappNumber) return res.status(500).send("Numéro WhatsApp non configuré");

    const { title } = rows[0];
    const message = `Bonjour, je suis intéressé(e) par le compte "${title}" vu sur le catalogue. Est-il toujours disponible ?`;
    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    res.redirect(302, waUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur");
  }
});

module.exports = router;
