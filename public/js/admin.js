const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const codeInput = document.getElementById("codeInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const form = document.getElementById("accountForm");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const editIdInput = document.getElementById("editId");
const adminList = document.getElementById("adminList");
const toast = document.getElementById("toast");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

async function checkSession() {
  try {
    const res = await fetch("/api/admin/check", { credentials: "include" });
    if (res.ok) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginScreen.style.display = "block";
  dashboard.style.display = "none";
}

function showDashboard() {
  loginScreen.style.display = "none";
  dashboard.style.display = "block";
  loadAdminAccounts();
  loadBanner();
}

let bannerImageRemoved = false;
let countdownRemoved = false;

// Convertit une date ISO (UTC) en valeur affichable dans un input datetime-local (heure locale)
function isoToLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadBanner() {
  const res = await fetch("/api/admin/settings", { credentials: "include" });
  if (!res.ok) return;
  const settings = await res.json();
  document.getElementById("bannerText").value = settings.banner_text || "";
  document.getElementById("bannerActive").checked = !!settings.banner_active;
  document.getElementById("whatsappNumber").value = settings.whatsapp_number || "";
  document.getElementById("bannerEndTime").value = isoToLocalInputValue(settings.banner_end_time);
  bannerImageRemoved = false;
  countdownRemoved = false;

  const previewWrap = document.getElementById("bannerPreviewWrap");
  const preview = document.getElementById("bannerPreview");
  if (settings.banner_image_url) {
    preview.src = settings.banner_image_url;
    previewWrap.style.display = "block";
  } else {
    previewWrap.style.display = "none";
  }
}

document.getElementById("removeCountdownBtn").addEventListener("click", () => {
  document.getElementById("bannerEndTime").value = "";
  countdownRemoved = true;
});

document.getElementById("saveWhatsappBtn").addEventListener("click", async () => {
  const whatsapp_number = document.getElementById("whatsappNumber").value.trim();
  if (!whatsapp_number) { showToast("Entre un numéro"); return; }
  const fd = new FormData();
  fd.append("whatsapp_number", whatsapp_number);
  // On renvoie aussi les valeurs actuelles de la bannière pour ne pas les écraser
  fd.append("banner_text", document.getElementById("bannerText").value);
  fd.append("banner_active", document.getElementById("bannerActive").checked);

  const res = await fetch("/api/admin/settings", { method: "PUT", credentials: "include", body: fd });
  if (res.ok) {
    showToast("Numéro WhatsApp mis à jour");
  } else {
    showToast("Erreur lors de l'enregistrement");
  }
});

document.getElementById("bannerImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  bannerImageRemoved = false;
  const preview = document.getElementById("bannerPreview");
  preview.src = URL.createObjectURL(file);
  document.getElementById("bannerPreviewWrap").style.display = "block";
});

document.getElementById("removeBannerImageBtn").addEventListener("click", () => {
  bannerImageRemoved = true;
  document.getElementById("bannerImage").value = "";
  document.getElementById("bannerPreviewWrap").style.display = "none";
});

document.getElementById("saveBannerBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("banner_text", document.getElementById("bannerText").value);
  fd.append("banner_active", document.getElementById("bannerActive").checked);
  const file = document.getElementById("bannerImage").files[0];
  if (file) fd.append("banner_image", file);
  if (bannerImageRemoved) fd.append("remove_banner_image", "true");

  const endTimeLocal = document.getElementById("bannerEndTime").value;
  if (endTimeLocal) {
    fd.append("banner_end_time", new Date(endTimeLocal).toISOString());
  } else if (countdownRemoved) {
    fd.append("remove_banner_end_time", "true");
  }

  const res = await fetch("/api/admin/settings", {
    method: "PUT",
    credentials: "include",
    body: fd,
  });
  if (res.ok) {
    showToast("Bannière mise à jour");
    loadBanner();
  } else {
    showToast("Erreur lors de l'enregistrement de la bannière");
  }
});

loginBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  const code = codeInput.value;
  if (!code) return;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      loginError.textContent = "Code incorrect.";
      return;
    }
    codeInput.value = "";
    showDashboard();
  } catch (err) {
    loginError.textContent = "Erreur de connexion au serveur.";
  }
});

codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
  showLogin();
});

async function loadAdminAccounts() {
  const res = await fetch("/api/admin/accounts", { credentials: "include" });
  if (res.status === 401) return showLogin();
  const accounts = await res.json();
  renderAdminList(accounts);
}

function renderAdminList(accounts) {
  if (!accounts.length) {
    adminList.innerHTML = `<p style="color:var(--chalk-dim);font-size:14px;">Aucun compte pour l'instant.</p>`;
    return;
  }
  adminList.innerHTML = accounts.map((acc) => `
    <div class="admin-item">
      ${acc.photo_url ? `<img src="${acc.photo_url}" alt="">` : `<div style="width:72px;height:72px;background:var(--pitch-green-light);border-radius:8px;"></div>`}
      <div class="info">
        <h3>${escapeHtml(acc.title)}</h3>
        <div class="meta">${new Intl.NumberFormat("fr-FR").format(acc.price)} FCFA · ${escapeHtml(acc.phone_number)} ${acc.is_flash ? "· 🔥 Flash" : ""}</div>
      </div>
      <div class="actions">
        <button data-edit="${acc.id}">Modifier</button>
        <button class="danger" data-delete="${acc.id}">Supprimer</button>
      </div>
    </div>
  `).join("");

  accounts.forEach((acc) => {
    document.querySelector(`[data-edit="${acc.id}"]`).addEventListener("click", () => startEdit(acc));
    document.querySelector(`[data-delete="${acc.id}"]`).addEventListener("click", () => deleteAccount(acc.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function startEdit(acc) {
  editIdInput.value = acc.id;
  document.getElementById("title").value = acc.title;
  document.getElementById("price").value = acc.price;
  document.getElementById("description").value = acc.description || "";
  document.getElementById("phone").value = acc.phone_number;
  document.getElementById("isFlash").checked = !!acc.is_flash;
  formTitle.textContent = "Modifier le compte";
  submitBtn.textContent = "Enregistrer les modifications";
  cancelEditBtn.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

cancelEditBtn.addEventListener("click", resetForm);

function resetForm() {
  form.reset();
  editIdInput.value = "";
  formTitle.textContent = "Ajouter un compte";
  submitBtn.textContent = "Ajouter le compte";
  cancelEditBtn.style.display = "none";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editIdInput.value;
  const fd = new FormData();
  fd.append("title", document.getElementById("title").value);
  fd.append("price", document.getElementById("price").value);
  fd.append("description", document.getElementById("description").value);
  fd.append("phone_number", document.getElementById("phone").value);
  fd.append("is_flash", document.getElementById("isFlash").checked);
  const photoFile = document.getElementById("photo").files[0];
  if (photoFile) fd.append("photo", photoFile);

  submitBtn.disabled = true;
  try {
    const url = id ? `/api/admin/accounts/${id}` : "/api/admin/accounts";
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", body: fd });
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Erreur lors de l'enregistrement");
      return;
    }
    showToast(id ? "Compte modifié" : "Compte ajouté");
    resetForm();
    loadAdminAccounts();
  } catch (err) {
    showToast("Erreur réseau");
  } finally {
    submitBtn.disabled = false;
  }
});

async function deleteAccount(id) {
  if (!confirm("Supprimer définitivement ce compte du catalogue ?")) return;
  const res = await fetch(`/api/admin/accounts/${id}`, { method: "DELETE", credentials: "include" });
  if (res.status === 401) return showLogin();
  if (res.ok) {
    showToast("Compte supprimé");
    loadAdminAccounts();
  } else {
    showToast("Erreur lors de la suppression");
  }
}

checkSession();
