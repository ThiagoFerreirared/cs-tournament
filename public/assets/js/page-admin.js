/**
 * Painel administrativo — gestão completa do torneio.
 * Fonte da verdade: Firestore (sincronização em tempo real).
 */
import { tournament } from "./config.js";
import { requireAuth, logout } from "./auth.js";
import {
  ensureDocs, watchTeams, watchSettings, watchBracket,
  isNameTaken, registerTeam, deleteTeam, setPaymentStatus,
  setRegistrationOpen, reopenRegistration, drawBracket, reportResult,
  resetTournament,
} from "./store.js";
import { bracketTreeHTML, teamAvatarHTML } from "./render.js";
import {
  initTheme, fillStaticContent, toast, escapeHtml, getInitials,
  formatDateTime, pixQrUrl,
} from "./ui.js";

const $ = (id) => document.getElementById(id);

/* ---- Estado (espelho do Firestore) ---- */
let teams = [];
let settings = { registrationOpen: true, phase: "Inscrição", champion: null };
let bracket = [];
let selectedTeamId = null;
let teamsInitialized = false;
let knownTeamIds = new Set();

/* ---- Boot ---- */
initTheme();
fillStaticContent();
window.logout = () => logout();

requireAuth(() => {
  $("admin-shell").classList.remove("hidden");
  document.getElementById("pix-qr").src = pixQrUrl(
    tournament.pix.key, tournament.registrationFee, tournament.brand
  );
  ensureDocs().catch((e) => console.warn("ensureDocs:", e));
  watchTeams(onTeams);
  watchSettings(onSettings);
  watchBracket(onBracket);
});

function onTeams(list) {
  teams = list;
  // Notificação de nova inscrição (após o carregamento inicial)
  if (teamsInitialized) {
    for (const t of teams) {
      if (!knownTeamIds.has(t.id)) {
        notify("Nova inscrição", `Time ${t.name} foi cadastrado.`);
      }
    }
  }
  knownTeamIds = new Set(teams.map((t) => t.id));
  teamsInitialized = true;
  renderDashboard();
  renderTeamsPage();
}

function onSettings(s) {
  settings = s;
  renderDashboard();
  updateRegBanner();
}

function onBracket(rounds) {
  bracket = rounds;
  renderDashboard();
  renderBracketPage();
}

/* ================================================================ *
 * Navegação
 * ================================================================ */
window.showPage = (name) => {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn,.mobile-nav-btn").forEach((b) => b.classList.remove("active"));
  $("page-" + name).classList.add("active");
  $("nav-" + name)?.classList.add("active");
  $("mnav-" + name)?.classList.add("active");
  if (name === "register") updateRegBanner();
};

/* ================================================================ *
 * Dashboard
 * ================================================================ */
function renderDashboard() {
  $("stat-teams").textContent = teams.length;

  const paid = teams.filter((t) => (t.paymentStatus || "pendente") === "confirmado").length;
  $("stat-paid").textContent = paid;
  $("stat-paid-sub").textContent =
    teams.length && paid === teams.length ? "todos confirmados" : `${teams.length - paid} pendentes`;

  $("stat-phase").textContent = settings.phase || "Inscrição";
  $("stat-matches").textContent = bracket.reduce((s, r) => s + r.matches.length, 0);
  $("stat-champion").textContent = settings.champion ? settings.champion.name : "—";

  // Banner
  const banner = $("dashboard-status-banner");
  const text = $("dashboard-status-text");
  if (settings.champion) {
    banner.className = "status-banner champion";
    text.textContent = `🏆 Campeão: ${settings.champion.name}`;
  } else if (bracket.length) {
    banner.className = "status-banner started";
    text.textContent = "⚔️ Torneio em andamento — registre os resultados";
  } else if (settings.registrationOpen === false) {
    banner.className = "status-banner closed";
    text.textContent = "🔒 Inscrições encerradas — realize o sorteio";
  } else {
    banner.className = "status-banner open";
    text.textContent = `✅ Inscrições abertas — ${teams.length} time(s) inscrito(s)`;
  }

  // Botões de administração
  const hasBracket = bracket.length > 0;
  $("btn-close-reg").classList.toggle("hidden", settings.registrationOpen === false);
  $("btn-reopen").classList.toggle("hidden", settings.registrationOpen !== false);
  $("btn-draw").disabled = hasBracket || teams.length < 2;
  $("btn-draw").textContent = hasBracket ? "Chave já gerada" : "Realizar Sorteio";

  // Lista recente
  const list = $("dashboard-teams-list");
  if (teams.length === 0) {
    list.innerHTML = `<p class="text-muted" style="padding:var(--space-4) 0">Nenhum time inscrito ainda.</p>`;
  } else {
    list.innerHTML = [...teams].slice(-5).reverse().map(teamCardHTML).join("");
  }
}

