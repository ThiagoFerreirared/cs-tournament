/**
 * Painel administrativo — gestão do torneio (liga de pontos + final).
 * Fonte da verdade: Firestore (sincronização em tempo real).
 */
import { tournament, prizeBreakdown, mapPool } from "./config.js";
import { requireAuth, logout } from "./auth.js";
import {
  ensureDocs, watchTeams, watchSettings, watchLeague,
  isNameTaken, registerTeam, updateTeam, deleteTeam, setPaymentStatus,
  setRegistrationOpen, reopenRegistration, generateLeague,
  saveMap as apiSaveMap, removeMap as apiRemoveMap,
  setSchedule as apiSetSchedule, setWalkover as apiSetWalkover,
  renameLeaguePlayers as apiRenameLeaguePlayers,
  resetTournament,
} from "./store.js";
import { standings, matchesByRound, playerRanking } from "./league.js";
import { standingsHTML, matchesHTML, finalHTML, playerRankingHTML, teamAvatarHTML, teamsSkeleton } from "./render.js";
import {
  initTheme, fillStaticContent, toast, escapeHtml, getInitials,
  formatDateTime, formatBRL, pixQrUrl, downloadCSV,
} from "./ui.js";
import { initAnalytics } from "./analytics.js";

const $ = (id) => document.getElementById(id);

/* ---- Estado ---- */
let teams = [];
let settings = { registrationOpen: true, phase: "Inscrição", champion: null };
let league = { matches: [], final: null };
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
  watchLeague(onLeague);
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
  renderLeaguePage();
}
function onSettings(s) {
  settings = s;
  renderDashboard();
  updateRegBanner();
  renderLeaguePage();
}
function onLeague(data) {
  league = data;
  renderDashboard();
  renderLeaguePage();
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
  $("stat-matches").textContent = league.matches.length;
  $("stat-champion").textContent = settings.champion ? settings.champion.name : "—";

  // Resumo financeiro
  $("fin-arrecadado").textContent = formatBRL(paid * fee);
  $("fin-pendente").textContent = formatBRL(pending * fee);
  $("fin-potencial").textContent = formatBRL(teams.length * fee);

  // Premiação (vencedor leva tudo)
  const { pool } = prizeBreakdown(teams.length);
  $("prize-pool-badge").textContent = formatBRL(pool);
  $("prize-champion").textContent = formatBRL(pool);

  // Banner
  const banner = $("dashboard-status-banner");
  const text = $("dashboard-status-text");
  const hasLeague = league.matches.length > 0;
  if (settings.champion) {
    banner.className = "status-banner champion";
    text.textContent = `🏆 Campeão: ${settings.champion.name}`;
  } else if (hasLeague) {
    banner.className = "status-banner started";
    text.textContent = "⚔️ Torneio em andamento — registre os placares";
  } else if (settings.registrationOpen === false) {
    banner.className = "status-banner closed";
    text.textContent = "🔒 Inscrições encerradas — gere a tabela de jogos";
  } else {
    banner.className = "status-banner open";
    text.textContent = `✅ Inscrições abertas — ${teams.length} time(s) inscrito(s)`;
  }

  // Botões
  $("btn-close-reg").classList.toggle("hidden", settings.registrationOpen === false);
  $("btn-reopen").classList.toggle("hidden", settings.registrationOpen !== false);
  $("btn-draw").disabled = hasLeague || teams.length < 2;
  $("btn-draw").textContent = hasLeague ? "Tabela já gerada" : "Gerar Tabela";

  // Recentes
  $("dashboard-teams-list").innerHTML = teams.length === 0
    ? `<p class="text-muted" style="padding:var(--space-4) 0">Nenhum time inscrito ainda.</p>`
    : [...teams].slice(-5).reverse().map(teamCardHTML).join("");
}

window.closeRegistration = async () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times antes de encerrar.", "warning");
  await setRegistrationOpen(false);
  toast("🔒 Inscrições encerradas. Gere a tabela!");
};
window.reopenRegistration = async () => {
  if (league.matches.length && !confirm("Reabrir inscrições vai descartar a tabela atual. Confirma?")) return;
  await reopenRegistration();
  toast("🔓 Inscrições reabertas!");
};
window.resetTournament = async () => {
  if (!confirm("Resetar TUDO? Times, tabela e resultados serão apagados.")) return;
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
  $("team-modal-save").classList.add("hidden");
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
  if (league.matches.length && !confirm("A tabela já foi gerada. Remover mesmo assim?")) return;
  await deleteTeam(selectedTeamId);
  toast("Time removido.");
  window.closeTeamModal();
};

