require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");
const buyerRoutes = require("./routes/buyer");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Fichiers statiques (catalogue.html, admin.html, css, js)
app.use(express.static(path.join(__dirname, "..", "public")));

// API
app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/buyer", buyerRoutes);

// Pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
