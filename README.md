# eFootShop — Catalogue de comptes eFootball

Catalogue public + espace admin protégé, backend Node/Express, base PostgreSQL (Supabase).

## 1. Installer les dépendances (sur ta machine Linux)

```bash
cd efootball-shop
npm install
```

## 2. Créer le projet Supabase (gratuit)

1. Va sur https://supabase.com → crée un compte → "New project".
2. Une fois le projet créé, va dans **SQL Editor** → colle le contenu de `sql/schema.sql` → **Run**.
3. Va dans **Storage** → **New bucket** → nomme-le `photos` → coche **Public bucket** (les photos ne sont pas sensibles, seul le numéro l'est).
4. Va dans **Project Settings > Database** → copie la **Connection string** (mode "Transaction", port 6543) → ce sera ton `DATABASE_URL`.
5. Va dans **Project Settings > API** → copie `Project URL` (→ `SUPABASE_URL`) et la clé **service_role** (→ `SUPABASE_SERVICE_ROLE_KEY`, à garder secrète, jamais exposée au front).

## 3. Configurer le fichier .env

```bash
cp .env.example .env
```

Remplis `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Génère ensuite le hash de ton code secret admin :

```bash
node server/hash-code.js "TonCodeSecretIci"
```

Copie la ligne `ADMIN_CODE_HASH=...` affichée dans ton `.env`. Mets aussi une longue chaîne aléatoire dans `JWT_SECRET` (ex: `openssl rand -hex 32`).

## 4. Lancer en local

```bash
npm start
```

- Catalogue public : http://localhost:3000
- Admin : http://localhost:3000/admin (utilise ton code secret, pas le hash)

## 5. Déployer gratuitement (Render)

1. Mets ton projet sur GitHub (`git init`, `git add .`, `git commit`, push sur un repo).
2. Va sur https://render.com → **New > Web Service** → connecte ton repo GitHub.
3. Render détecte Node automatiquement :
   - Build command : `npm install`
   - Start command : `npm start`
4. Dans l'onglet **Environment**, ajoute toutes les variables de ton `.env` (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET, ADMIN_CODE_HASH, JWT_SECRET).
5. Déploie. Ton site sera accessible via une URL du type `https://ton-site.onrender.com`.

⚠️ Le plan gratuit de Render met le service en veille après inactivité : le premier visiteur après une pause attend ~30 secondes que le serveur redémarre. C'est normal et sans risque pour tes données (elles restent sur Supabase, toujours actif).

## Comment fonctionne le bouton "Acheter via WhatsApp"

Le numéro de téléphone de chaque compte n'est jamais envoyé au navigateur avant le clic : le catalogue public ne reçoit que titre/prix/photo/description. Au clic sur le bouton :

1. La photo du compte est téléchargée (Android/Chrome : téléchargement direct silencieux ; iOS Safari : ouverture de la photo dans un nouvel onglet avec instruction d'appui long, car iOS ne permet pas le téléchargement automatique de fichiers de la même façon).
2. Le navigateur est ensuite redirigé vers `/api/accounts/:id/contact`, une route serveur qui va chercher le numéro en base **à ce moment précis** et redirige (302) vers le lien `wa.me` correspondant, avec un message pré-rempli.

Le numéro n'apparaît donc jamais dans le code source de la page ni dans les réponses JSON du catalogue — uniquement dans une redirection serveur déclenchée par le clic. C'est la meilleure garantie possible côté web : un visiteur qui inspecte activement le trafic réseau au moment précis du clic pourrait théoriquement voir la redirection, mais rien n'est visible en navigation normale ni en amont.

## Limite technique assumée

Aucun lien `wa.me` ne peut joindre un fichier automatiquement dans WhatsApp (limitation WhatsApp, pas contournable). Le flux ci-dessus est le meilleur compromis : la photo est prête (téléchargée ou ouverte) juste avant l'ouverture de WhatsApp, il ne reste qu'un tap "joindre" à faire à l'acheteur.
