async function sendBrevoEmail(toEmail, subject, htmlContent) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "Efoot Market SN", email: process.env.GMAIL_USER },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Brevo error ${res.status}: ${errText}`);
  }
}

async function sendLoginCode(toEmail, code) {
  await sendBrevoEmail(
    toEmail,
    "Votre code de confirmation — Efoot Market SN",
    `
      <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0B3D2E;">Efoot Market SN</h2>
        <p>Voici votre code de confirmation pour vous connecter :</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color:#0B3D2E;">${code}</p>
        <p style="color:#666; font-size:13px;">Ce code expire dans 10 minutes. Si vous n'avez pas demandé cette connexion, ignorez cet email.</p>
      </div>
    `
  );
}

async function sendResetCode(toEmail, code) {
  await sendBrevoEmail(
    toEmail,
    "Réinitialisation de votre mot de passe — Efoot Market SN",
    `
      <div style="font-family: Arial, sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#0B3D2E;">Efoot Market SN</h2>
        <p>Voici votre code pour réinitialiser votre mot de passe :</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color:#0B3D2E;">${code}</p>
        <p style="color:#666; font-size:13px;">Ce code expire dans 15 minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      </div>
    `
  );
}

module.exports = { sendLoginCode, sendResetCode };
