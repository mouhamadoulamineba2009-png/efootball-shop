const express = require("express");
const { pool } = require("../db");
const {
  hashPassword,
  checkPassword,
  issueBuyerCookie,
  clearBuyerCookie,
  requireBuyer,
} = require("../buyerAuth");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

// --- Inscription ---
router.post("/register", async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!isValidEmail(email) || !password || password.length < 6) {
      return res.status(400).json({ error: "Email valide et mot de passe (6 caractères min.) requis" });
    }

    const existing = await pool.query(`select id from buyers where email = $1`, [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    }

    const { rows } = await pool.query(
      `insert into buyers (email, password_hash, phone) values ($1, $2, $3) returning id`,
      [email.toLowerCase(), hashPassword(password), phone || null]
    );

    issueBuyerCookie(res, rows[0].id);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Connexion ---
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(`select id, password_hash from buyers where email = $1`, [
      (email || "").toLowerCase(),
    ]);
    if (!rows.length || !checkPassword(password || "", rows[0].password_hash)) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }
    issueBuyerCookie(res, rows[0].id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/logout", (req, res) => {
  clearBuyerCookie(res);
  res.json({ ok: true });
});

// --- Profil (paramètres) ---
router.get("/me", requireBuyer, async (req, res) => {
  const { rows } = await pool.query(`select email, phone from buyers where id = $1`, [req.buyerId]);
  if (!rows.length) return res.status(404).json({ error: "Introuvable" });
  res.json(rows[0]);
});

router.put("/me", requireBuyer, async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (email) {
      if (!isValidEmail(email)) return res.status(400).json({ error: "Email invalide" });
      fields.push(`email = $${i++}`);
      values.push(email.toLowerCase());
    }
    if (phone !== undefined) {
      fields.push(`phone = $${i++}`);
      values.push(phone || null);
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: "Mot de passe trop court (6 min.)" });
      fields.push(`password_hash = $${i++}`);
      values.push(hashPassword(password));
    }
    if (!fields.length) return res.status(400).json({ error: "Rien à mettre à jour" });

    values.push(req.buyerId);
    await pool.query(`update buyers set ${fields.join(", ")} where id = $${i}`, values);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Favoris ---
router.get("/favorites", requireBuyer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select a.id, a.title, a.price, a.old_price, a.description, a.photo_url
       from favorites f
       join accounts a on a.id = f.account_id
       where f.buyer_id = $1
       order by f.created_at desc`,
      [req.buyerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/favorites/ids", requireBuyer, async (req, res) => {
  const { rows } = await pool.query(`select account_id from favorites where buyer_id = $1`, [req.buyerId]);
  res.json(rows.map((r) => r.account_id));
});

router.post("/favorites/:accountId", requireBuyer, async (req, res) => {
  try {
    await pool.query(
      `insert into favorites (buyer_id, account_id) values ($1, $2)
       on conflict do nothing`,
      [req.buyerId, req.params.accountId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/favorites/:accountId", requireBuyer, async (req, res) => {
  try {
    await pool.query(`delete from favorites where buyer_id = $1 and account_id = $2`, [
      req.buyerId,
      req.params.accountId,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
