/**
 * Painel administrativo — gestão completa do torneio.
 * Fonte da verdade: Firestore (sincronização em tempo real).
 */
import { tournament, prizeBreakdown } from "./config.js";
import { requireAuth, logout } from "./auth.js";
import {
  ensureDocs, watchTeams, watchSettings, watchBracket,
  isNameTaken, registerTeam, updateTeam, deleteTeam, setPaymentStatus,
  setRegistrationOpen, reopenRegistration, drawBracket, reportResult,
  resetTournament,
} from "./store.js";
import { bracketTreeHTML, teamAvatarHTML, teamsSkeleton } from "./render.js";
import {
  initTheme, fillStaticContent, toast, escapeHtml, getInitials,
  formatDateTime, formatBRL, pixQrUrl, downloadCSV,
} from "./ui.js";
import { initAnalytics } from "./analytics.js";

const $ = (id) => document.getElementById(id);

/* ---- Estado (espelho do Firestore) ---- */
let teams = [];
let settings = { registrationOpen: true, phase: "Inscrição", champion: null };
let bracket = { rounds: [] };
let selectedTeamId = null;
let teamsInitialized = false;
let knownTeamIds = new Set();

/* ---- Boot ---- */
initTheme();
initAnalytics();
fillStaticContent();
window.logout = () => logout();

requireAuth(() => {
  $("admin-shell").classList.remove("hidden");
  $("pix-qr").src = pixQrUrl(tournament.pix.key, tournament.registrationFee, tournament.brand);
  $("teams-grid").innerHTML = teamsSkeleton(6);
  ensureDocs().catch((e) => console.warn("ensureDocs:", e));
  watchTeams(onTeams);
  watchSettings(onSettings);
  watchBracket(onBracket);
});

