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
  format: "100% online · Eliminatória simples",

  // Limites de inscrição
  maxTeams: 16,
  minPlayers: 5,
  maxPlayers: 6, // 5 titulares + 1 reserva

  // Financeiro
  registrationFee: 250,
  prizes: [
    { place: "1º Lugar", amount: 1500 },
    { place: "2º Lugar", amount: 500 },
    { place: "3º Lugar", amount: 300 },
  ],

  // Pagamento
  pix: {
    key: "t.redbala@gmail.com",
    holder: "Thiago Ferreira",
  },

  author: "Thiago Ferreira",
};

/** Nome completo composto, ex.: "1º Campeonato Lumix Fibra CS2". */
export const fullName = `${tournament.edition} ${tournament.brand}`;

/** Soma da premiação (1500 + 500 + 300 = 2300). */
export const prizePool = tournament.prizes.reduce((sum, p) => sum + p.amount, 0);

/**
 * Atalhos de login do admin: o usuário digita "thiago" em vez do e-mail
 * completo. Se o valor já contiver "@", é usado como e-mail diretamente.
 */
export const adminAliases = {
  thiago: "thiago@lumixfibra.com.br",
};
