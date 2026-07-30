const express = require("express");
const multer = require("multer");
const { pool, uploadImage } = require("../db");
const { sendLoginCode, sendResetCode } = require("../mailer");
const {
  hashPassword,
  checkPassword,
  issueBuyerCookie,
  clearBuyerCookie,
  requireBuyer,
  logBuyerSession,
} = require("../buyerAuth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Le fichier doit être une image"));
    cb(null, true);
  },
});

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
      `insert into buyers (email, password_hash, phone) values ($1, $2, $3) returning id, session_version`,
      [email.toLowerCase(), hashPassword(password), phone || null]
    );

    issueBuyerCookie(res, rows[0].id, rows[0].session_version);
    await logBuyerSession(rows[0].id, req);
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
    const { rows } = await pool.query(
      `select id, email, password_hash, session_version from buyers where email = $1`,
      [(email || "").toLowerCase()]
    );
    if (!rows.length || !checkPassword(password || "", rows[0].password_hash)) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const buyer = rows[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      `insert into login_otps (buyer_id, code, expires_at) values ($1, $2, $3)`,
      [buyer.id, code, expiresAt]
    );

    await sendLoginCode(buyer.email, code);

    res.json({ ok: true, requireCode: true, buyerId: buyer.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/login/verify-code", async (req, res) => {
  try {
    const { buyerId, code } = req.body;
    const { rows } = await pool.query(
      `select id, expires_at, used from login_otps
       where buyer_id = $1 and code = $2
       order by created_at desc limit 1`,
      [buyerId, code]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Code incorrect" });
    }
    const otp = rows[0];
    if (otp.used) {
      return res.status(401).json({ error: "Ce code a déjà été utilisé" });
    }
    if (new Date(otp.expires_at) < new Date()) {
      return res.status(401).json({ error: "Ce code a expiré, reconnectez-vous" });
    }

    await pool.query(`update login_otps set used = true where id = $1`, [otp.id]);

    const { rows: buyerRows } = await pool.query(
      `select id, session_version from buyers where id = $1`,
      [buyerId]
    );
    if (!buyerRows.length) {
      return res.status(401).json({ error: "Compte introuvable" });
    }

    issueBuyerCookie(res, buyerRows[0].id, buyerRows[0].session_version);
    await logBuyerSession(buyerRows[0].id, req);
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
  const { rows } = await pool.query(`select email, phone, avatar_url from buyers where id = $1`, [req.buyerId]);
  if (!rows.length) return res.status(404).json({ error: "Introuvable" });
  res.json(rows[0]);
});

router.put("/me", requireBuyer, upload.single("avatar"), async (req, res) => {
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
    if (req.file) {
      const avatarUrl = await uploadImage(req.file);
      fields.push(`avatar_url = $${i++}`);
      values.push(avatarUrl);
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
      `select a.id, a.title, a.price, a.old_price, a.description, a.photo_url, a.is_flash
       from favorites f
       join accounts a on a.id = f.account_id
       where f.buyer_id = $1 and coalesce(a.is_sold, false) = false
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
      `insert into favorites (buyer_id, account_id) values ($1, $2) on conflict do nothing`,
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

// --- Appareils connectés ---
router.get("/sessions", requireBuyer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, user_agent, ip, created_at from buyer_sessions
       where buyer_id = $1 order by created_at desc limit 10`,
      [req.buyerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Déconnecte tous les appareils (change la version de session -> invalide tous les anciens tokens)
// puis réémet un cookie valide pour l'appareil courant.
router.post("/sessions/revoke-all", requireBuyer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `update buyers set session_version = session_version + 1 where id = $1 returning session_version`,
      [req.buyerId]
    );
    issueBuyerCookie(res, req.buyerId, rows[0].session_version);
    await logBuyerSession(req.buyerId, req);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Notifications (alertes prix + nouveaux comptes flash) ---
router.get("/notifications", requireBuyer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, message, account_id, is_read, created_at from notifications
       where buyer_id = $1 order by created_at desc limit 30`,
      [req.buyerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/notifications/unread-count", requireBuyer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select count(*)::int as count from notifications where buyer_id = $1 and is_read = false`,
      [req.buyerId]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/notifications/read-all", requireBuyer, async (req, res) => {
  try {
    await pool.query(`update notifications set is_read = true where buyer_id = $1`, [req.buyerId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Mot de passe oublié ---
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await pool.query(
      `select id, email from buyers where email = $1`,
      [(email || "").toLowerCase()]
    );

    // Toujours répondre "ok" même si l'email n'existe pas (sécurité : ne pas révéler quels emails sont inscrits)
    if (!rows.length) {
      return res.json({ ok: true });
    }

    const buyer = rows[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `insert into password_resets (buyer_id, code, expires_at) values ($1, $2, $3)`,
      [buyer.id, code, expiresAt]
    );

    await sendResetCode(buyer.email, code);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    const { rows: buyerRows } = await pool.query(
      `select id from buyers where email = $1`,
      [(email || "").toLowerCase()]
    );
    if (!buyerRows.length) {
      return res.status(400).json({ error: "Code invalide" });
    }
    const buyerId = buyerRows[0].id;

    const { rows } = await pool.query(
      `select id, expires_at, used from password_resets
       where buyer_id = $1 and code = $2
       order by created_at desc limit 1`,
      [buyerId, code]
    );

    if (!rows.length) {
      return res.status(400).json({ error: "Code invalide" });
    }
    const reset = rows[0];
    if (reset.used) {
      return res.status(400).json({ error: "Ce code a déjà été utilisé" });
    }
    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ error: "Ce code a expiré, refaites une demande" });
    }

    await pool.query(`update password_resets set used = true where id = $1`, [reset.id]);

    const newHash = hashPassword(newPassword);
    await pool.query(`update buyers set password_hash = $1 where id = $2`, [newHash, buyerId]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