function onTeams(list) {
  teams = list;
  if (teamsInitialized) {
    for (const t of teams) {
      if (!knownTeamIds.has(t.id)) notify("Nova inscrição", `Time ${t.name} foi cadastrado.`);
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
function onBracket(data) {
  bracket = data;
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
  const fee = tournament.registrationFee;
  const paid = teams.filter((t) => (t.paymentStatus || "pendente") === "confirmado").length;
  const pending = teams.length - paid;

  $("stat-teams").textContent = teams.length;
  $("stat-paid").textContent = paid;
  $("stat-paid-sub").textContent =
    teams.length && paid === teams.length ? "todos confirmados" : `${pending} pendentes`;
  $("stat-phase").textContent = settings.phase || "Inscrição";
  $("stat-matches").textContent = (bracket.rounds || []).reduce((s, r) => s + r.matches.length, 0);
  $("stat-champion").textContent = settings.champion ? settings.champion.name : "—";

  // Resumo financeiro
  $("fin-arrecadado").textContent = formatBRL(paid * fee);
  $("fin-pendente").textContent = formatBRL(pending * fee);
  $("fin-potencial").textContent = formatBRL(teams.length * fee);

  // Premiação (bolão) = nº de times × taxa
  const prize = prizeBreakdown(teams.length);
  $("prize-pool-badge").textContent = formatBRL(prize.pool);
  $("prize-1st").textContent = formatBRL(prize.places[0]?.amount || 0);
  $("prize-2nd").textContent = formatBRL(prize.places[1]?.amount || 0);

  // Banner
  const banner = $("dashboard-status-banner");
  const text = $("dashboard-status-text");
  const hasBracket = (bracket.rounds || []).length > 0;
  if (settings.champion) {
    banner.className = "status-banner champion";
    text.textContent = `🏆 Campeão: ${settings.champion.name}`;
  } else if (hasBracket) {
    banner.className = "status-banner started";
    text.textContent = "⚔️ Torneio em andamento — registre os resultados";
  } else if (settings.registrationOpen === false) {
    banner.className = "status-banner closed";
    text.textContent = "🔒 Inscrições encerradas — realize o sorteio";
  } else {
    banner.className = "status-banner open";
    text.textContent = `✅ Inscrições abertas — ${teams.length} time(s) inscrito(s)`;
  }

  // Botões
  $("btn-close-reg").classList.toggle("hidden", settings.registrationOpen === false);
  $("btn-reopen").classList.toggle("hidden", settings.registrationOpen !== false);
  $("btn-draw").disabled = hasBracket || teams.length < 2;
  $("btn-draw").textContent = hasBracket ? "Chave já gerada" : "Realizar Sorteio";

  // Recentes
  const list = $("dashboard-teams-list");
  list.innerHTML = teams.length === 0
    ? `<p class="text-muted" style="padding:var(--space-4) 0">Nenhum time inscrito ainda.</p>`
    : [...teams].slice(-5).reverse().map(teamCardHTML).join("");
}

window.closeRegistration = async () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times antes de encerrar.", "warning");
  await setRegistrationOpen(false);
  toast("🔒 Inscrições encerradas. Realize o sorteio!");
};
window.reopenRegistration = async () => {
  if (bracket.rounds.length && !confirm("Reabrir inscrições vai descartar a chave atual. Confirma?")) return;
  await reopenRegistration();
  toast("🔓 Inscrições reabertas!");
};
window.resetTournament = async () => {
  if (!confirm("Resetar TUDO? Times, sorteio e resultados serão apagados.")) return;
  try { await resetTournament(); toast("Torneio resetado."); }
  catch (e) { console.error(e); toast("Erro ao resetar.", "error"); }
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
  ["team-name", "team-tag", "team-contact", "team-email", "payment-note"].forEach((id) => ($(id).value = ""));
  for (let i = 1; i <= tournament.maxPlayers; i++) $("player-" + i).value = "";
  $("reg-error").classList.add("hidden");
};
window.copyPixKey = () => {
  navigator.clipboard?.writeText(tournament.pix.key).then(() => toast("Chave PIX copiada!"));
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
  $("btn-export-csv").disabled = teams.length === 0;
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

window.exportCSV = () => {
  if (teams.length === 0) return;
  const header = ["Nome", "TAG", "Contato", "Email", "Pagamento", "Valor", "Jogadores", "Inscrito em"];
  const rows = teams.map((t) => [
    t.name, t.tag || "", t.contact || "", t.email || "",
    t.paymentStatus || "pendente", t.paymentAmount ?? tournament.registrationFee,
    (t.players || []).join(" | "), formatDateTime(t.createdAt ?? t.registeredAt),
  ]);
  downloadCSV(`times-${tournament.brand.toLowerCase().replace(/\s+/g, "-")}.csv`, [header, ...rows]);
  toast("📄 CSV exportado.");
};

/* ---- Modal de time ---- */
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
  $("team-modal-pay").classList.toggle("hidden", status === "confirmado");
  $("team-modal-edit").classList.remove("hidden");
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
  if (bracket.rounds.length && !confirm("A chave já foi gerada. Remover mesmo assim?")) return;
  await deleteTeam(selectedTeamId);
  toast("Time removido.");
  window.closeTeamModal();
};

/* ---- Edição de time ---- */
window.editTeam = () => {
  const t = teams.find((x) => x.id === selectedTeamId);
  if (!t) return;
  const playerInputs = Array.from({ length: tournament.maxPlayers }, (_, i) =>
    `<input class="form-input" id="edit-player-${i + 1}" value="${escapeHtml(t.players?.[i] || "")}" placeholder="Jogador ${i + 1}" style="margin-bottom:6px">`
  ).join("");
  $("team-modal-title").textContent = `Editar ${t.name}`;
  $("team-modal-content").innerHTML = `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nome *</label><input class="form-input" id="edit-name" value="${escapeHtml(t.name)}" maxlength="32"></div>
      <div class="form-group"><label class="form-label">TAG</label><input class="form-input" id="edit-tag" value="${escapeHtml(t.tag || "")}" maxlength="5" style="text-transform:uppercase"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Contato</label><input class="form-input" id="edit-contact" value="${escapeHtml(t.contact || "")}"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="edit-email" value="${escapeHtml(t.email || "")}"></div>
    </div>
    <div class="form-group"><label class="form-label">Jogadores (mín. ${tournament.minPlayers})</label>${playerInputs}</div>
    <div id="edit-error" class="form-error hidden"></div>`;
  $("team-modal-edit").classList.add("hidden");
  $("team-modal-pay").classList.add("hidden");
  $("team-modal-save").classList.remove("hidden");
};

window.saveTeamEdit = async () => {
  const err = $("edit-error");
  const show = (m) => { err.textContent = m; err.classList.remove("hidden"); };
  const name = $("edit-name").value.trim();
  if (!name) return show("Nome é obrigatório.");
  const players = [];
  for (let i = 1; i <= tournament.maxPlayers; i++) {
    const v = $("edit-player-" + i).value.trim();
    if (v) players.push(v);
  }
  if (players.length < tournament.minPlayers) return show(`Mínimo de ${tournament.minPlayers} jogadores.`);
  try {
    await updateTeam(selectedTeamId, {
      name,
      tag: $("edit-tag").value.trim().toUpperCase() || getInitials(name),
      contact: $("edit-contact").value.trim(),
      email: $("edit-email").value.trim(),
      players,
    });
    toast("✅ Time atualizado.");
    $("team-modal-save").classList.add("hidden");
    window.closeTeamModal();
  } catch (e) {
    console.error(e);
    show("Erro ao salvar.");
  }
};

/* ================================================================ *
 * Sorteio (com modo manual e animação)
 * ================================================================ */
let drawMode = "random";
let drawOrder = [];

window.openDrawModal = () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times.", "warning");
  if (bracket.rounds.length) return toast("A chave já foi gerada.", "warning");
  drawMode = "random";
  drawOrder = [...teams];
  renderDrawPreview();
  setDrawModeUI();
  $("draw-modal").classList.add("open");
};
window.closeDrawModal = () => $("draw-modal").classList.remove("open");

window.setDrawMode = (mode) => {
  drawMode = mode;
  setDrawModeUI();
  renderDrawPreview();
};
function setDrawModeUI() {
  $("draw-mode-random").classList.toggle("active", drawMode === "random");
  $("draw-mode-manual").classList.toggle("active", drawMode === "manual");
  $("draw-hint").textContent = drawMode === "random"
    ? "Os times serão distribuídos aleatoriamente na chave."
    : "Defina a ordem dos confrontos (1×2, 3×4, ...). Use as setas para reordenar.";
  $("btn-confirm-draw").textContent = drawMode === "random" ? "Sortear Agora" : "Gerar Chave";
}
function renderDrawPreview() {
  const el = $("draw-teams-preview");
  if (drawMode === "random") {
    el.innerHTML = teams.map((t) => `<span class="badge badge-neutral">${escapeHtml(t.name)}</span>`).join("");
  } else {
    el.innerHTML = drawOrder.map((t, i) => `
      <div class="seed-row">
        <span class="seed-num">${i + 1}</span>
        <span class="seed-name">${escapeHtml(t.name)}</span>
        <span class="seed-actions">
          <button class="btn btn-ghost btn-sm" onclick="moveSeed('${t.id}',-1)" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn btn-ghost btn-sm" onclick="moveSeed('${t.id}',1)" ${i === drawOrder.length - 1 ? "disabled" : ""}>↓</button>
        </span>
      </div>`).join("");
  }
}
window.moveSeed = (id, dir) => {
  const i = drawOrder.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= drawOrder.length) return;
  [drawOrder[i], drawOrder[j]] = [drawOrder[j], drawOrder[i]];
  renderDrawPreview();
};

