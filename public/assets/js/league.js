/**
 * Lógica pura da competição — liga de pontos corridos + final.
 *
 * Formato:
 *   - Fase de pontos: todos contra todos (turno único), cada jogo em MD3.
 *   - Final: os 2 melhores da classificação se enfrentam em MD5.
 *   - Vencedor da final é o campeão.
 *
 * Sem dependência de Firebase.
 *
 * Estruturas:
 *   teamSnapshot = { id, name, tag }
 *   match        = { id, round, team1, team2, score1, score2, winnerId, played, bestOf }
 *   league       = { matches: match[], final: match | null }
 *   standingRow  = { team, jogos, vitorias, derrotas, mapasPro, mapasContra, saldo, pontos }
 */

let seq = 0;
const mid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function teamSnapshot(team) {
  return team ? { id: team.id, name: team.name, tag: team.tag || "" } : null;
}

/** Mapas necessários para vencer (MD3 → 2, MD5 → 3). */
export function winTarget(bestOf) {
  return Math.floor(bestOf / 2) + 1;
}

function makeMatch(team1, team2, round, bestOf) {
  return {
    id: mid(), round, team1, team2,
    score1: null, score2: null, winnerId: null, played: false, bestOf,
  };
}

/**
 * Gera a tabela de jogos (todos contra todos) pelo método do círculo,
 * organizada em rodadas, mais uma final vazia.
 */
export function createLeague(teams, { roundBestOf = 3, finalBestOf = 5, random = true } = {}) {
  if (!teams || teams.length < 2) {
    throw new Error("São necessários ao menos 2 times para gerar a tabela.");
  }
  const snaps = (random ? shuffle(teams) : [...teams]).map(teamSnapshot);

  const list = [...snaps];
  if (list.length % 2 !== 0) list.push(null); // folga (bye) para nº ímpar
  const n = list.length;
  const half = n / 2;

  const matches = [];
  let arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) matches.push(makeMatch(a, b, r + 1, roundBestOf));
    }
    // rotaciona mantendo o primeiro fixo
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  const final = makeMatch(null, null, 0, finalBestOf);
  return { matches, final };
}

function winnerOf(match) {
  if (!match || !match.winnerId) return null;
  if (match.team1 && match.team1.id === match.winnerId) return match.team1;
  if (match.team2 && match.team2.id === match.winnerId) return match.team2;
  return null;
}

/** Todas as partidas da fase de pontos foram jogadas? */
export function roundRobinComplete(matches) {
  return matches.length > 0 && matches.every((m) => m.played);
}

/**
 * Calcula a classificação a partir dos times e das partidas jogadas.
 * Ordena por: pontos → saldo de mapas → mapas pró → nome.
 */
export function standings(teams, matches, pointsPerWin = 3) {
  const rows = new Map();
  for (const t of teams) {
    rows.set(t.id, {
      team: teamSnapshot(t),
      jogos: 0, vitorias: 0, derrotas: 0,
      mapasPro: 0, mapasContra: 0, saldo: 0, pontos: 0,
    });
  }

  for (const m of matches) {
    if (!m.played || !m.team1 || !m.team2) continue;
    const a = rows.get(m.team1.id);
    const b = rows.get(m.team2.id);
    if (!a || !b) continue;
    a.jogos++; b.jogos++;
    a.mapasPro += m.score1; a.mapasContra += m.score2;
    b.mapasPro += m.score2; b.mapasContra += m.score1;
    if (m.winnerId === m.team1.id) { a.vitorias++; b.derrotas++; }
    else { b.vitorias++; a.derrotas++; }
  }

  const list = [...rows.values()];
  for (const r of list) {
    r.saldo = r.mapasPro - r.mapasContra;
    r.pontos = r.vitorias * pointsPerWin;
  }
  list.sort((x, y) =>
    y.pontos - x.pontos ||
    y.saldo - x.saldo ||
    y.mapasPro - x.mapasPro ||
    x.team.name.localeCompare(y.team.name)
  );
  return list;
}

function validateScore(bestOf, s1, s2) {
  const target = winTarget(bestOf);
  if (s1 === s2) throw new Error("Não pode haver empate — defina o vencedor.");
  const hi = Math.max(s1, s2);
  const lo = Math.min(s1, s2);
  if (hi !== target || lo < 0 || lo >= target) {
    throw new Error(`Placar inválido para MD${bestOf}: o vencedor faz ${target} mapas.`);
  }
}

/**
 * Registra o resultado de uma partida (da fase de pontos ou da final) e
 * recalcula o estado. Não muta a entrada.
 * @param {{matches, final}} league
 * @param {Array} teams  lista completa de times (para a classificação)
 * @param {{ stage:"rr"|"final", matchId?:string }} target
 * @returns {{ matches, final, champion }}
 */
export function applyMatchResult(league, teams, target, score1, score2) {
  const state = structuredClone(league);

  let match;
  if (target.stage === "final") match = state.final;
  else match = state.matches.find((m) => m.id === target.matchId);
  if (!match) throw new Error("Partida não encontrada.");
  if (!match.team1 || !match.team2) throw new Error("A partida ainda não tem dois times.");

  validateScore(match.bestOf, score1, score2);
  match.score1 = score1;
  match.score2 = score2;
  match.winnerId = score1 > score2 ? match.team1.id : match.team2.id;
  match.played = true;

  syncFinalists(state, teams);
  const champion = winnerOf(state.final);
  return { matches: state.matches, final: state.final, champion };
}

/**
 * Quando a fase de pontos termina, preenche a final com os 2 primeiros.
 * Se a classificação mudar e a final já tiver sido jogada com outros times,
 * o resultado da final é invalidado.
 */
function syncFinalists(state, teams) {
  const final = state.final;
  if (!final) return;

  if (!roundRobinComplete(state.matches)) {
    final.team1 = null; final.team2 = null;
    resetMatch(final);
    return;
  }

  const top = standings(teams, state.matches).slice(0, 2);
  final.team1 = top[0]?.team || null;
  final.team2 = top[1]?.team || null;

  if (final.played) {
    const ids = [final.team1?.id, final.team2?.id];
    if (!ids.includes(final.winnerId)) resetMatch(final);
  }
}

function resetMatch(m) {
  m.score1 = null; m.score2 = null; m.winnerId = null; m.played = false;
}

/** Agrupa as partidas por rodada (para exibição). */
export function matchesByRound(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.round)) map.set(m.round, []);
    map.get(m.round).push(m);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([round, list]) => ({ round, matches: list }));
}

/** Total de partidas da fase de pontos. */
export function totalMatches(league) {
  return league?.matches?.length || 0;
}

/* ------------------------------------------------------------------ *
 * Ranking de jogadores (kills / mortes / assistências)
 * As estatísticas ficam em team.playerStats (array alinhado a team.players).
 * ------------------------------------------------------------------ */
export function playerRanking(teams) {
  const rows = [];
  for (const t of teams || []) {
    const players = t.players || [];
    const stats = t.playerStats || [];
    players.forEach((nick, i) => {
      const s = stats[i] || {};
      const k = Number(s.k) || 0;
      const d = Number(s.d) || 0;
      const a = Number(s.a) || 0;
      rows.push({
        nick, team: t.name, tag: t.tag || "",
        k, d, a, kd: d ? k / d : k,
      });
    });
  }
  rows.sort((x, y) =>
    y.k - x.k || y.kd - x.kd || y.a - x.a || x.nick.localeCompare(y.nick)
  );
  return rows;
}
