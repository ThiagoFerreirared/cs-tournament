/**
 * Página pública de inscrição de times.
 */
import { tournament, prizeBreakdown } from "./config.js";
import {
  ensureDocs, watchSettings, watchTeams, isNameTaken, registerTeam,
} from "./store.js";
import {
  initTheme, fillStaticContent, toast, pixQrUrl, getInitials, formatBRL,
} from "./ui.js";

initTheme();
fillStaticContent();

// QR Code + chave PIX
document.getElementById("pix-qr").src = pixQrUrl(
  tournament.pix.key, tournament.registrationFee, tournament.brand
);

let registrationOpen = true;
let teamCount = 0;

// Premiação (bolão) ao vivo na hero + contagem de times para o limite de vagas
watchTeams((teams) => {
  teamCount = teams.length;
  const { pool } = prizeBreakdown(teams.length);
  const el = document.getElementById("hero-prize");
  if (el) el.textContent = formatBRL(pool);
  refreshRegState();
});

watchSettings((s) => {
  registrationOpen = s.registrationOpen !== false;
  refreshRegState();
});

// Reflete o estado real da inscrição: encerrada, vagas esgotadas ou aberta.
function refreshRegState() {
  const banner = document.getElementById("reg-status-banner");
  const btn = document.getElementById("btn-register");
  if (!banner) return;
  const full = teamCount >= tournament.maxTeams;
  if (!registrationOpen) {
    banner.className = "status-banner closed";
    banner.querySelector("span").textContent = "Inscrições encerradas.";
    if (btn) btn.disabled = true;
  } else if (full) {
    banner.className = "status-banner closed";
    banner.querySelector("span").textContent =
      `Vagas esgotadas — ${tournament.maxTeams} times inscritos.`;
    if (btn) btn.disabled = true;
  } else {
    banner.className = "status-banner open";
    banner.querySelector("span").textContent = "Inscrições abertas — cadastre seu time agora";
    if (btn) btn.disabled = false;
  }
}

/* ---- Ações ---- */
const $ = (id) => document.getElementById(id);

window.copyPixKey = () => {
  navigator.clipboard?.writeText(tournament.pix.key)
    .then(() => toast("Chave PIX copiada!"))
    .catch(() => toast("Não foi possível copiar.", "error"));
};

window.clearForm = () => {
  ["team-name", "team-tag", "team-contact", "team-email", "payment-note"]
    .forEach((id) => ($(id).value = ""));
  for (let i = 1; i <= tournament.maxPlayers; i++) $("player-" + i).value = "";
  hideError();
};

window.novaInscricao = () => {
  $("success-card").classList.add("hidden");
  $("form-card").classList.remove("hidden");
  window.clearForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

function showError(msg) {
  const el = $("reg-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError() {
  $("reg-error").classList.add("hidden");
}

window.registerTeam = async () => {
  hideError();
  if (!registrationOpen) return showError("Inscrições encerradas.");
  if (teamCount >= tournament.maxTeams) {
    return showError(`Vagas esgotadas — máximo de ${tournament.maxTeams} times.`);
  }

  const name = $("team-name").value.trim();
  const tag = $("team-tag").value.trim().toUpperCase();
  const contact = $("team-contact").value.trim();
  const email = $("team-email").value.trim();
  const paymentNote = $("payment-note").value.trim();

  if (!name) return showError("Nome do time é obrigatório.");

  const players = [];
  for (let i = 1; i <= tournament.maxPlayers; i++) {
    const v = $("player-" + i).value.trim();
    if (v) players.push(v);
  }
  if (players.length < tournament.minPlayers) {
    return showError(`Mínimo de ${tournament.minPlayers} jogadores obrigatório.`);
  }

  const btn = $("btn-register");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    if (await isNameTaken(name)) {
      showError("Já existe um time com este nome.");
      return;
    }
    await registerTeam({
      name, tag: tag || getInitials(name), contact, email, players, paymentNote,
    });
    $("form-card").classList.add("hidden");
    $("success-team-name").textContent =
      `Time "${name}" registrado! Aguarde a confirmação do pagamento.`;
    $("success-card").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error(e);
    showError("Erro ao enviar. Tente novamente.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
};

ensureDocs().catch((e) => console.warn("ensureDocs:", e));