window.performDraw = async () => {
  const btn = $("btn-confirm-draw");
  btn.disabled = true;
  try {
    if (drawMode === "random") await animateShuffle($("draw-teams-preview"));
    await drawBracket(drawMode === "manual" ? drawOrder : teams, { random: drawMode === "random" });
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
function animateShuffle(el) {
  return new Promise((resolve) => {
    let n = 0;
    const iv = setInterval(() => {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      el.innerHTML = shuffled.map((t) => `<span class="badge badge-neutral">${escapeHtml(t.name)}</span>`).join("");
      if (++n >= 14) { clearInterval(iv); resolve(); }
    }, 55);
  });
}

/* ================================================================ *
 * Chave
 * ================================================================ */
function renderBracketPage() {
  const content = $("bracket-content");
  const sub = $("bracket-subtitle");
  if (bracket.rounds.length === 0) {
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
  html += bracketTreeHTML(bracket.rounds, { interactive: true });
  content.innerHTML = html;

  content.querySelectorAll(".b-match.clickable").forEach((el) => {
    el.addEventListener("click", () =>
      openScoreModal(Number(el.dataset.round), Number(el.dataset.match)));
  });
}

/* ---- Modal de placar ---- */
let scoreRound = null, scoreMatch = null;
function openScoreModal(ri, mi) {
  const match = bracket.rounds[ri]?.matches?.[mi];
  if (!match || match.winnerId || !match.team1 || !match.team2) return;
  scoreRound = ri; scoreMatch = mi;
  $("score-modal-title").textContent = "Registrar Resultado";
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
    await reportResult(bracket.rounds, scoreRound, scoreMatch, s1, s2);
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
  Notification.requestPermission().then((p) =>
    toast(p === "granted" ? "🔔 Notificações ativadas!" : "Notificações não habilitadas.",
      p === "granted" ? "success" : "warning"));
};
function notify(title, body) {
  if (window.Notification?.permission === "granted") {
    const n = new Notification(title, { body, icon: "assets/img/icon-192.png" });
    setTimeout(() => n.close(), 5000);
  }
}
