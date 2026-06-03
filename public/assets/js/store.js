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
 *   tournament/bracket    → { rounds }
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
import { createBracket, applyResult } from "./bracket.js";
import { tournament } from "./config.js";

const settingsRef = doc(db, "tournament", "main");
const bracketRef = doc(db, "tournament", "bracket");
const teamsCol = collection(db, "teams");

const DEFAULT_SETTINGS = {
  registrationOpen: true,
  phase: "Inscrição",
  champion: null,
};

/* ------------------------------------------------------------------ *
 * Inicialização
 * ------------------------------------------------------------------ */
export async function ensureDocs() {
  const [settingsSnap, bracketSnap] = await Promise.all([
    getDoc(settingsRef),
    getDoc(bracketRef),
  ]);
  if (!settingsSnap.exists()) {
    await setDoc(settingsRef, { ...DEFAULT_SETTINGS, updatedAt: serverTimestamp() });
  }
  if (!bracketSnap.exists()) {
    await setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() });
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

export function watchBracket(callback) {
  return onSnapshot(bracketRef, (snap) => {
    const data = snap.exists() ? snap.data() : { rounds: [] };
    callback(data.rounds || []);
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

/** Reabre inscrições e descarta a chave/campeão existentes. */
export async function reopenRegistration() {
  await Promise.all([
    setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() }),
    updateDoc(settingsRef, {
      registrationOpen: true,
      phase: "Inscrição",
      champion: null,
      updatedAt: serverTimestamp(),
    }),
  ]);
}

/* ------------------------------------------------------------------ *
 * Chave
 * ------------------------------------------------------------------ */
export async function drawBracket(teams) {
  const rounds = createBracket(teams);
  await setDoc(bracketRef, { rounds, updatedAt: serverTimestamp() });
  await updateDoc(settingsRef, {
    registrationOpen: false,
    phase: "Em andamento",
    champion: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Registra o resultado de uma partida: recalcula a chave inteira e atualiza
 * a fase/campeão de forma atômica.
 */
export async function reportResult(rounds, roundIndex, matchIndex, score1, score2) {
  const { rounds: updated, champion } = applyResult(rounds, roundIndex, matchIndex, score1, score2);
  await setDoc(bracketRef, { rounds: updated, updatedAt: serverTimestamp() });
  await updateDoc(settingsRef, {
    champion: champion || null,
    phase: champion ? "Finalizado" : "Em andamento",
    updatedAt: serverTimestamp(),
  });
  return { rounds: updated, champion };
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
    setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() }),
    setDoc(settingsRef, { ...DEFAULT_SETTINGS, updatedAt: serverTimestamp() }),
  ]);
}
