/**
 * Utilitários de interface compartilhados por todas as páginas:
 * formatação, tema claro/escuro persistente, toasts e helpers de segurança.
 */
import { tournament, fullName, prizePool } from "./config.js";

/* ------------------------------------------------------------------ *
 * Segurança — escape de conteúdo do usuário
 * As páginas montam HTML via template strings. Sem escapar, o nome de um
 * time como `<img src=x onerror=alert(1)>` executaria script no navegador
 * do admin (XSS armazenado). SEMPRE passe dados do usuário por aqui.
 * ------------------------------------------------------------------ */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ *
 * Formatação
 * ------------------------------------------------------------------ */
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formata um número como moeda brasileira sem centavos: 250 → "R$ 250". */
export function formatBRL(value) {
  return brl.format(value).replace(/\s/g, " ");
}

/** Formata um Timestamp do Firestore, Date ou string ISO em data/hora local. */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formata apenas a data (sem horário). */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR");
}

/** Converte Timestamp do Firestore | Date | ISO string em Date (ou null). */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed;
}

/* ------------------------------------------------------------------ *
 * Conteúdo estático a partir do config
 * Preenche elementos marcados com [data-fill="chave"] usando uma única
 * fonte de verdade (config.js). Inputs recebem .value; demais, textContent.
 * ------------------------------------------------------------------ */
export function fillStaticContent() {
  const values = {
    brand: tournament.brand,
    edition: tournament.edition,
    fullName,
    game: tournament.game,
    dates: tournament.dates,
    format: tournament.format,
    maxTeams: tournament.maxTeams,
    minPlayers: tournament.minPlayers,
    fee: formatBRL(tournament.registrationFee),
    feeRaw: tournament.registrationFee,
    prizePool: formatBRL(prizePool),
    prize1: formatBRL(tournament.prizes[0]?.amount ?? 0),
    prize2: formatBRL(tournament.prizes[1]?.amount ?? 0),
    prize3: formatBRL(tournament.prizes[2]?.amount ?? 0),
    pixKey: tournament.pix.key,
    pixHolder: tournament.pix.holder,
    author: tournament.author,
    year: new Date().getFullYear(),
  };
  document.querySelectorAll("[data-fill]").forEach((el) => {
    const key = el.dataset.fill;
    if (!(key in values)) return;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.value = values[key];
    else el.textContent = values[key];
  });
}

/* ------------------------------------------------------------------ *
 * Avatares de time — cor determinística a partir do nome
 * ------------------------------------------------------------------ */
export function teamHue(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return Math.abs(h) % 360;
}

/** Gradiente para o avatar do time. */
export function teamGradient(name = "") {
  const hue = teamHue(name);
  return `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 60) % 360} 70% 55%))`;
}

/** Iniciais a partir do nome do time (fallback quando não há TAG). */
export function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ------------------------------------------------------------------ *
 * QR Code do PIX
 * ------------------------------------------------------------------ */
export function pixQrUrl(key, fee, brand) {
  const payload = `PIX: ${key} | Valor: R$ ${fee} | ${brand}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payload)}`;
}

/* ------------------------------------------------------------------ *
 * Tema claro/escuro com persistência
 * ------------------------------------------------------------------ */
const THEME_KEY = "lumix-theme";

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  // Liga qualquer botão marcado com [data-theme-toggle]
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });
  syncToggleIcons();
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* localStorage indisponível — ignora */
  }
  syncToggleIcons();
}

const SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function syncToggleIcons() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.innerHTML = theme === "dark" ? MOON : SUN;
  });
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */
let toastTimer;
export function toast(message, type = "success") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
