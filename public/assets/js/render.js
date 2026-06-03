/**
 * Renderizadores de HTML compartilhados (chave e times).
 * Tudo que vem do usuário passa por escapeHtml — ver ui.js.
 */
import { escapeHtml, teamGradient } from "./ui.js";

/**
 * HTML da árvore da chave.
 * @param {Array} rounds
 * @param {{ interactive?: boolean }} opts  interactive=true torna partidas
 *        jogáveis clicáveis (data-round/data-match para delegação de evento).
 */
export function bracketTreeHTML(rounds, { interactive = false } = {}) {
  if (!rounds || rounds.length === 0) return "";
  const total = rounds.length;
  let html = '<div class="bracket-tree">';

  rounds.forEach((round, ri) => {
    html += `<div class="b-round"><div class="b-round-head">${escapeHtml(round.name)}</div><div class="b-round-matches">`;
    round.matches.forEach((m, mi) => {
      const placeholder = ri === 0 ? "BYE" : "A definir";
      const t1 = m.team1 ? m.team1.name : placeholder;
      const t2 = m.team2 ? m.team2.name : placeholder;
      const w = m.winnerId;
      const cls1 = w ? (m.team1 && m.team1.id === w ? "winner" : "loser") : "";
      const cls2 = w ? (m.team2 && m.team2.id === w ? "winner" : "loser") : "";
      const canClick = interactive && !m.winnerId && m.team1 && m.team2;

      html += '<div class="b-match-wrap">';
      html += `<div class="b-match${canClick ? " clickable" : ""}"${canClick ? ` data-round="${ri}" data-match="${mi}"` : ""}>`;
      html += teamRow(t1, m.score1, cls1);
      html += teamRow(t2, m.score2, cls2);
      html += "</div>";
      if (ri < total - 1) html += '<div class="b-connector"></div>';
      html += "</div>";
    });
    html += "</div></div>";
  });

  html += "</div>";
  return html;
}

function teamRow(name, score, cls) {
  const scoreHtml =
    score !== null && score !== undefined
      ? `<span class="b-score">${escapeHtml(score)}</span>`
      : "";
  return `<div class="b-team ${cls}"><span class="b-team-name">${escapeHtml(name)}</span>${scoreHtml}</div>`;
}

/** Avatar (TAG ou iniciais) com cor determinística. */
export function teamAvatarHTML(team, { size } = {}) {
  const label = (team.tag || team.name || "??").slice(0, 2).toUpperCase();
  const style = `background:${teamGradient(team.name || "")}${size ? `;width:${size}px;height:${size}px` : ""}`;
  return `<div class="team-avatar" style="${style}">${escapeHtml(label)}</div>`;
}