/* ---- Edição de time ---- */
window.editTeam = () => {
  const t = teams.find((x) => x.id === selectedTeamId);
  if (!t) return;
  const playerInputs = Array.from({ length: tournament.maxPlayers }, (_, i) =>
    `<div class="player-row"><span class="player-num">${i + 1}</span><input class="form-input" id="edit-player-${i + 1}" value="${escapeHtml(t.players?.[i] || "")}" placeholder="Jogador ${i + 1}"></div>`
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
    <div class="form-group">
      <label class="form-label">Jogadores (mín. ${tournament.minPlayers})</label>
      ${playerInputs}
      <div class="form-hint">K/D/A é lançado por mapa, na aba Tabela.</div>
    </div>
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

  // Compara por posição (índice fixo) para detectar renomeações sem confundir
  // com remoções/adições. renameMap propaga os novos nicks para os mapas.
  const current = teams.find((x) => x.id === selectedTeamId);
  const oldPlayers = current?.players || [];
  const renameMap = {};
  const players = [];
  for (let i = 1; i <= tournament.maxPlayers; i++) {
    const oldNick = (oldPlayers[i - 1] || "").trim();
    const newNick = $("edit-player-" + i).value.trim();
    if (oldNick && newNick && oldNick !== newNick) renameMap[oldNick] = newNick;
    if (newNick) players.push(newNick);
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
    if (Object.keys(renameMap).length) {
      await apiRenameLeaguePlayers(league, selectedTeamId, renameMap);
    }
    toast("✅ Time atualizado.");
    window.closeTeamModal();
  } catch (e) {
    console.error(e);
    show("Erro ao salvar.");
  }
};

/* ================================================================ *
 * Gerar tabela
 * ================================================================ */
window.openDrawModal = () => {
  if (teams.length < 2) return toast("Inscreva ao menos 2 times.", "warning");
  if (league.matches.length) return toast("A tabela já foi gerada.", "warning");
  $("draw-teams-preview").innerHTML = teams
    .map((t) => `<span class="badge badge-neutral">${escapeHtml(t.name)}</span>`).join("");
  $("draw-modal").classList.add("open");
};
window.closeDrawModal = () => $("draw-modal").classList.remove("open");

window.performDraw = async () => {
  const btn = $("btn-confirm-draw");
  btn.disabled = true;
  try {
    await animateShuffle($("draw-teams-preview"));
    await generateLeague(teams);
    window.closeDrawModal();
    window.showPage("bracket");
    toast("📋 Tabela gerada! Bom torneio.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao gerar a tabela.", "error");
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
      if (++n >= 12) { clearInterval(iv); resolve(); }
    }, 55);
  });
}

/* ================================================================ *
 * Tabela / classificação / final
 * ================================================================ */
