/**
 * Lógica pura de chaveamento — eliminatória simples (single elimination).
 *
 * Sem dependência de Firebase: recebe times, devolve a estrutura da chave.
 * Isso mantém a regra de negócio testável e reutilizável entre páginas.
 *
 * Formatos:
 *   teamSnapshot = { id, name, tag }
 *   match        = { id, team1, team2, score1, score2, winnerId, played }
 *   round        = { name, matches: match[] }
 *   bracket      = round[]
 */

let matchSeq = 0;
function matchId() {
  return `m${Date.now().toString(36)}${(matchSeq++).toString(36)}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reduz um time completo ao snapshot leve guardado na chave. */
export function teamSnapshot(team) {
  if (!team) return null;
  return { id: team.id, name: team.name, tag: team.tag || "" };
}

/** Nome da fase a partir da quantidade de partidas que ela contém. */
export function roundName(matchCount) {
  switch (matchCount) {
    case 1: return "Final";
    case 2: return "Semifinal";
    case 4: return "Quartas de final";
    case 8: return "Oitavas de final";
    case 16: return "16-avos de final";
    default: return `Fase de ${matchCount * 2}`;
  }
}

function emptyMatch() {
  return {
    id: matchId(),
    team1: null,
    team2: null,
    score1: null,
    score2: null,
    winnerId: null,
    played: false,
  };
}

/**
 * Monta a chave a partir da lista de times.
 * Embaralha (sorteio), completa com "byes" até a próxima potência de 2 e
 * propaga os byes automaticamente.
 */
export function createBracket(teams) {
  if (!teams || teams.length < 2) {
    throw new Error("São necessários ao menos 2 times para sortear a chave.");
  }

  const seeded = shuffle(teams.map(teamSnapshot));
  let size = 2;
  while (size < seeded.length) size *= 2;
  while (seeded.length < size) seeded.push(null); // byes

  // Primeira fase
  const first = [];
  for (let i = 0; i < size; i += 2) {
    const m = emptyMatch();
    m.team1 = seeded[i] || null;
    m.team2 = seeded[i + 1] || null;
    // Bye: um lado vazio → o outro avança automaticamente.
    if (m.team1 && !m.team2) m.winnerId = m.team1.id;
    else if (!m.team1 && m.team2) m.winnerId = m.team2.id;
    first.push(m);
  }

  const rounds = [{ name: roundName(first.length), matches: first }];

  // Fases seguintes, vazias
  let count = first.length;
  while (count > 1) {
    count = Math.ceil(count / 2);
    rounds.push({
      name: roundName(count),
      matches: Array.from({ length: count }, emptyMatch),
    });
  }

  propagate(rounds);
  return rounds;
}

function winnerOf(match) {
  if (!match || !match.winnerId) return null;
  if (match.team1 && match.team1.id === match.winnerId) return match.team1;
  if (match.team2 && match.team2.id === match.winnerId) return match.team2;
  return null;
}

function isPhantom(match) {
  return !match || (!match.team1 && !match.team2);
}

/**
 * Propaga vencedores fase a fase (in-place).
 * - Preenche team1/team2 das fases seguintes com os vencedores anteriores.
 * - Resolve byes automáticos apenas quando o lado adjacente é "fantasma"
 *   (nunca terá time) — não quando a partida ainda está pendente.
 * - Invalida resultados a jusante que deixaram de fazer sentido.
 * Retorna o snapshot do campeão (ou null).
 */
export function propagate(rounds) {
  for (let i = 0; i < rounds.length - 1; i++) {
    const cur = rounds[i].matches;
    const next = rounds[i + 1].matches;
    for (let j = 0; j < next.length; j++) {
      const c1 = cur[2 * j];
      const c2 = cur[2 * j + 1];
      const parent = next[j];
      const w1 = winnerOf(c1);
      const w2 = winnerOf(c2);
      parent.team1 = w1;
      parent.team2 = w2;

      if (parent.played) {
        // Mantém o resultado humano, a menos que o vencedor não esteja mais
        // entre os times da partida (algo mudou numa fase anterior).
        const stillValid =
          parent.winnerId === parent.team1?.id ||
          parent.winnerId === parent.team2?.id;
        if (!stillValid) resetMatch(parent);
      } else {
        // Reavalia bye automático.
        parent.winnerId = null;
        parent.score1 = null;
        parent.score2 = null;
        if (w1 && isPhantom(c2)) parent.winnerId = w1.id;
        else if (w2 && isPhantom(c1)) parent.winnerId = w2.id;
      }
    }
  }

  const final = rounds[rounds.length - 1]?.matches[0];
  return winnerOf(final);
}

function resetMatch(m) {
  m.winnerId = null;
  m.score1 = null;
  m.score2 = null;
  m.played = false;
}

/**
 * Registra o resultado de uma partida e repropaga a chave.
 * Não muta a entrada: trabalha sobre uma cópia.
 * Retorna { rounds, champion }.
 */
export function applyResult(rounds, roundIndex, matchIndex, score1, score2) {
  const copy = structuredClone(rounds);
  const match = copy[roundIndex]?.matches?.[matchIndex];
  if (!match) throw new Error("Partida não encontrada.");
  if (!match.team1 || !match.team2) throw new Error("A partida ainda não tem dois times.");
  if (score1 === score2) throw new Error("Não pode haver empate — defina um vencedor.");

  match.score1 = score1;
  match.score2 = score2;
  match.winnerId = score1 > score2 ? match.team1.id : match.team2.id;
  match.played = true;

  const champion = propagate(copy);
  return { rounds: copy, champion };
}

/** Total de partidas "reais" (com dois times de verdade) na chave. */
export function totalMatches(rounds) {
  if (!rounds) return 0;
  return rounds.reduce((sum, r) => sum + r.matches.length, 0);
}
