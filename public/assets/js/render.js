/**
 * Renderizadores de HTML compartilhados (chave, 3º lugar, times, skeletons).
 * Tudo que vem do usuário passa por escapeHtml — ver ui.js.
 */
import { escapeHtml, teamGradient } from "./ui.js";

// Geometria da chave (px) — usada para alinhar e desenhar os conectores.
// MATCH_H fixo é essencial para os conectores alinharem os pares.
const MATCH_W = 200;
const MATCH_H = 64;
const BASE_GAP = 24;
const UNIT = MATCH_H + BASE_GAP;
const STUB = 13; // metade do gap horizontal entre fases (gap = 2*STUB)

/**
 * HTML da árvore da chave, com conectores entre as fases.
 * @param {Array} rounds
 * @param {{ interactive?: boolean }} opts
 */
export function bracketTreeHTML(rounds, { interactive = false } = {}) {
  if (!rounds || rounds.length === 0) return "";
  const total = rounds.length;
  let html = '<div class="bracket-tree">';

  rounds.forEach((round, ri) => {
    const gap = UNIT * 2 ** ri - MATCH_H;
    const padTop = ri === 0 ? 0 : (UNIT * (2 ** ri - 1)) / 2;
    const last = ri === total - 1;

    html += `<div class="b-round"><div class="b-round-head">${escapeHtml(round.name)}</div>`;
    html += `<div class="b-round-matches" style="gap:${gap}px;padding-top:${padTop}px">`;

    round.matches.forEach((m, mi) => {
      const connectors = last ? "" : matchConnectors(mi, gap);
      html += `<div class="b-match-wrap" style="height:${MATCH_H}px">${matchHTML(m, ri, mi, interactive)}${connectors}</div>`;
    });

    html += "</div></div>";
  });

  html += "</div>";
  return html;
}

function matchConnectors(mi, gap) {
  const vDist = MATCH_H + gap; // distância entre centros de partidas vizinhas
  let c = `<span class="b-line b-line-h" style="left:${MATCH_W}px;top:50%;width:${STUB}px"></span>`;
  if (mi % 2 === 0) {
    // Vertical ligando o par + entrada horizontal para a próxima fase.
    c += `<span class="b-line b-line-v" style="left:${MATCH_W + STUB}px;top:50%;height:${vDist}px"></span>`;
    c += `<span class="b-line b-line-h" style="left:${MATCH_W + STUB}px;top:calc(50% + ${vDist / 2}px);width:${STUB}px"></span>`;
  }
  return c;
}

function matchHTML(m, ri, mi, interactive) {
  const placeholder = ri === 0 ? "BYE" : "A definir";
  const t1 = m.team1 ? m.team1.name : placeholder;
  const t2 = m.team2 ? m.team2.name : placeholder;
  const w = m.winnerId;
  const cls1 = w ? (m.team1 && m.team1.id === w ? "winner" : "loser") : "";
  const cls2 = w ? (m.team2 && m.team2.id === w ? "winner" : "loser") : "";
  const canClick = interactive && !m.winnerId && m.team1 && m.team2;
  const attr = canClick ? ` data-round="${ri}" data-match="${mi}"` : "";
  return `<div class="b-match${canClick ? " clickable" : ""}"${attr}>${teamRow(t1, m.score1, cls1)}${teamRow(t2, m.score2, cls2)}</div>`;
}

function teamRow(name, score, cls) {
  const scoreHtml =
    score !== null && score !== undefined ? `<span class="b-score">${escapeHtml(score)}</span>` : "";
  return `<div class="b-team ${cls}"><span class="b-team-name">${escapeHtml(name)}</span>${scoreHtml}</div>`;
}

/** Avatar (TAG ou iniciais) com cor determinística. */
export function teamAvatarHTML(team, { size } = {}) {
  const label = (team.tag || team.name || "??").slice(0, 2).toUpperCase();
  const style = `background:${teamGradient(team.name || "")}${size ? `;width:${size}px;height:${size}px` : ""}`;
  return `<div class="team-avatar" style="${style}">${escapeHtml(label)}</div>`;
}

/** Placeholders animados enquanto os dados carregam. */
export function teamsSkeleton(count = 6) {
  return Array.from({ length: count }, () =>
    `<div class="team-card" aria-hidden="true"><div class="skeleton skeleton-avatar"></div><div style="flex:1"><div class="skeleton skeleton-line" style="width:60%"></div><div class="skeleton skeleton-line" style="width:40%;margin-top:8px"></div></div></div>`
  ).join("");
}
