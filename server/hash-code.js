// Utilitaire : génère le hash bcrypt de ton code admin, à coller dans .env (ADMIN_CODE_HASH)
// Usage : node server/hash-code.js "MonCodeSecret123"
const bcrypt = require("bcryptjs");

const code = process.argv[2];

if (!code) {
  console.error("Usage : node server/hash-code.js \"TonCodeSecret\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(code, 10);
console.log("\nAjoute cette ligne dans ton fichier .env :\n");
console.log(`ADMIN_CODE_HASH=${hash}\n`);
