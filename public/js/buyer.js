const buyerArea = document.getElementById("buyerArea");
const authModal = document.getElementById("authModal");
const accountPanel = document.getElementById("accountPanel");

let buyerLoggedIn = false;
let buyerEmail = "";

// --- État de connexion ---
async function checkBuyerSession() {
  try {
    const res = await fetch("/api/buyer/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      buyerLoggedIn = true;
      buyerEmail = data.email;
      renderBuyerArea();
      loadFavoriteIds();
    } else {
      buyerLoggedIn = false;
      renderBuyerArea();
    }
  } catch {
    buyerLoggedIn = false;
    renderBuyerArea();
  }
}

function renderBuyerArea() {
  if (buyerLoggedIn) {
    buyerArea.innerHTML = `<button class="btn-outline" id="openAccountBtn">${escapeHtml(buyerEmail)} · Mon compte</button>`;
    document.getElementById("openAccountBtn").addEventListener("click", openAccountPanel);
  } else {
    buyerArea.innerHTML = `<button class="btn-outline" id="openLoginBtn">Se connecter</button>`;
    document.getElementById("openLoginBtn").addEventListener("click", () => openAuthModal("login"));
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Modal connexion / inscription ---
function openAuthModal(tab) {
  authModal.style.display = "flex";
  switchAuthTab(tab || "login");
}
function closeAuthModal() {
  authModal.style.display = "none";
  document.getElementById("loginErr").textContent = "";
  document.getElementById("registerErr").textContent = "";
}
document.getElementById("authModalClose").addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => { if (e.target === authModal) closeAuthModal(); });

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);
  document.getElementById("loginForm").style.display = isLogin ? "block" : "none";
  document.getElementById("registerForm").style.display = isLogin ? "none" : "block";
}
document.getElementById("tabLogin").addEventListener("click", () => switchAuthTab("login"));
document.getElementById("tabRegister").addEventListener("click", () => switchAuthTab("register"));

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginErr");
  errEl.textContent = "";
  try {
    const res = await fetch("/api/buyer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = data.error || "Connexion impossible"; return; }
    closeAuthModal();
    checkBuyerSession();
  } catch {
    errEl.textContent = "Erreur réseau";
  }
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("regEmail").value;
  const phone = document.getElementById("regPhone").value;
  const password = document.getElementById("regPassword").value;
  const errEl = document.getElementById("registerErr");
  errEl.textContent = "";
  try {
    const res = await fetch("/api/buyer/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, phone, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = data.error || "Inscription impossible"; return; }
    closeAuthModal();
    checkBuyerSession();
  } catch {
    errEl.textContent = "Erreur réseau";
  }
});

// --- Panneau "Mon compte" (favoris + paramètres) ---
function openAccountPanel() {
  accountPanel.style.display = "flex";
  switchAccountTab("favorites");
  loadFavoritesList();
  loadBuyerProfile();
}
document.getElementById("accountPanelClose").addEventListener("click", () => {
  accountPanel.style.display = "none";
});
accountPanel.addEventListener("click", (e) => { if (e.target === accountPanel) accountPanel.style.display = "none"; });

function switchAccountTab(tab) {
  const isFav = tab === "favorites";
  document.getElementById("tabFavorites").classList.toggle("active", isFav);
  document.getElementById("tabSettings").classList.toggle("active", !isFav);
  document.getElementById("favoritesPane").style.display = isFav ? "block" : "none";
  document.getElementById("settingsForm").style.display = isFav ? "none" : "block";
}
document.getElementById("tabFavorites").addEventListener("click", () => switchAccountTab("favorites"));
document.getElementById("tabSettings").addEventListener("click", () => switchAccountTab("settings"));

async function loadFavoritesList() {
  const grid = document.getElementById("favoritesGrid");
  const empty = document.getElementById("favoritesEmpty");
  const res = await fetch("/api/buyer/favorites", { credentials: "include" });
  if (!res.ok) return;
  const favorites = await res.json();
  if (!favorites.length) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  renderAccountsGrid(grid, favorites);
}

async function loadFavoriteIds() {
  const res = await fetch("/api/buyer/favorites/ids", { credentials: "include" });
  if (!res.ok) return;
  const ids = await res.json();
  window.favoriteIds = new Set(ids);
  if (window.applyFavoriteStates) window.applyFavoriteStates();
}

window.handleFavoriteClick = async function (accountId, btnEl) {
  if (!buyerLoggedIn) {
    openAuthModal("login");
    return;
  }
  const isFav = window.favoriteIds.has(accountId);
  try {
    if (isFav) {
      await fetch(`/api/buyer/favorites/${accountId}`, { method: "DELETE", credentials: "include" });
      window.favoriteIds.delete(accountId);
    } else {
      await fetch(`/api/buyer/favorites/${accountId}`, { method: "POST", credentials: "include" });
      window.favoriteIds.add(accountId);
    }
    window.applyFavoriteStates();
  } catch (err) {
    console.error(err);
  }
};

// --- Paramètres (profil) ---
async function loadBuyerProfile() {
  const res = await fetch("/api/buyer/me", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("setEmail").value = data.email || "";
  document.getElementById("setPhone").value = data.phone || "";
}

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("setEmail").value;
  const phone = document.getElementById("setPhone").value;
  const password = document.getElementById("setPassword").value;
  const errEl = document.getElementById("settingsErr");
  errEl.textContent = "";

  const body = { email, phone };
  if (password) body.password = password;

  try {
    const res = await fetch("/api/buyer/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = data.error || "Erreur"; return; }
    document.getElementById("setPassword").value = "";
    buyerEmail = email;
    renderBuyerArea();
  } catch {
    errEl.textContent = "Erreur réseau";
  }
});

document.getElementById("logoutBuyerBtn").addEventListener("click", async () => {
  await fetch("/api/buyer/logout", { method: "POST", credentials: "include" });
  buyerLoggedIn = false;
  window.favoriteIds = new Set();
  accountPanel.style.display = "none";
  renderBuyerArea();
  if (window.applyFavoriteStates) window.applyFavoriteStates();
});

checkBuyerSession();
