/**
 * Visão pública — acompanhamento ao vivo do torneio (liga + final).
 */
import { tournament, prizeBreakdown } from "./config.js";
import { ensureDocs, watchTeams, watchSettings, watchLeague } from "./store.js";
import { standings, matchesByRound, playerRanking } from "./league.js";
import { standingsHTML, matchesHTML, finalHTML, playerRankingHTML, teamAvatarHTML, teamsSkeleton } from "./render.js";
import { initTheme, escapeHtml, formatBRL, fillStaticContent, startCountdown } from "./ui.js";
import { initAnalytics } from "./analytics.js";

let teams = [];
let league = { matches: [], final: null };

initTheme();
initAnalytics();
fillStaticContent();
startCountdown(document.getElementById("countdown"));
updatePrize(0);

document.getElementById("teams-grid").innerHTML = teamsSkeleton(6);
ensureDocs().catch((e) => console.warn("ensureDocs:", e));

/** Premiação (bolão) = nº de times × taxa. Vencedor leva tudo. */
function updatePrize(count) {
  const { pool } = prizeBreakdown(count);
  document.getElementById("stat-prize").textContent = formatBRL(pool);
  document.getElementById("hero-prize").textContent = formatBRL(pool);
}

/* ---- Times ---- */
watchTeams((list) => {
  teams = list;
  document.getElementById("stat-teams").textContent = teams.length;
  updatePrize(teams.length);

  const grid = document.getElementById("teams-grid");
  grid.innerHTML = teams.length === 0
    ? `<div class="empty-state" style="grid-column:1/-1"><p>Nenhum time inscrito ainda.</p></div>`
    : teams.map((t) => `<div class="team-card" style="cursor:default">
        ${teamAvatarHTML(t)}
        <div class="team-info">
          <div class="team-name">${escapeHtml(t.name)}</div>
          <div class="team-meta">${(t.players || []).length} jogadores</div>
        </div>
      </div>`).join("");

  renderCompetition();
});

/* ---- Estado ---- */
watchSettings((s) => {
  document.getElementById("stat-phase").textContent = s.phase || "Inscrição";
  const cta = document.getElementById("cta-banner");
  if (cta) cta.classList.toggle("hidden", s.registrationOpen === false);

  const champ = document.getElementById("champion-section");
  if (s.champion) {
    document.getElementById("champion-name").textContent = s.champion.name;
    champ.classList.remove("hidden");
  } else {
    champ.classList.add("hidden");
  }
});

/* ---- Liga ---- */
watchLeague((data) => {
  league = data;
  renderCompetition();
});

function renderCompetition() {
  const container = document.getElementById("competition");
  document.getElementById("stat-matches").textContent = league.matches.length;

  if (league.matches.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <p>A tabela de jogos será gerada após o encerramento das inscrições.</p>
    </div>`;
    return;
  }

  const rows = standings(teams, league.matches, tournament.pointsPerWin);
  const players = playerRanking(teams, league);
  container.innerHTML =
    `<h3 class="block-title">📊 Classificação</h3>` +
    standingsHTML(rows) +
    (players.length
      ? `<h3 class="block-title" style="margin-top:var(--space-8)">🎯 Ranking de Jogadores</h3>` + playerRankingHTML(players)
      : "") +
    finalHTML(league.final) +
    `<h3 class="block-title" style="margin-top:var(--space-8)">🎮 Jogos · Fase de pontos (MD${tournament.bestOf.round})</h3>` +
    matchesHTML(matchesByRound(league.matches));
}
