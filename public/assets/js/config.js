/**
 * Configuração central do projeto.
 *
 * Tudo que descreve o torneio (nome, datas, premiação, PIX, limites) vive aqui.
 * Para criar uma nova edição, edite apenas este arquivo — todas as páginas leem
 * destas constantes.
 */

/* ------------------------------------------------------------------ *
 * Firebase
 * A apiKey de um app web do Firebase é pública por design: ela apenas
 * identifica o projeto. A segurança real é feita pelas regras do Firestore
 * (ver `firestore.rules`) e pela autenticação.
 * ------------------------------------------------------------------ */
export const firebaseConfig = {
  apiKey: "AIzaSyBXDdocjCL9cBvF1b30Xe3KIF2Prd3_qCs",
  authDomain: "torneio-cs.firebaseapp.com",
  projectId: "torneio-cs",
  storageBucket: "torneio-cs.firebasestorage.app",
  messagingSenderId: "722843986325",
  appId: "1:722843986325:web:383d2d5e67883840412e9c",
  measurementId: "G-S61B5RD99P",
};

/* ------------------------------------------------------------------ *
 * Dados do torneio
 * ------------------------------------------------------------------ */
export const tournament = {
  brand: "Lumix Fibra CS2",
  edition: "1º Campeonato",
  game: "Counter-Strike 2",

  // Logística
  dates: "15, 16 e 17 de maio",
  format: "100% online · Todos contra todos (MD3) + Final (MD5)",
  // Formato dos jogos: fase de pontos em melhor-de-3, final em melhor-de-5.
  bestOf: { round: 3, final: 5 },
  // Pontuação da classificação
  pointsPerWin: 3,
  // Data/hora de início (ISO) para a contagem regressiva. Deixe null para
  // ocultar o contador. Ex.: "2026-05-15T20:00:00-03:00".
  startDate: null,

  // Limites de inscrição
  maxTeams: 16,
  minPlayers: 5,
  maxPlayers: 6, // 5 titulares + 1 reserva

  // Financeiro
  // A premiação é um "bolão": soma das inscrições (nº de times × a taxa).
  // prizeSplit define a divisão entre os colocados. [1] = vencedor leva tudo.
  // Ex.: 4 times = R$ 1000 → campeão leva R$ 1000.
  registrationFee: 250,
  prizeSplit: [1],

  // Pagamento
  pix: {
    key: "t.redbala@gmail.com",
    holder: "Thiago Ferreira",
  },

  author: "Thiago Ferreira",
};

/** Nome completo composto, ex.: "1º Campeonato Lumix Fibra CS2". */
export const fullName = `${tournament.edition} ${tournament.brand}`;

/**
 * Calcula a premiação a partir do número de times inscritos.
 * @returns {{ pool:number, places:{label:string, amount:number}[] }}
 */
export function prizeBreakdown(teamCount) {
  const pool = (teamCount || 0) * tournament.registrationFee;
  const split = tournament.prizeSplit;
  const places = [];
  let allocated = 0;
  split.forEach((frac, i) => {
    const last = i === split.length - 1;
    const amount = last ? pool - allocated : Math.round(pool * frac);
    allocated += amount;
    places.push({ label: `${i + 1}º Lugar`, amount });
  });
  return { pool, places };
}

/**
 * Atalhos de login do admin: o usuário digita "thiago" em vez do e-mail
 * completo. Se o valor já contiver "@", é usado como e-mail diretamente.
 */
export const adminAliases = {
  thiago: "thiago@lumixfibra.com.br",
};
