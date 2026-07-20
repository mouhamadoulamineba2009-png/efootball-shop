const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const PDFDocument = require("pdfkit");
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
      `select id, title, price, old_price, description, photo_url, phone_number, is_flash, is_sold, views_total, created_at
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

    // Notifie tous les acheteurs inscrits si le compte est une vente flash
    if (is_flash === "true" || is_flash === true) {
      await pool.query(
        `insert into notifications (buyer_id, message, account_id)
         select id, $1, $2 from buyers`,
        [`⚡ Nouveau compte flash disponible : "${title}"`, rows[0].id]
      );
    }

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

    // On récupère le prix et le titre actuels pour détecter une baisse de prix
    const current = await pool.query(`select title, price from accounts where id = $1`, [req.params.id]);
    const currentPrice = current.rows[0]?.price;
    const currentTitle = current.rows[0]?.title;

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

    // Si le prix a baissé, on notifie les acheteurs qui ont ce compte en favori
    if (price && currentPrice && Number(price) < Number(currentPrice)) {
      await pool.query(
        `insert into notifications (buyer_id, message, account_id)
         select f.buyer_id, $1, $2 from favorites f where f.account_id = $2`,
        [`💰 Le prix de "${title || currentTitle}" a baissé !`, req.params.id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la modification" });
  }
});

// --- Marquer un compte comme vendu (retiré du catalogue public + ajouté à l'historique) ---
router.put("/accounts/:id/mark-sold", async (req, res) => {
  try {
    const { rows } = await pool.query(`select title, price from accounts where id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Compte introuvable" });

    await pool.query(`update accounts set is_sold = true where id = $1`, [req.params.id]);
    await pool.query(
      `insert into sales (account_id, title, price) values ($1, $2, $3)`,
      [req.params.id, rows[0].title, rows[0].price]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Remettre un compte en vente ---
router.put("/accounts/:id/unmark-sold", async (req, res) => {
  try {
    await pool.query(`update accounts set is_sold = false where id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Historique des ventes ---
router.get("/sales", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select id, title, price, sold_at from sales order by sold_at desc limit 200`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Statistiques (ventes totales, visites du mois) ---
router.get("/stats", async (req, res) => {
  try {
    const soldResult = await pool.query(`select count(*)::int as total_sold from sales`);
    const visitsResult = await pool.query(
      `select coalesce(sum(count), 0)::int as visits_this_month
       from site_visits
       where date_trunc('month', visit_date) = date_trunc('month', current_date)`
    );
    const revenueResult = await pool.query(
      `select coalesce(sum(price), 0)::numeric as revenue_this_month
       from sales
       where date_trunc('month', sold_at) = date_trunc('month', current_date)`
    );
    res.json({
      total_sold: soldResult.rows[0].total_sold,
      visits_this_month: visitsResult.rows[0].visits_this_month,
      revenue_this_month: Number(revenueResult.rows[0].revenue_this_month),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Rapport mensuel en PDF (visites + ventes du mois en cours) ---
router.get("/report.pdf", async (req, res) => {
  try {
    const visitsResult = await pool.query(
      `select visit_date, count from site_visits
       where date_trunc('month', visit_date) = date_trunc('month', current_date)
       order by visit_date asc`
    );
    const salesResult = await pool.query(
      `select title, price, sold_at from sales
       where date_trunc('month', sold_at) = date_trunc('month', current_date)
       order by sold_at asc`
    );

    const totalVisits = visitsResult.rows.reduce((sum, r) => sum + r.count, 0);
    const totalRevenue = salesResult.rows.reduce((sum, r) => sum + Number(r.price), 0);
    const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-${monthLabel.replace(" ", "-")}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("Efoot Market SN — Rapport mensuel", { align: "left" });
    doc.fontSize(12).fillColor("#555").text(`Période : ${monthLabel}`);
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(14).text("Résumé");
    doc.fontSize(11).fillColor("#333");
    doc.text(`Visites totales du site ce mois : ${totalVisits}`);
    doc.text(`Comptes vendus ce mois : ${salesResult.rows.length}`);
    doc.text(`Revenu total ce mois : ${new Intl.NumberFormat("fr-FR").format(totalRevenue)} FCFA`);
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(14).text("Ventes du mois");
    doc.moveDown(0.5);
    if (!salesResult.rows.length) {
      doc.fontSize(11).fillColor("#666").text("Aucune vente enregistrée ce mois.");
    } else {
      salesResult.rows.forEach((sale) => {
        const date = new Date(sale.sold_at).toLocaleDateString("fr-FR");
        doc.fontSize(11).fillColor("#333").text(
          `${date} — ${sale.title} — ${new Intl.NumberFormat("fr-FR").format(sale.price)} FCFA`
        );
      });
    }
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(14).text("Visites par jour");
    doc.moveDown(0.5);
    if (!visitsResult.rows.length) {
      doc.fontSize(11).fillColor("#666").text("Aucune visite enregistrée ce mois.");
    } else {
      visitsResult.rows.forEach((v) => {
        const date = new Date(v.visit_date).toLocaleDateString("fr-FR");
        doc.fontSize(11).fillColor("#333").text(`${date} — ${v.count} visite(s)`);
      });
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la génération du PDF" });
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
