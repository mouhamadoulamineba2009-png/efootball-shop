const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "buyer_session";
const TOKEN_TTL = "30d";

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function issueBuyerCookie(res, buyerId) {
  const token = jwt.sign({ buyerId, role: "buyer" }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
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

// Middleware : protège les routes acheteur, place req.buyerId si connecté
function requireBuyer(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Non connecté" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.buyerId = payload.buyerId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

module.exports = {
  hashPassword,
  checkPassword,
  issueBuyerCookie,
  clearBuyerCookie,
  requireBuyer,
  COOKIE_NAME,
};
