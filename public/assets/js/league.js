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
const mapId = () => `g${Date.now().toString(36)}${(seq++).toString(36)}`;

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
    // score1/score2 = MAPAS vencidos por cada time (derivados de `maps`).
    score1: null, score2: null, winnerId: null, played: false, bestOf,
    // Cada item de `maps` é um mapa jogado da série — ver upsertMap.
    maps: [],
    // Agendamento (ISO) e W.O. (id do time que avança sem jogar).
    scheduledAt: null,
    walkover: null,
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

/**
 * Valida o placar de rounds de um mapa (CS2 MR12).
 * Vencedor precisa de ≥13 rounds, sem empate. Overtime (16, 19...) é aceito.
 */
export function validateMapScore(s1, s2) {
  if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) {
    throw new Error("Placar de rounds inválido.");
  }
  if (s1 === s2) throw new Error("O mapa não pode terminar empatado.");
  if (Math.max(s1, s2) < 13) {
    throw new Error("O vencedor do mapa precisa de ao menos 13 rounds.");
  }
}

/**
 * Recalcula o resultado da série (mapas vencidos, vencedor, concluída) a partir
 * dos mapas registrados. Muta o match recebido.
 */
function recomputeSeries(match) {
  const target = winTarget(match.bestOf);

  // W.O.: time presente vence sem mapas (placar = alvo a 0).
  if (match.walkover && match.team1 && match.team2) {
    if (match.walkover === match.team1.id) {
      match.score1 = target; match.score2 = 0; match.winnerId = match.team1.id;
    } else {
      match.score1 = 0; match.score2 = target; match.winnerId = match.team2.id;
    }
    match.played = true;
    return;
  }

  let w1 = 0, w2 = 0;
  for (const mp of match.maps || []) {
    if (match.team1 && mp.winnerId === match.team1.id) w1++;
    else if (match.team2 && mp.winnerId === match.team2.id) w2++;
  }
  match.score1 = w1;
  match.score2 = w2;
  if (w1 >= target) { match.winnerId = match.team1.id; match.played = true; }
  else if (w2 >= target) { match.winnerId = match.team2.id; match.played = true; }
  else { match.winnerId = null; match.played = false; }
}

function findMatch(state, target) {
  const match = target.stage === "final"
    ? state.final
    : state.matches.find((m) => m.id === target.matchId);
  if (!match) throw new Error("Partida não encontrada.");
  if (!match.team1 || !match.team2) throw new Error("A partida ainda não tem dois times.");
  return match;
}

/**
 * Adiciona um mapa novo a uma série, ou edita um existente (se `target.mapId`).
 * Recalcula a série, a final e o campeão. Não muta a entrada.
 *
 * @param {{matches, final}} league
 * @param {Array} teams
 * @param {{ stage:"rr"|"final", matchId?:string, mapId?:string }} target
 * @param {{ map:string, score1:number, score2:number,
 *           players1:Array, players2:Array }} payload
 * @returns {{ matches, final, champion }}
 */
export function upsertMap(league, teams, target, payload) {
  const state = structuredClone(league);
  const match = findMatch(state, target);

  if (match.walkover) throw new Error("Desfaça o W.O. antes de lançar mapas.");
  validateMapScore(payload.score1, payload.score2);
  if (!payload.map) throw new Error("Selecione o mapa.");

  const entry = {
    id: target.mapId || mapId(),
    map: payload.map,
    score1: payload.score1,
    score2: payload.score2,
    winnerId: payload.score1 > payload.score2 ? match.team1.id : match.team2.id,
    players1: payload.players1 || [],
    players2: payload.players2 || [],
  };

  match.maps = match.maps || [];
  if (target.mapId) {
    const idx = match.maps.findIndex((m) => m.id === target.mapId);
    if (idx < 0) throw new Error("Mapa não encontrado.");
    match.maps[idx] = entry;
  } else {
    recomputeSeries(match);
    if (match.played) throw new Error("A série já está decidida.");
    if (match.maps.length >= match.bestOf) {
      throw new Error(`Série já tem o máximo de ${match.bestOf} mapas.`);
    }
    match.maps.push(entry);
  }

  recomputeSeries(match);
  syncFinalists(state, teams);
  return { matches: state.matches, final: state.final, champion: winnerOf(state.final) };
}

/**
 * Remove um mapa de uma série e recalcula tudo. Não muta a entrada.
 * @param {{ stage:"rr"|"final", matchId?:string, mapId:string }} target
 */
