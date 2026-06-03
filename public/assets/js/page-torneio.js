/**
 * Visão pública — acompanhamento ao vivo do torneio.
 */
import { prizeBreakdown } from "./config.js";
import { ensureDocs, watchTeams, watchSettings, watchBracket } from "./store.js";
import { bracketTreeHTML, teamAvatarHTML, teamsSkeleton } from "./render.js";
import { initTheme, escapeHtml, formatBRL, fillStaticContent, startCountdown } from "./ui.js";
import { initAnalytics } from "./analytics.js";

initTheme();
initAnalytics();
fillStaticContent();
startCountdown(document.getElementById("countdown"));
updatePrize(0);

// Skeleton enquanto o primeiro snapshot não chega
document.getElementById("teams-grid").innerHTML = teamsSkeleton(6);

ensureDocs().catch((e) => console.warn("ensureDocs:", e));

/** Premiação (bolão) = nº de times × taxa de inscrição. */
function updatePrize(count) {
  const { pool, places } = prizeBreakdown(count);
  document.getElementById("stat-prize").textContent = formatBRL(pool);
  document.getElementById("hero-prize").textContent = formatBRL(pool);
  document.getElementById("prize-1st").textContent = formatBRL(places[0]?.amount || 0);
  document.getElementById("prize-2nd").textContent = formatBRL(places[1]?.amount || 0);
}

/* ---- Times ---- */
watchTeams((teams) => {
  document.getElementById("stat-teams").textContent = teams.length;
  updatePrize(teams.length);

  const grid = document.getElementById("teams-grid");
  if (teams.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Nenhum time inscrito ainda.</p></div>`;
    return;
  }
  grid.innerHTML = teams
    .map(
      (t) => `<div class="team-card" style="cursor:default">
        ${teamAvatarHTML(t)}
        <div class="team-info">
          <div class="team-name">${escapeHtml(t.name)}</div>
          <div class="team-meta">${(t.players || []).length} jogadores</div>
        </div>
      </div>`
    )
    .join("");
});

/* ---- Estado do torneio ---- */
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

/* ---- Chave ---- */
watchBracket(({ rounds }) => {
  const container = document.getElementById("bracket-public");
  if (!rounds || rounds.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <p>A chave será gerada após o encerramento das inscrições.</p>
    </div>`;
    document.getElementById("stat-matches").textContent = "0";
    return;
  }
  container.innerHTML = bracketTreeHTML(rounds, { interactive: false });
  document.getElementById("stat-matches").textContent = rounds[0]?.matches?.length || 0;
});
