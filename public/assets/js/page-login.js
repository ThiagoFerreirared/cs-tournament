/**
 * Login do painel administrativo.
 */
import { login, onAuthChange } from "./auth.js";
import { initTheme, fillStaticContent } from "./ui.js";

initTheme();
fillStaticContent();

// Já autenticado? vai direto para o painel.
onAuthChange((user) => {
  if (user) location.href = "admin.html";
});

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $("login-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

window.doLogin = async () => {
  $("login-error").classList.add("hidden");
  const user = $("login-user").value.trim();
  const pass = $("login-pass").value;
  const btn = $("btn-login");

  if (!user || !pass) return showError("Informe usuário e senha.");

  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    await login(user, pass);
    location.href = "admin.html";
  } catch (e) {
    if (e.message === "invalid-user") showError("Usuário não encontrado.");
    else showError("Usuário ou senha incorretos.");
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
};

// Enter envia o formulário
["login-user", "login-pass"].forEach((id) => {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.doLogin();
  });
});