window.closeRegistration = async () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times antes de encerrar.", "warning");
  await setRegistrationOpen(false);
  toast("🔒 Inscrições encerradas. Realize o sorteio!");
};

window.reopenRegistration = async () => {
  if (bracket.length && !confirm("Reabrir inscrições vai descartar a chave atual. Confirma?")) return;
  await reopenRegistration();
  toast("🔓 Inscrições reabertas!");
};

window.resetTournament = async () => {
  if (!confirm("Resetar TUDO? Times, sorteio e resultados serão apagados.")) return;
  try {
    await resetTournament();
    toast("Torneio resetado.");
  } catch (e) {
    console.error(e);
    toast("Erro ao resetar.", "error");
  }
};

/* ================================================================ *
 * Inscrição (admin)
 * ================================================================ */
function updateRegBanner() {
  const banner = $("reg-status-banner");
  const btn = $("btn-register");
  if (!banner) return;
  if (settings.registrationOpen !== false) {
    banner.className = "status-banner open";
    banner.querySelector("span").textContent = "Inscrições abertas — cadastre seu time agora";
    if (btn) btn.disabled = false;
  } else {
    banner.className = "status-banner closed";
    banner.querySelector("span").textContent = "Inscrições encerradas.";
    if (btn) btn.disabled = true;
  }
}

window.clearRegForm = () => {
  ["team-name", "team-tag", "team-contact", "team-email", "payment-note"]
    .forEach((id) => ($(id).value = ""));
  for (let i = 1; i <= tournament.maxPlayers; i++) $("player-" + i).value = "";
  $("reg-error").classList.add("hidden");
};

window.copyPixKey = () => {
  navigator.clipboard?.writeText(tournament.pix.key)
    .then(() => toast("Chave PIX copiada!"));
};

window.registerTeam = async () => {
  const err = $("reg-error");
  err.classList.add("hidden");
  const show = (m) => { err.textContent = m; err.classList.remove("hidden"); };

  if (settings.registrationOpen === false) return show("Inscrições encerradas.");
  const name = $("team-name").value.trim();
  if (!name) return show("Nome do time é obrigatório.");
  if (teams.length >= tournament.maxTeams) return show(`Máximo de ${tournament.maxTeams} times atingido.`);

  const players = [];
  for (let i = 1; i <= tournament.maxPlayers; i++) {
    const v = $("player-" + i).value.trim();
    if (v) players.push(v);
  }
  if (players.length < tournament.minPlayers) return show(`Mínimo de ${tournament.minPlayers} jogadores.`);

  const btn = $("btn-register");
  btn.disabled = true;
  try {
    if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase()) || (await isNameTaken(name))) {
      return show("Já existe um time com este nome.");
    }
    await registerTeam({
      name,
      tag: $("team-tag").value.trim().toUpperCase() || getInitials(name),
      contact: $("team-contact").value.trim(),
      email: $("team-email").value.trim(),
      players,
      paymentNote: $("payment-note").value.trim(),
    });
    window.clearRegForm();
    toast(`✅ Time "${name}" inscrito!`);
    window.showPage("teams");
  } catch (e) {
    console.error(e);
    show("Erro ao inscrever. Tente novamente.");
  } finally {
    btn.disabled = false;
  }
};

