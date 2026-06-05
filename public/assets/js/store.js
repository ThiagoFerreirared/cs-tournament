/**
 * Camada de dados do Firestore.
 *
 * Centraliza todas as leituras/escritas. As páginas nunca falam com o
 * Firestore diretamente — chamam estas funções, o que mantém o modelo de
 * dados consistente.
 *
 * Modelo:
 *   teams/{id}            → time inscrito
 *   tournament/main       → estado geral (inscrições, fase, campeão)
 *   tournament/league     → { matches, final }  (pontos corridos + final)
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import {
  createLeague, upsertMap, removeMap as leagueRemoveMap,
  setMatchSchedule as leagueSetSchedule, setWalkover as leagueSetWalkover,
  renamePlayersInLeague as leagueRenamePlayers,
} from "./league.js";
import { tournament } from "./config.js";

const settingsRef = doc(db, "tournament", "main");
const leagueRef = doc(db, "tournament", "league");
const teamsCol = collection(db, "teams");

const DEFAULT_SETTINGS = {
  registrationOpen: true,
  phase: "Inscrição",
  champion: null,
};

const EMPTY_LEAGUE = { matches: [], final: null };

/* ------------------------------------------------------------------ *
 * Inicialização
 * ------------------------------------------------------------------ */
export async function ensureDocs() {
  const [settingsSnap, leagueSnap] = await Promise.all([
    getDoc(settingsRef),
    getDoc(leagueRef),
  ]);
  if (!settingsSnap.exists()) {
    await setDoc(settingsRef, { ...DEFAULT_SETTINGS, updatedAt: serverTimestamp() });
  }
  if (!leagueSnap.exists()) {
    await setDoc(leagueRef, { ...EMPTY_LEAGUE, updatedAt: serverTimestamp() });
  }
}

/* ------------------------------------------------------------------ *
 * Assinaturas em tempo real
 * ------------------------------------------------------------------ */
export function watchSettings(callback) {
  return onSnapshot(settingsRef, (snap) => {
    callback(snap.exists() ? snap.data() : { ...DEFAULT_SETTINGS });
  });
}

export function watchTeams(callback) {
  return onSnapshot(teamsCol, (snap) => {
    const teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    teams.sort(byCreatedAt);
    callback(teams);
  });
}

export function watchLeague(callback) {
  return onSnapshot(leagueRef, (snap) => {
    const data = snap.exists() ? snap.data() : EMPTY_LEAGUE;
    callback({ matches: data.matches || [], final: data.final || null });
  });
}

function byCreatedAt(a, b) {
  const ta = toMillis(a.createdAt ?? a.registeredAt);
  const tb = toMillis(b.createdAt ?? b.registeredAt);
  return ta - tb;
}
function toMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}

/* ------------------------------------------------------------------ *
 * Inscrição (público)
 * ------------------------------------------------------------------ */
export async function isNameTaken(name) {
  const snap = await getDocs(query(teamsCol, where("name", "==", name)));
  return !snap.empty;
}

export async function registerTeam({ name, tag, contact, email, players, paymentNote }) {
  await addDoc(teamsCol, {
    name,
    tag,
    contact: contact || "",
    email: email || "",
    players,
    paymentNote: paymentNote || "",
    paymentStatus: "pendente",
    paymentMethod: "PIX",
    paymentAmount: tournament.registrationFee,
    createdAt: serverTimestamp(),
  });
}

/* ------------------------------------------------------------------ *
 * Administração de times
 * ------------------------------------------------------------------ */
export async function setPaymentStatus(teamId, status) {
  await updateDoc(doc(db, "teams", teamId), {
    paymentStatus: status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTeam(teamId, data) {
  await updateDoc(doc(db, "teams", teamId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTeam(teamId) {
  await deleteDoc(doc(db, "teams", teamId));
}

/* ------------------------------------------------------------------ *
 * Estado do torneio
 * ------------------------------------------------------------------ */
export async function setRegistrationOpen(open) {
  await updateDoc(settingsRef, {
    registrationOpen: open,
    phase: open ? "Inscrição" : "Inscrições encerradas",
    updatedAt: serverTimestamp(),
  });
}

/** Reabre inscrições e descarta a tabela/campeão existentes. */
export async function reopenRegistration() {
  await Promise.all([
    setDoc(leagueRef, { ...EMPTY_LEAGUE, updatedAt: serverTimestamp() }),
    updateDoc(settingsRef, {
      registrationOpen: true,
      phase: "Inscrição",
      champion: null,
      updatedAt: serverTimestamp(),
    }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Liga (pontos corridos + final)
 * ------------------------------------------------------------------ */
export async function generateLeague(teams, { random = true } = {}) {
  const league = createLeague(teams, {
    roundBestOf: tournament.bestOf.round,
    finalBestOf: tournament.bestOf.final,
    random,
  });
  await setDoc(leagueRef, { ...league, updatedAt: serverTimestamp() });
  await updateDoc(settingsRef, {
    registrationOpen: false,
    phase: "Fase de pontos",
    champion: null,
    updatedAt: serverTimestamp(),
  });
}

/** Persiste o estado recalculado da liga (mapas, final, fase, campeão). */
async function persistLeagueState(r) {
  await setDoc(leagueRef, { matches: r.matches, final: r.final, updatedAt: serverTimestamp() });
  const phase = r.champion ? "Finalizado" : r.final?.team1 ? "Final" : "Fase de pontos";
  await updateDoc(settingsRef, {
    champion: r.champion || null,
    phase,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Adiciona um mapa novo a uma série (ou edita um existente, se target.mapId),
 * recalcula classificação/final/campeão e persiste de forma atômica.
 * @param {{matches, final}} league  estado atual
 * @param {Array} teams              lista completa de times
 * @param {{stage:"rr"|"final", matchId?:string, mapId?:string}} target
 * @param {{map, score1, score2, players1, players2}} payload
 */
export async function saveMap(league, teams, target, payload) {
  const r = upsertMap(league, teams, target, payload);
  await persistLeagueState(r);
  return r;
}

/** Remove um mapa de uma série e persiste o novo estado. */
export async function removeMap(league, teams, target) {
  const r = leagueRemoveMap(league, teams, target);
  await persistLeagueState(r);
  return r;
}

/** Define/limpa o horário agendado de uma partida e persiste. */
export async function setSchedule(league, teams, target, iso) {
  const r = leagueSetSchedule(league, target, iso);
  await persistLeagueState(r);
  return r;
}

/** Declara/desfaz vitória por W.O. e persiste o novo estado. */
export async function setWalkover(league, teams, target, winnerId) {
  const r = leagueSetWalkover(league, teams, target, winnerId);
  await persistLeagueState(r);
  return r;
}

/**
 * Aplica renomeações de jogadores ({nickAntigo: nickNovo}) aos mapas já
 * jogados e persiste só o doc da liga. No-op se nada mudou.
 */
export async function renameLeaguePlayers(league, teamId, renameMap) {
  const r = leagueRenamePlayers(league, teamId, renameMap);
  if (!r) return null;
  await setDoc(leagueRef, { matches: r.matches, final: r.final, updatedAt: serverTimestamp() });
  return r;
}

/* ------------------------------------------------------------------ *
 * Reset
 * ------------------------------------------------------------------ */
export async function resetTournament() {
  const snap = await getDocs(teamsCol);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await Promise.all([
    setDoc(leagueRef, { ...EMPTY_LEAGUE, updatedAt: serverTimestamp() }),
    setDoc(settingsRef, { ...DEFAULT_SETTINGS, updatedAt: serverTimestamp() }),
  ]);
}