export function removeMap(league, teams, target) {
  const state = structuredClone(league);
  const match = findMatch(state, target);
  match.maps = (match.maps || []).filter((m) => m.id !== target.mapId);
  recomputeSeries(match);
  syncFinalists(state, teams);
  return { matches: state.matches, final: state.final, champion: winnerOf(state.final) };
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
  m.maps = [];
  m.walkover = null;
}

/**
 * Define (ou limpa) o horário agendado de uma partida. Não muta a entrada.
 * @param {{ stage:"rr"|"final", matchId?:string }} target
 * @param {string|null} iso  ISO 8601, ou null para limpar
 */
export function setMatchSchedule(league, target, iso) {
  const state = structuredClone(league);
  const match = target.stage === "final"
    ? state.final
    : state.matches.find((m) => m.id === target.matchId);
  if (!match) throw new Error("Partida não encontrada.");
  match.scheduledAt = iso || null;
  return { matches: state.matches, final: state.final, champion: winnerOf(state.final) };
}

/**
 * Declara (winnerId) ou desfaz (null) vitória por W.O. Recalcula série, final
 * e campeão. Não muta a entrada. Só permitido quando não há mapas lançados.
 * @param {{ stage:"rr"|"final", matchId?:string }} target
 */
export function setWalkover(league, teams, target, winnerId) {
  const state = structuredClone(league);
  const match = findMatch(state, target);
  if (winnerId) {
    if ((match.maps || []).length) {
      throw new Error("Remova os mapas antes de declarar W.O.");
    }
    if (winnerId !== match.team1.id && winnerId !== match.team2.id) {
      throw new Error("Time inválido para W.O.");
    }
    match.walkover = winnerId;
  } else {
    match.walkover = null;
  }
  recomputeSeries(match);
  syncFinalists(state, teams);
  return { matches: state.matches, final: state.final, champion: winnerOf(state.final) };
}

/**
 * Propaga renomeações de jogadores de um time para todos os mapas já jogados.
 * @param {object} renameMap  { nickAntigo: nickNovo }
 * @returns {{matches, final}|null}  null se nada mudou
 */
export function renamePlayersInLeague(league, teamId, renameMap) {
  if (!renameMap || Object.keys(renameMap).length === 0) return null;
  const state = structuredClone(league);
  let changed = false;
  const fix = (team, players) => {
    if (!team || team.id !== teamId) return;
    for (const p of players || []) {
      if (renameMap[p.nick] != null) { p.nick = renameMap[p.nick]; changed = true; }
    }
  };
  const all = [...(state.matches || [])];
  if (state.final) all.push(state.final);
  for (const m of all) {
    for (const mp of m.maps || []) {
      fix(m.team1, mp.players1);
      fix(m.team2, mp.players2);
    }
  }
  return changed ? { matches: state.matches, final: state.final } : null;
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
 * As estatísticas são somadas de TODOS os mapas jogados (fase de pontos +
 * final). Cada mapa guarda players1/players2 = [{ nick, k, d, a }].
 * ------------------------------------------------------------------ */
export function playerRanking(teams, league) {
  const agg = new Map(); // chave: teamId|nick(minúsculo)

  const ensure = (team, nick) => {
    const key = `${team.id}|${nick.toLowerCase()}`;
    let r = agg.get(key);
    if (!r) {
      r = { nick, team: team.name, tag: team.tag || "", k: 0, d: 0, a: 0 };
      agg.set(key, r);
    }
    return r;
  };

  // Semeia todo o elenco — todos os jogadores aparecem, zerados até jogarem.
  for (const t of teams || []) {
    for (const raw of t.players || []) {
      const nick = (raw || "").trim();
      if (nick) ensure({ id: t.id, name: t.name, tag: t.tag }, nick);
    }
  }

  // Soma as estatísticas de cada mapa jogado (fase de pontos + final).
  const add = (team, players) => {
    if (!team) return;
    for (const p of players || []) {
      const nick = (p.nick || "").trim();
      if (!nick) continue;
      const r = ensure(team, nick);
      r.k += Number(p.k) || 0;
      r.d += Number(p.d) || 0;
      r.a += Number(p.a) || 0;
    }
  };
  const allMatches = [...(league?.matches || [])];
  if (league?.final) allMatches.push(league.final);
  for (const m of allMatches) {
    for (const mp of m.maps || []) {
      add(m.team1, mp.players1);
      add(m.team2, mp.players2);
    }
  }

  const rows = [...agg.values()];
  for (const r of rows) r.kd = r.d ? r.k / r.d : r.k;
  rows.sort((x, y) =>
    y.k - x.k || y.kd - x.kd || y.a - x.a || x.nick.localeCompare(y.nick)
  );
  return rows;
}