/* ================================================================ *
 * Times
 * ================================================================ */
function teamCardHTML(t) {
  const status = t.paymentStatus || "pendente";
  const badge = status === "confirmado"
    ? '<span class="badge badge-success">PIX confirmado</span>'
    : '<span class="badge badge-warning">PIX pendente</span>';
  return `<div class="team-card" onclick="showTeamModal('${t.id}')">
    ${teamAvatarHTML(t)}
    <div class="team-info">
      <div class="team-name">${escapeHtml(t.name)}</div>
      <div class="team-meta">${(t.players || []).length} jogadores · ${badge}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--color-text-faint);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
  </div>`;
}

function renderTeamsPage() {
  $("teams-count-label").textContent = `${teams.length} time(s) cadastrado(s)`;
  const grid = $("teams-grid");
  if (teams.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <h3>Nenhum time inscrito</h3><p>Quando times se inscreverem, aparecerão aqui.</p>
      <button class="btn btn-primary" onclick="showPage('register')">Inscrever primeiro time</button>
    </div>`;
    return;
  }
  grid.innerHTML = teams.map(teamCardHTML).join("");
}

window.showTeamModal = (id) => {
  const t = teams.find((x) => x.id === id);
  if (!t) return;
  selectedTeamId = id;
  const status = t.paymentStatus || "pendente";
  $("team-modal-title").textContent = t.name;
  $("team-modal-content").innerHTML = `
    <div class="row" style="margin-bottom:var(--space-5)">
      ${teamAvatarHTML(t, { size: 56 })}
      <div>
        <div style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:700">${escapeHtml(t.name)} <span class="badge badge-neutral">${escapeHtml(t.tag || "")}</span></div>
        ${t.contact ? `<div class="team-meta">Capitão: ${escapeHtml(t.contact)}</div>` : ""}
        ${t.email ? `<div class="team-meta">Email: ${escapeHtml(t.email)}</div>` : ""}
        <div class="team-meta">Pagamento: PIX ${escapeHtml(status)} · R$ ${escapeHtml(t.paymentAmount ?? tournament.registrationFee)}</div>
        ${t.paymentNote ? `<div class="team-meta">Obs: ${escapeHtml(t.paymentNote)}</div>` : ""}
        <div class="team-meta">Inscrito em ${formatDateTime(t.createdAt ?? t.registeredAt)}</div>
      </div>
    </div>
    <div class="stat-label">Jogadores</div>
    <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2)">
      ${(t.players || []).map((p, i) => `<div class="player-chip"><span class="player-num">${i + 1}</span><span>${escapeHtml(p)}</span></div>`).join("")}
    </div>`;

  const payBtn = $("team-modal-pay");
  if (status === "confirmado") {
    payBtn.classList.add("hidden");
  } else {
    payBtn.classList.remove("hidden");
  }
  $("team-modal").classList.add("open");
};

window.closeTeamModal = () => $("team-modal").classList.remove("open");

window.confirmPaymentFromModal = async () => {
  if (!selectedTeamId) return;
  await setPaymentStatus(selectedTeamId, "confirmado");
  toast("💰 Pagamento confirmado.");
  window.closeTeamModal();
};

window.deleteTeamFromModal = async () => {
  const t = teams.find((x) => x.id === selectedTeamId);
  if (!t) return;
  if (!confirm(`Remover o time "${t.name}"?`)) return;
  if (bracket.length && !confirm("A chave já foi gerada. Remover mesmo assim?")) return;
  await deleteTeam(selectedTeamId);
  toast("Time removido.");
  window.closeTeamModal();
};

/* ================================================================ *
 * Sorteio
 * ================================================================ */
window.openDrawModal = () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times.", "warning");
  if (bracket.length) return toast("A chave já foi gerada.", "warning");
  $("draw-teams-preview").innerHTML = teams
    .map((t) => `<span class="badge badge-neutral">${escapeHtml(t.name)}</span>`).join("");
  $("draw-modal").classList.add("open");
};
window.closeDrawModal = () => $("draw-modal").classList.remove("open");

window.performDraw = async () => {
  const btn = $("btn-confirm-draw");
  btn.disabled = true;
  try {
    await drawBracket(teams);
    window.closeDrawModal();
    window.showPage("bracket");
    toast("🎰 Sorteio realizado! Chave gerada.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao sortear.", "error");
  } finally {
    btn.disabled = false;
  }
};

/* ================================================================ *
 * Chave
 * ================================================================ */
function renderBracketPage() {
  const content = $("bracket-content");
  const sub = $("bracket-subtitle");
  if (bracket.length === 0) {
    sub.textContent = "Realize o sorteio para gerar a chave";
    content.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <h3>Chave não gerada</h3><p>Encerre as inscrições e realize o sorteio.</p>
      <button class="btn btn-primary" onclick="showPage('dashboard')">Ir para Administração</button>
    </div>`;
    return;
  }
  sub.textContent = settings.champion
    ? `🏆 Campeão: ${settings.champion.name}`
    : "Clique em uma partida para registrar o resultado";

  let html = "";
  if (settings.champion) {
    html += `<div class="champion-banner"><div class="champion-crown">🏆</div><div class="champion-title">${escapeHtml(settings.champion.name)}</div><div class="champion-sub">Campeão do torneio</div></div>`;
  }
  html += bracketTreeHTML(bracket, { interactive: true });
  content.innerHTML = html;

  // Delegação de clique nas partidas jogáveis
  content.querySelectorAll(".b-match.clickable").forEach((el) => {
    el.addEventListener("click", () => {
      openScoreModal(Number(el.dataset.round), Number(el.dataset.match));
    });
  });
}

