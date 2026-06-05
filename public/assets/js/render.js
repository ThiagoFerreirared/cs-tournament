/**
 * Renderizadores de HTML compartilhados (classificação, jogos, final, times).
 * Tudo que vem do usuário passa por escapeHtml — ver ui.js.
 */
import { escapeHtml, teamGradient } from "./ui.js";

/* ------------------------------------------------------------------ *
 * Avatar
 * ------------------------------------------------------------------ */
export function teamAvatarHTML(team, { size } = {}) {
  const label = (team.tag || team.name || "??").slice(0, 2).toUpperCase();
  const style = `background:${teamGradient(team.name || "")}${size ? `;width:${size}px;height:${size}px` : ""}`;
  return `<div class="team-avatar" style="${style}">${escapeHtml(label)}</div>`;
}

function avatarMini(team) {
  if (!team) return "";
  const label = (team.tag || team.name || "??").slice(0, 2).toUpperCase();
  return `<span class="avatar-mini" style="background:${teamGradient(team.name || "")}">${escapeHtml(label)}</span>`;
}

/* ------------------------------------------------------------------ *
 * Classificação
 * ------------------------------------------------------------------ */
export function standingsHTML(rows, { qualifyCount = 2 } = {}) {
  if (!rows || rows.length === 0) return "";
  const body = rows
    .map((r, i) => {
      const pos = i + 1;
      const qualified = pos <= qualifyCount;
      return `<tr class="${qualified ? "qualified" : ""}">
        <td class="st-pos">${pos}</td>
        <td class="st-team">${avatarMini(r.team)}<span class="st-name">${escapeHtml(r.team.name)}</span>${qualified ? '<span class="st-flag">Classificado</span>' : ""}</td>
        <td>${r.jogos}</td>
        <td class="st-strong">${r.vitorias}</td>
        <td>${r.derrotas}</td>
        <td class="st-muted">${r.mapasPro}:${r.mapasContra}</td>
        <td>${r.saldo > 0 ? "+" : ""}${r.saldo}</td>
        <td class="st-pts">${r.pontos}</td>
      </tr>`;
    })
    .join("");

  return `<div class="standings-wrap"><table class="standings">
    <thead><tr>
      <th>#</th><th class="st-team-h">Time</th><th title="Jogos">J</th>
      <th title="Vitórias">V</th><th title="Derrotas">D</th>
      <th title="Mapas pró:contra">Mapas</th><th title="Saldo de mapas">SG</th>
      <th title="Pontos">Pts</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------ *
 * Ranking de jogadores (K / M / A / K-D)
 * ------------------------------------------------------------------ */
export function playerRankingHTML(rows) {
  if (!rows || rows.length === 0) return "";
  const body = rows
    .map((r, i) => `<tr>
      <td class="st-pos">${i + 1}</td>
      <td class="st-team">${avatarMini({ name: r.team, tag: r.tag })}<span class="st-name">${escapeHtml(r.nick)}</span></td>
      <td class="st-muted">${escapeHtml(r.team)}</td>
      <td class="st-strong">${r.k}</td>
      <td>${r.d}</td>
      <td>${r.a}</td>
      <td class="st-pts">${r.kd.toFixed(2)}</td>
    </tr>`)
    .join("");
  return `<div class="standings-wrap"><table class="standings">
    <thead><tr>
      <th>#</th><th class="st-team-h">Jogador</th><th class="st-team-h">Time</th>
      <th title="Kills (abates)">K</th><th title="Mortes">M</th>
      <th title="Assistências">A</th><th title="Kills / Mortes">K/D</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------ *
 * Jogos (fase de pontos), agrupados por rodada
 * ------------------------------------------------------------------ */
export function matchesHTML(rounds, { interactive = false } = {}) {
  if (!rounds || rounds.length === 0) return "";
  return rounds
    .map(
      ({ round, matches }) => `<div class="round-group">
        <div class="round-label">Rodada ${round}</div>
        <div class="match-list">${matches.map((m) => matchCard(m, "rr", interactive)).join("")}</div>
      </div>`
    )
    .join("");
}

/** Uma linha de mapa dentro de uma série (mapa + placar de rounds). */
function mapLineHTML(m, mp, stage, interactive) {
  const w1 = m.team1 && mp.winnerId === m.team1.id;
  const w2 = m.team2 && mp.winnerId === m.team2.id;
  const attr = interactive
    ? ` data-stage="${stage}" data-match="${escapeHtml(m.id)}" data-map="${escapeHtml(mp.id)}"`
    : "";
  return `<div class="map-line${interactive ? " clickable" : ""}"${attr}>
    <span class="ml-map">${escapeHtml(mp.map)}</span>
    <span class="ml-score"><b class="${w1 ? "win" : ""}">${escapeHtml(mp.score1)}</b><i>:</i><b class="${w2 ? "win" : ""}">${escapeHtml(mp.score2)}</b></span>
  </div>`;
}

/** Bloco com os mapas da série + botão "adicionar mapa" (admin, se cabível). */
function mapsBlockHTML(m, stage, interactive) {
  const maps = m.maps || [];
  const lines = maps.map((mp) => mapLineHTML(m, mp, stage, interactive)).join("");
  const canAdd = interactive && m.team1 && m.team2 && !m.played && maps.length < m.bestOf;
  const addBtn = canAdd
    ? `<div class="map-add" data-stage="${stage}" data-match="${escapeHtml(m.id)}" data-add="1" role="button" tabindex="0">+ adicionar mapa</div>`
    : "";
  if (!lines && !addBtn) return "";
  return `<div class="map-lines">${lines}${addBtn}</div>`;
}

/** Cartão de um confronto: placar da série (mapas) + lista de mapas. */
function matchCard(m, stage, interactive) {
  const w1 = m.winnerId && m.team1 && m.winnerId === m.team1.id;
  const w2 = m.winnerId && m.team2 && m.winnerId === m.team2.id;
  const s1 = m.score1 ?? 0;
  const s2 = m.score2 ?? 0;
  return `<div class="match-card${m.played ? " played" : ""}">
    <div class="match-row">
      <span class="match-team left${w1 ? " win" : ""}${m.played && !w1 ? " lose" : ""}"><span class="mt-name">${escapeHtml(m.team1?.name || "—")}</span>${avatarMini(m.team1)}</span>
      <span class="match-score"><b>${escapeHtml(s1)}</b><i>x</i><b>${escapeHtml(s2)}</b></span>
      <span class="match-team right${w2 ? " win" : ""}${m.played && !w2 ? " lose" : ""}">${avatarMini(m.team2)}<span class="mt-name">${escapeHtml(m.team2?.name || "—")}</span></span>
    </div>
    ${mapsBlockHTML(m, stage, interactive)}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Final (MD5)
 * ------------------------------------------------------------------ */
export function finalHTML(final, { interactive = false } = {}) {
  if (!final) return "";
  const ready = final.team1 && final.team2;
  const w1 = final.winnerId && final.team1 && final.winnerId === final.team1.id;
  const w2 = final.winnerId && final.team2 && final.winnerId === final.team2.id;

  const inner = ready
    ? `<div class="final-match">
         <span class="final-team${w1 ? " win" : ""}${final.played && !w1 ? " lose" : ""}">${teamAvatarHTML(final.team1)}<span>${escapeHtml(final.team1.name)}</span></span>
         <span class="final-score"><b>${escapeHtml(final.score1 ?? 0)}</b><i>x</i><b>${escapeHtml(final.score2 ?? 0)}</b></span>
         <span class="final-team right${w2 ? " win" : ""}${final.played && !w2 ? " lose" : ""}"><span>${escapeHtml(final.team2.name)}</span>${teamAvatarHTML(final.team2)}</span>
       </div>
       ${mapsBlockHTML(final, "final", interactive)}`
    : `<div class="final-waiting">Aguardando o fim da fase de pontos para definir os 2 finalistas.</div>`;

  return `<div class="final-block">
    <div class="final-head">🏆 Grande Final <span class="badge badge-primary">MD${final.bestOf}</span></div>
    ${inner}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * Skeleton
 * ------------------------------------------------------------------ */
export function teamsSkeleton(count = 6) {
  return Array.from({ length: count }, () =>
    `<div class="team-card" aria-hidden="true"><div class="skeleton skeleton-avatar"></div><div style="flex:1"><div class="skeleton skeleton-line" style="width:60%"></div><div class="skeleton skeleton-line" style="width:40%;margin-top:8px"></div></div></div>`
  ).join("");
}