function renderLeaguePage() {
  const content = $("bracket-content");
  const sub = $("bracket-subtitle");
  if (!content) return;

  if (league.matches.length === 0) {
    sub.textContent = "Gere a tabela para começar";
    content.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <h3>Tabela não gerada</h3><p>Encerre as inscrições e gere a tabela de jogos.</p>
      <button class="btn btn-primary" onclick="showPage('dashboard')">Ir para Administração</button>
    </div>`;
    return;
  }

  sub.textContent = settings.champion
    ? `🏆 Campeão: ${settings.champion.name}`
    : "Clique numa partida para registrar o placar";

  let html = "";
  if (settings.champion) {
    html += `<div class="champion-banner"><div class="champion-crown">🏆</div><div class="champion-title">${escapeHtml(settings.champion.name)}</div><div class="champion-sub">Campeão · leva a premiação inteira</div></div>`;
  }
  const rows = standings(teams, league.matches, tournament.pointsPerWin);
  const players = playerRanking(teams, league);
  html += `<h3 class="block-title">📊 Classificação</h3>` + standingsHTML(rows);
  if (players.length) {
    html += `<div class="row" style="justify-content:space-between;margin-top:var(--space-8)"><h3 class="block-title" style="margin:0">🎯 Ranking de Jogadores</h3><span class="form-hint">Somado dos mapas de cada jogo (K/D/A por mapa)</span></div>`;
    html += playerRankingHTML(players);
  }
  html += finalHTML(league.final, { interactive: true });
  html += `<h3 class="block-title" style="margin-top:var(--space-8)">🎮 Jogos · Fase de pontos (MD${tournament.bestOf.round}) <span class="form-hint" style="font-weight:400">— "+ adicionar mapa" lança · clique num mapa para editar</span></h3>`;
  html += matchesHTML(matchesByRound(league.matches), { interactive: true });
  content.innerHTML = html;

  content.querySelectorAll(".map-line.clickable").forEach((el) => {
    el.addEventListener("click", () => openMapModal(el.dataset.stage, el.dataset.match, el.dataset.map));
  });
  content.querySelectorAll(".map-add").forEach((el) => {
    el.addEventListener("click", () => openMapModal(el.dataset.stage, el.dataset.match, null));
  });
  content.querySelectorAll(".match-opt").forEach((el) => {
    el.addEventListener("click", () => openMatchModal(el.dataset.stage, el.dataset.match));
  });
}

/* ---- Modal de mapa (placar de rounds + K/D/A por jogador dos 2 times) ---- */
let mapTarget = null;

function statTableHTML(teamName, side, nicks, stats) {
  const rows = nicks.map((nick, i) => {
    const s = stats[i] || {};
    return `<div class="stat-edit-row">
      <input class="form-input" id="map-${side}-nick-${i}" value="${escapeHtml(nick)}" placeholder="Jogador ${i + 1}">
      <input class="form-input stat-num" id="map-${side}-k-${i}" type="number" min="0" value="${escapeHtml(s.k ?? 0)}" aria-label="Kills">
      <input class="form-input stat-num" id="map-${side}-d-${i}" type="number" min="0" value="${escapeHtml(s.d ?? 0)}" aria-label="Mortes">
      <input class="form-input stat-num" id="map-${side}-a-${i}" type="number" min="0" value="${escapeHtml(s.a ?? 0)}" aria-label="Assistências">
    </div>`;
  }).join("");
  return `<div class="map-stats-team">
    <h4>${escapeHtml(teamName)}</h4>
    <div class="stat-edit-row stat-edit-head"><span>Nick</span><span>K</span><span>M</span><span>A</span></div>
    ${rows}
  </div>`;
}

function openMapModal(stage, matchId, mapId) {
  const match = stage === "final" ? league.final : league.matches.find((m) => m.id === matchId);
  if (!match || !match.team1 || !match.team2) return;
  const t1 = teams.find((t) => t.id === match.team1.id);
  const t2 = teams.find((t) => t.id === match.team2.id);
  const existing = mapId ? (match.maps || []).find((m) => m.id === mapId) : null;

  // Nicks vêm do elenco ATUAL (reflete renomeações no menu Times). As stats
  // salvas no mapa são alinhadas por índice. Fallback aos nicks salvos se o
  // elenco do time não estiver disponível.
  const roster1 = t1?.players || [];
  const roster2 = t2?.players || [];
  const stats1 = existing ? existing.players1 : [];
  const stats2 = existing ? existing.players2 : [];
  const nicks1 = roster1.length ? roster1 : stats1.map((p) => p.nick);
  const nicks2 = roster2.length ? roster2 : stats2.map((p) => p.nick);

  mapTarget = { stage, matchId, mapId: mapId || null, count1: nicks1.length, count2: nicks2.length };

  // Opções de mapa (inclui o mapa atual mesmo se estiver fora do pool).
  let opts = mapPool.slice();
  if (existing && existing.map && !opts.includes(existing.map)) opts = [existing.map, ...opts];
  $("map-name").innerHTML = opts
    .map((m) => `<option value="${escapeHtml(m)}"${existing && existing.map === m ? " selected" : ""}>${escapeHtml(m)}</option>`)
    .join("");

  $("map-modal-title").textContent = `${existing ? "Editar mapa" : "Novo mapa"} · MD${match.bestOf}`;
  $("map-team1-name").textContent = match.team1.name;
  $("map-team2-name").textContent = match.team2.name;
  $("map-score1").value = existing ? existing.score1 : 0;
  $("map-score2").value = existing ? existing.score2 : 0;
  $("map-stats").innerHTML =
    statTableHTML(match.team1.name, "t1", nicks1, stats1) +
    statTableHTML(match.team2.name, "t2", nicks2, stats2);
  $("map-error").classList.add("hidden");
  $("map-delete").classList.toggle("hidden", !existing);
  $("map-modal").classList.add("open");
}
window.closeMapModal = () => $("map-modal").classList.remove("open");

function readSide(side, count) {
  const num = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const nick = $(`map-${side}-nick-${i}`).value.trim();
    if (!nick) continue;
    out.push({ nick, k: num(`map-${side}-k-${i}`), d: num(`map-${side}-d-${i}`), a: num(`map-${side}-a-${i}`) });
  }
  return out;
}

window.saveMap = async () => {
  const err = $("map-error");
  const show = (m) => { err.textContent = m; err.classList.remove("hidden"); };
  const map = $("map-name").value;
  const s1 = parseInt($("map-score1").value, 10);
  const s2 = parseInt($("map-score2").value, 10);
  if (Number.isNaN(s1) || Number.isNaN(s2)) return show("Insira o placar de rounds.");
  const payload = {
    map,
    score1: s1,
    score2: s2,
    players1: readSide("t1", mapTarget.count1),
    players2: readSide("t2", mapTarget.count2),
  };
  try {
    await apiSaveMap(league, teams, mapTarget, payload);
    window.closeMapModal();
    toast("✅ Mapa salvo!");
  } catch (e) {
    console.error(e);
    show(e.message || "Erro ao salvar.");
  }
};

window.deleteMap = async () => {
  if (!mapTarget?.mapId) return;
  if (!confirm("Excluir este mapa? A série será recalculada.")) return;
  try {
    await apiRemoveMap(league, teams, mapTarget);
    window.closeMapModal();
    toast("Mapa excluído.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao excluir.", "error");
  }
};

/* ---- Modal de opções da partida (horário + W.O.) ---- */
let matchOptTarget = null;

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openMatchModal(stage, matchId) {
  const match = stage === "final" ? league.final : league.matches.find((m) => m.id === matchId);
  if (!match) return;
  matchOptTarget = { stage, matchId };
  const ready = match.team1 && match.team2;
  $("match-modal-title").textContent = ready
    ? `${match.team1.name} vs ${match.team2.name}`
    : "Grande Final";
  $("match-sched").value = match.scheduledAt ? toLocalInput(match.scheduledAt) : "";

  const hasMaps = (match.maps || []).length > 0;
  if (!ready) {
    $("match-wo").innerHTML = `<div class="form-hint">Finalistas ainda não definidos.</div>`;
  } else {
    const woBtns =
      `<button class="btn btn-secondary btn-sm" onclick="setWO('${match.team1.id}')" ${hasMaps ? "disabled" : ""}>W.O. → ${escapeHtml(match.team1.name)}</button>` +
      `<button class="btn btn-secondary btn-sm" onclick="setWO('${match.team2.id}')" ${hasMaps ? "disabled" : ""}>W.O. → ${escapeHtml(match.team2.name)}</button>`;
    const extra = match.walkover
      ? `<button class="btn btn-ghost btn-sm" onclick="clearWO()">Desfazer W.O.</button>`
      : hasMaps
        ? `<div class="form-hint">Remova os mapas para declarar W.O.</div>`
        : "";
    $("match-wo").innerHTML = woBtns + extra;
  }
  $("match-modal").classList.add("open");
}
window.closeMatchModal = () => $("match-modal").classList.remove("open");

window.saveSchedule = async () => {
  const v = $("match-sched").value;
  const iso = v ? new Date(v).toISOString() : null;
  try {
    await apiSetSchedule(league, teams, matchOptTarget, iso);
    window.closeMatchModal();
    toast(iso ? "🕓 Horário salvo." : "Horário removido.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao salvar horário.", "error");
  }
};

window.setWO = async (winnerId) => {
  try {
    await apiSetWalkover(league, teams, matchOptTarget, winnerId);
    window.closeMatchModal();
    toast("Resultado por W.O. registrado.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao registrar W.O.", "error");
  }
};
window.clearWO = async () => {
  try {
    await apiSetWalkover(league, teams, matchOptTarget, null);
    window.closeMatchModal();
    toast("W.O. desfeito.");
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro.", "error");
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
