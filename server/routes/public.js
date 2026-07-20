const express = require("express");
const { pool } = require("../db");

const router = express.Router();

// GET /api/accounts -> liste publique (le numéro de téléphone n'est JAMAIS inclus ici)
// Les comptes vendus (is_sold = true) sont automatiquement exclus.
router.get("/accounts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, old_price, description, photo_url, is_flash, views_today, created_at
       from accounts
       where coalesce(is_sold, false) = false
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

// GET /api/stats -> statistiques publiques (nombre de comptes vendus depuis le lancement)
router.get("/stats", async (req, res) => {
  try {
    const { rows } = await pool.query(`select count(*)::int as total_sold from sales`);
    res.json({ total_sold: rows[0].total_sold });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/accounts/:id -> détail public (toujours sans le numéro)
router.get("/accounts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, old_price, description, photo_url, is_flash, views_today, created_at
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

// POST /api/accounts/:id/view -> incrémente les vues du jour pour ce compte
// Dédupliqué via cookie (1 vue comptée par visiteur et par compte, par jour)
router.post("/accounts/:id/view", async (req, res) => {
  try {
    const id = req.params.id;
    const cookieName = `v_${id}`;
    const today = new Date().toISOString().slice(0, 10);

    if (req.cookies?.[cookieName] === today) {
      const { rows } = await pool.query(`select views_today from accounts where id = $1`, [id]);
      return res.json({ views_today: rows[0]?.views_today || 0 });
    }

    const { rows } = await pool.query(
      `update accounts
       set views_today = case when views_date = current_date then coalesce(views_today, 0) + 1 else 1 end,
           views_total = coalesce(views_total, 0) + 1,
           views_date = current_date
       where id = $1
       returning views_today`,
      [id]
    );

    res.cookie(cookieName, today, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: "lax" });
    res.json({ views_today: rows[0]?.views_today || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/site-visit -> incrémente les visites du site pour aujourd'hui
// Dédupliqué via cookie (1 visite comptée par visiteur et par jour)
router.post("/site-visit", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (req.cookies?.site_visited === today) {
      return res.json({ ok: true });
    }
    await pool.query(
      `insert into site_visits (visit_date, count) values (current_date, 1)
       on conflict (visit_date) do update set count = site_visits.count + 1`
    );
    res.cookie("site_visited", today, { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: "lax" });
    res.json({ ok: true });
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
