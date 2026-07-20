const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty");
const stepOverlay = document.getElementById("stepOverlay");
const stepTitle = document.getElementById("stepTitle");
const stepText = document.getElementById("stepText");
const stepSpinner = document.getElementById("stepSpinner");
const stepImgWrap = document.getElementById("stepImgWrap");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

window.favoriteIds = window.favoriteIds || new Set();
let allAccounts = [];

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function formatPrice(price) {
  return new Intl.NumberFormat("fr-FR").format(price) + " FCFA";
}

function waIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.876.508 3.646 1.393 5.166L2 22l4.964-1.363A9.953 9.953 0 0 0 12.001 22C17.523 22 22 17.523 22 12S17.523 2 12.001 2zm0 18.153a8.14 8.14 0 0 1-4.148-1.13l-.297-.176-3.132.86.84-3.065-.194-.314A8.146 8.146 0 0 1 3.849 12c0-4.499 3.653-8.152 8.152-8.152S20.153 7.501 20.153 12 16.5 20.153 12.001 20.153z"/></svg>`;
}

async function loadBanner() {
  try {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    const banner = document.getElementById("banner");
    if (!settings.banner_active) return;

    if (settings.banner_image_url) {
      banner.innerHTML = `<img src="${settings.banner_image_url}" alt="${escapeHtml(settings.banner_text || "Promotion")}">`;
      banner.classList.add("has-image");
      banner.style.display = "block";
    } else if (settings.banner_text) {
      banner.textContent = settings.banner_text;
      banner.style.display = "block";
    }

    if (settings.banner_end_time) {
      startCountdown(settings.banner_end_time);
    }
  } catch (err) {
    console.warn("Bannière indisponible", err);
  }
}

function startCountdown(endTimeIso) {
  const countdownEl = document.getElementById("countdown");
  const endTime = new Date(endTimeIso).getTime();
  if (isNaN(endTime)) return;

  function tick() {
    const diff = endTime - Date.now();
    if (diff <= 0) {
      countdownEl.style.display = "none";
      clearInterval(timer);
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const pad = (n) => String(n).padStart(2, "0");
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    parts.push(`${pad(hours)}h`, `${pad(minutes)}m`, `${pad(seconds)}s`);

    countdownEl.innerHTML = `Offre valable encore <span>${parts.join(" ")}</span>`;
    countdownEl.style.display = "block";
  }

  tick();
  const timer = setInterval(tick, 1000);
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const stats = await res.json();
    if (stats.total_sold > 0) {
      const bar = document.getElementById("statsBar");
      bar.textContent = `🔥 ${stats.total_sold} compte${stats.total_sold > 1 ? "s" : ""} vendu${stats.total_sold > 1 ? "s" : ""} depuis le lancement`;
      bar.style.display = "block";
    }
  } catch (err) {
    console.warn("Stats indisponibles", err);
  }
}

async function loadAccounts() {
  try {
    const res = await fetch("/api/accounts");
    allAccounts = await res.json();

    if (!allAccounts.length) {
      emptyState.style.display = "block";
      return;
    }

    renderCatalog();
  } catch (err) {
    console.error(err);
    emptyState.textContent = "Impossible de charger le catalogue pour le moment.";
    emptyState.style.display = "block";
  }
}