/* ---- Modal de placar ---- */
let scoreRound = null, scoreMatch = null;
function openScoreModal(ri, mi) {
  const match = bracket[ri]?.matches?.[mi];
  if (!match || match.winnerId || !match.team1 || !match.team2) return;
  scoreRound = ri; scoreMatch = mi;
  $("score-team1-name").textContent = match.team1.name;
  $("score-team2-name").textContent = match.team2.name;
  $("score-team1").value = 0;
  $("score-team2").value = 0;
  $("score-error").classList.add("hidden");
  $("score-modal").classList.add("open");
}
window.closeScoreModal = () => $("score-modal").classList.remove("open");

window.saveScore = async () => {
  const err = $("score-error");
  const s1 = parseInt($("score-team1").value, 10);
  const s2 = parseInt($("score-team2").value, 10);
  const show = (m) => { err.textContent = m; err.classList.remove("hidden"); };
  if (Number.isNaN(s1) || Number.isNaN(s2)) return show("Insira um placar válido.");
  if (s1 === s2) return show("Não pode haver empate — defina o vencedor.");
  try {
    await reportResult(bracket, scoreRound, scoreMatch, s1, s2);
    window.closeScoreModal();
    toast("✅ Resultado registrado!");
  } catch (e) {
    console.error(e);
    show(e.message || "Erro ao salvar.");
  }
};

/* ================================================================ *
 * Notificações
 * ================================================================ */
window.requestNotifications = () => {
  if (!("Notification" in window)) return toast("Navegador sem suporte a notificações.", "warning");
  Notification.requestPermission().then((p) => {
    toast(p === "granted" ? "🔔 Notificações ativadas!" : "Notificações não habilitadas.",
      p === "granted" ? "success" : "warning");
  });
};
function notify(title, body) {
  if (window.Notification?.permission === "granted") {
    const n = new Notification(title, { body, icon: "assets/img/favicon.svg" });
    setTimeout(() => n.close(), 5000);
  }
}
