const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "admin_session";
const TOKEN_TTL = "12h";

function checkAdminCode(code) {
  if (!code || !process.env.ADMIN_CODE_HASH) return false;
  return bcrypt.compareSync(code, process.env.ADMIN_CODE_HASH);
}

function issueSessionCookie(res) {
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // inaccessible en JS côté navigateur
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Middleware : protège les routes admin. Vérifie le token côté serveur (jamais côté front).
function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

module.exports = {
  checkAdminCode,
  issueSessionCookie,
  clearSessionCookie,
  requireAdmin,
  COOKIE_NAME,
};
