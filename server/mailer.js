const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendLoginCode(toEmail, code) {
  await transporter.sendMail({
    from: `"Efoot Market SN" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Votre code de confirmation — Efoot Market SN",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0B3D2E;">Efoot Market SN</h2>
        <p>Voici votre code de confirmation pour vous connecter :</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color:#0B3D2E;">${code}</p>
        <p style="color:#666; font-size:13px;">Ce code expire dans 10 minutes. Si vous n'avez pas demandé cette connexion, ignorez cet email.</p>
      </div>
    `,
  });
}

module.exports = { sendLoginCode };
