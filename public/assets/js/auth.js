/**
 * Autenticação do painel administrativo (Firebase Auth, e-mail/senha).
 */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { adminAliases } from "./config.js";

/**
 * Resolve o que o usuário digitou para um e-mail.
 * - "thiago"            → alias configurado
 * - "fulano@dominio.com" → usado como está
 */
export function resolveEmail(input) {
  const value = (input || "").trim();
  if (value.includes("@")) return value;
  return adminAliases[value.toLowerCase()] || null;
}

/** Faz login. Lança erro se as credenciais forem inválidas. */
export async function login(userInput, password) {
  const email = resolveEmail(userInput);
  if (!email) throw new Error("invalid-user");
  await signInWithEmailAndPassword(auth, email, password);
}

/** Encerra a sessão e redireciona. */
export async function logout(redirect = "index.html") {
  await signOut(auth);
  location.href = redirect;
}

/**
 * Protege uma página de admin: se não houver sessão, redireciona para o login.
 * Chama `onReady(user)` quando há um usuário autenticado.
 */
export function requireAuth(onReady, redirect = "index.html") {
  onAuthStateChanged(auth, (user) => {
    if (user) onReady?.(user);
    else location.href = redirect;
  });
}

/** Observa mudanças de sessão sem redirecionar. */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
