const buyerArea = document.getElementById("buyerArea");
const authModal = document.getElementById("authModal");
const accountPanel = document.getElementById("accountPanel");

let buyerLoggedIn = false;
let buyerEmail = "";
let buyerAvatarUrl = "";

// --- État de connexion ---
async function checkBuyerSession() {
  try {
    const res = await fetch("/api/buyer/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      buyerLoggedIn = true;
      buyerEmail = data.email;
      buyerAvatarUrl = data.avatar_url || "";
      renderBuyerArea();
      loadFavoriteIds();
      loadUnreadCount();
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
    const avatar = buyerAvatarUrl
      ? `<img src="${buyerAvatarUrl}" class="mini-avatar" alt="">`
      : `<span class="mini-avatar mini-avatar-placeholder">👤</span>`;
    buyerArea.innerHTML = `<button class="btn-outline buyer-btn" id="openAccountBtn">${avatar}${escapeHtml(buyerEmail)} <span id="miniNotifBadge" class="notif-badge" style="display:none;"></span></button>`;
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
    showWelcomeModal();
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

// --- Panneau "Mon compte" (favoris + notifications + sécurité + paramètres) ---
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
  document.getElementById("tabFavorites").classList.toggle("active", tab === "favorites");
  document.getElementById("tabNotifications").classList.toggle("active", tab === "notifications");
  document.getElementById("tabSecurity").classList.toggle("active", tab === "security");
  document.getElementById("tabSettings").classList.toggle("active", tab === "settings");

  document.getElementById("favoritesPane").style.display = tab === "favorites" ? "block" : "none";
  document.getElementById("notificationsPane").style.display = tab === "notifications" ? "block" : "none";
  document.getElementById("securityPane").style.display = tab === "security" ? "block" : "none";
  document.getElementById("settingsForm").style.display = tab === "settings" ? "block" : "none";

  if (tab === "notifications") { loadNotifications(); }
  if (tab === "security") { loadSessions(); }
}
document.getElementById("tabFavorites").addEventListener("click", () => switchAccountTab("favorites"));
document.getElementById("tabNotifications").addEventListener("click", () => switchAccountTab("notifications"));
document.getElementById("tabSecurity").addEventListener("click", () => switchAccountTab("security"));
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

// --- Notifications ---
async function loadUnreadCount() {
  const res = await fetch("/api/buyer/notifications/unread-count", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  const badges = [document.getElementById("notifBadge"), document.getElementById("miniNotifBadge")];
  badges.forEach((b) => {
    if (!b) return;
    if (data.count > 0) {
      b.textContent = data.count;
      b.style.display = "inline-block";
    } else {
      b.style.display = "none";
    }
  });
}

async function loadNotifications() {
  const res = await fetch("/api/buyer/notifications", { credentials: "include" });
  if (!res.ok) return;
  const notifications = await res.json();
  const list = document.getElementById("notificationsList");
  const empty = document.getElementById("notificationsEmpty");

  if (!notifications.length) {
    list.innerHTML = "";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    list.innerHTML = notifications.map((n) => `
      <div class="notif-item ${n.is_read ? "" : "unread"}">
        <p>${escapeHtml(n.message)}</p>
        <span class="notif-date">${new Date(n.created_at).toLocaleDateString("fr-FR")}</span>
      </div>
    `).join("");
  }

  await fetch("/api/buyer/notifications/read-all", { method: "POST", credentials: "include" });
  loadUnreadCount();
}

// --- Sécurité (appareils connectés) ---
function parseDevice(userAgent) {
  if (!userAgent) return "Appareil inconnu";
  if (/iPhone/.test(userAgent)) return "iPhone (Safari)";
  if (/iPad/.test(userAgent)) return "iPad (Safari)";
  if (/Android/.test(userAgent)) return "Téléphone Android";
  if (/Windows/.test(userAgent)) return "Ordinateur Windows";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Linux/.test(userAgent)) return "Ordinateur Linux";
  return "Appareil inconnu";
}

async function loadSessions() {
  const res = await fetch("/api/buyer/sessions", { credentials: "include" });
  if (!res.ok) return;
  const sessions = await res.json();
  const list = document.getElementById("sessionsList");
  list.innerHTML = sessions.map((s) => `
    <div class="session-item">
      <span>${parseDevice(s.user_agent)}</span>
      <span class="session-date">${new Date(s.created_at).toLocaleString("fr-FR")}</span>
    </div>
  `).join("") || `<p style="color:var(--chalk-dim);font-size:13px;">Aucune connexion enregistrée.</p>`;
}

document.getElementById("revokeAllBtn").addEventListener("click", async () => {
  if (!confirm("Déconnecter tous les appareils connectés à ton compte (y compris celui-ci, tu resteras connecté ici) ?")) return;
  await fetch("/api/buyer/sessions/revoke-all", { method: "POST", credentials: "include" });
  showBuyerToast("Tous les appareils ont été déconnectés");
  loadSessions();
});

// --- Paramètres (profil + avatar) ---
async function loadBuyerProfile() {
  const res = await fetch("/api/buyer/me", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("setEmail").value = data.email || "";
  document.getElementById("setPhone").value = data.phone || "";

  const preview = document.getElementById("avatarPreview");
  const placeholder = document.getElementById("avatarPlaceholder");
  if (data.avatar_url) {
    preview.src = data.avatar_url;
    preview.style.display = "block";
    placeholder.style.display = "none";
  } else {
    preview.style.display = "none";
    placeholder.style.display = "flex";
  }
}

document.getElementById("setAvatar").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById("avatarPreview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  document.getElementById("avatarPlaceholder").style.display = "none";
});

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("settingsErr");
  errEl.textContent = "";

  const fd = new FormData();
  fd.append("email", document.getElementById("setEmail").value);
  fd.append("phone", document.getElementById("setPhone").value);
  const password = document.getElementById("setPassword").value;
  if (password) fd.append("password", password);
  const avatarFile = document.getElementById("setAvatar").files[0];
  if (avatarFile) fd.append("avatar", avatarFile);

  try {
    const res = await fetch("/api/buyer/me", { method: "PUT", credentials: "include", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { errEl.textContent = data.error || "Erreur"; return; }
    document.getElementById("setPassword").value = "";
    checkBuyerSession();
    showBuyerToast("Paramètres enregistrés");
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

function showBuyerToast(msg) {
  let toast = document.getElementById("buyerToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "buyerToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

checkBuyerSession();