function applySearchAndSort(list) {
  const query = searchInput.value.trim().toLowerCase();
  let result = query
    ? list.filter((a) => a.title.toLowerCase().includes(query) || (a.description || "").toLowerCase().includes(query))
    : list.slice();

  const sortMode = sortSelect.value;
  if (sortMode === "price_asc") {
    result.sort((a, b) => a.price - b.price);
  } else if (sortMode === "price_desc") {
    result.sort((a, b) => b.price - a.price);
  } else {
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return result;
}

function renderCatalog() {
  const filtered = applySearchAndSort(allAccounts);
  const flashAccounts = filtered.filter((a) => a.is_flash);
  const normalAccounts = filtered.filter((a) => !a.is_flash);

  const flashSection = document.getElementById("flashSection");
  const catalogTitle = document.getElementById("catalogTitle");

  if (flashAccounts.length) {
    flashSection.style.display = "block";
    renderAccountsGrid(document.getElementById("flashGrid"), flashAccounts);
  } else {
    flashSection.style.display = "none";
    document.getElementById("flashGrid").innerHTML = "";
  }

  if (normalAccounts.length) {
    catalogTitle.style.display = flashAccounts.length ? "block" : "none";
    renderAccountsGrid(grid, normalAccounts);
    emptyState.style.display = "none";
  } else {
    grid.innerHTML = "";
    catalogTitle.style.display = "none";
    if (!flashAccounts.length) {
      emptyState.textContent = "Aucun résultat pour cette recherche.";
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
    }
  }
}

searchInput.addEventListener("input", renderCatalog);
sortSelect.addEventListener("change", renderCatalog);

// Rend une liste de comptes dans un conteneur donné et branche tous les événements
// (achat WhatsApp, favori, aperçu photo). Réutilisé pour le catalogue ET "Mes favoris".
function renderAccountsGrid(container, accounts) {
  container.innerHTML = accounts.map(renderCard).join("");
  accounts.forEach((acc) => {
    const btn = container.querySelector(`[data-buy="${acc.id}"]`);
    if (btn) btn.addEventListener("click", () => handleBuyClick(acc));

    const favBtn = container.querySelector(`[data-fav="${acc.id}"]`);
    if (favBtn && window.handleFavoriteClick) {
      favBtn.addEventListener("click", () => window.handleFavoriteClick(acc.id, favBtn));
    }

    const photo = container.querySelector(`[data-photo="${acc.id}"]`);
    if (photo && acc.photo_url) {
      photo.addEventListener("click", () => openLightbox(acc.photo_url));
    }

    // Enregistre une vue pour ce compte (dédupliqué côté serveur via cookie)
    fetch(`/api/accounts/${acc.id}/view`, { method: "POST", credentials: "include" }).catch(() => {});
  });
  applyFavoriteStates(container);
}

window.applyFavoriteStates = function (container) {
  const scope = container || document;
  scope.querySelectorAll("[data-fav]").forEach((btn) => {
    const id = btn.getAttribute("data-fav");
    const isFav = window.favoriteIds.has(id);
    btn.textContent = isFav ? "\u2665" : "\u2661";
    btn.classList.toggle("active", isFav);
  });
};

function renderCard(acc) {
  const photo = acc.photo_url
    ? `<img class="card-photo" data-photo="${acc.id}" src="${acc.photo_url}" alt="${escapeHtml(acc.title)}">`
    : `<div class="card-photo placeholder">Pas de photo</div>`;

  const hasPromo = acc.old_price && Number(acc.old_price) > Number(acc.price);
  const priceTag = hasPromo
    ? `<div class="price-tag promo"><span class="old">${formatPrice(acc.old_price)}</span> ${formatPrice(acc.price)}</div>`
    : `<div class="price-tag">${formatPrice(acc.price)}</div>`;
  const promoBadge = hasPromo ? `<div class="promo-badge">PROMO</div>` : "";
  const flashBadge = acc.is_flash ? `<div class="flash-badge">⚡ FLASH</div>` : "";
  const badgesTop = (flashBadge || promoBadge)
    ? `<div class="badge-stack">${flashBadge}${promoBadge}</div>`
    : "";
  const viewsBadge = acc.views_today > 0
    ? `<div class="views-badge">👀 ${acc.views_today} vue${acc.views_today > 1 ? "s" : ""} aujourd'hui</div>`
    : "";

  return `
    <div class="card${acc.is_flash ? " flash-card" : ""}">
      <div style="position:relative;">
        ${photo}
        ${badgesTop}
        ${priceTag}
        <button class="fav-btn" data-fav="${acc.id}" aria-label="Ajouter aux favoris">&#9825;</button>
      </div>
      <div class="perforation"></div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(acc.title)}</div>
        <div class="card-desc">${escapeHtml(acc.description || "")}</div>
        ${viewsBadge}
        <button class="btn-wa" data-buy="${acc.id}">
          ${waIcon()} Acheter via WhatsApp
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.style.display = "flex";
}

lightbox.addEventListener("click", () => {
  lightbox.style.display = "none";
  lightboxImg.src = "";
});

// --- Le coeur du flux : télécharger la photo puis ouvrir WhatsApp ---
async function handleBuyClick(acc) {
  stepOverlay.style.display = "flex";
  stepImgWrap.innerHTML = acc.photo_url
    ? `<img src="${acc.photo_url}" alt="">`
    : "";

  try {
    if (acc.photo_url) {
      if (isIOS()) {
        stepTitle.textContent = "Étape 1 sur 2";
        stepText.textContent = "La photo va s'ouvrir dans un nouvel onglet. Fais un appui long dessus et choisis \"Enregistrer l'image\", puis reviens ici.";
        stepSpinner.style.display = "none";
        window.open(acc.photo_url, "_blank");
        await wait(3500);
      } else {
        stepTitle.textContent = "Téléchargement de la photo…";
        stepText.textContent = "La photo est en cours d'enregistrement sur ton téléphone.";
        await downloadImage(acc.photo_url, acc.title);
        await wait(500);
      }
    }

    stepTitle.textContent = "Ouverture de WhatsApp…";
    stepText.textContent = "Il ne te reste plus qu'à joindre la photo depuis tes fichiers/galerie en un tap.";
    stepSpinner.style.display = "block";
    await wait(400);

    window.location.href = `/api/accounts/${acc.id}/contact`;

    setTimeout(() => { stepOverlay.style.display = "none"; }, 1500);
  } catch (err) {
    console.error(err);
    stepTitle.textContent = "Ouverture de WhatsApp…";
    stepText.textContent = "";
    stepSpinner.style.display = "none";
    window.location.href = `/api/accounts/${acc.id}/contact`;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadImage(url, title) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${slugify(title)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  } catch (err) {
    console.warn("Téléchargement direct impossible, ouverture dans un onglet.", err);
    window.open(url, "_blank");
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "compte-efootball";
}

// Enregistre une visite du site (dédupliqué côté serveur via cookie, 1 fois par jour)
fetch("/api/site-visit", { method: "POST", credentials: "include" }).catch(() => {});

// Service worker (installation en app sur mobile)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

loadBanner();
loadStats();
loadAccounts();
