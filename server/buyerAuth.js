const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("./db");

const COOKIE_NAME = "buyer_session";
const TOKEN_TTL = "30d";

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function issueBuyerCookie(res, buyerId, sessionVersion) {
  const token = jwt.sign(
    { buyerId, sessionVersion: sessionVersion || 1, role: "buyer" },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearBuyerCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Middleware : protège les routes acheteur, place req.buyerId si connecté.
// Vérifie aussi que la session n'a pas été révoquée (déconnexion de tous les appareils).
async function requireBuyer(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Non connecté" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(`select session_version from buyers where id = $1`, [payload.buyerId]);
    if (!rows.length || rows[0].session_version !== payload.sessionVersion) {
      return res.status(401).json({ error: "Session expirée, reconnecte-toi" });
    }
    req.buyerId = payload.buyerId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

// Enregistre une connexion (pour la liste "appareils connectés")
async function logBuyerSession(buyerId, req) {
  try {
    await pool.query(
      `insert into buyer_sessions (buyer_id, user_agent, ip) values ($1, $2, $3)`,
      [buyerId, req.headers["user-agent"] || "Inconnu", req.ip || ""]
    );
  } catch (err) {
    console.error("Erreur log session:", err);
  }
}

module.exports = {
  hashPassword,
  checkPassword,
  issueBuyerCookie,
  clearBuyerCookie,
  requireBuyer,
  logBuyerSession,
  COOKIE_NAME,
};
