/**
 * Cloud Functions — Lumix Fibra CS2
 *
 * Envia um e-mail de confirmação automaticamente quando um time é inscrito
 * (documento criado em `teams/{id}`).
 *
 * ────────────────────────────────────────────────────────────────────────
 * REQUISITOS (ações no Firebase, fora do código):
 *   1. Plano Blaze (Cloud Functions exige).
 *   2. Definir os segredos de SMTP:
 *        firebase functions:secrets:set SMTP_HOST
 *        firebase functions:secrets:set SMTP_USER
 *        firebase functions:secrets:set SMTP_PASS
 *      (ex.: Gmail com "senha de app", Brevo, Mailgun, etc.)
 *   3. Instalar dependências e publicar:
 *        cd functions && npm install
 *        npm run deploy
 * ────────────────────────────────────────────────────────────────────────
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");

const BRAND = "Lumix Fibra CS2";

exports.sendRegistrationEmail = onDocumentCreated(
  {
    document: "teams/{teamId}",
    region: "southamerica-east1",
    secrets: [SMTP_HOST, SMTP_USER, SMTP_PASS],
  },
  async (event) => {
    const team = event.data?.data();
    if (!team || !team.email) {
      logger.info("Time sem e-mail — nada a enviar.");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port: 465,
      secure: true,
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    });

    const players = (team.players || []).map((p) => `<li>${escape(p)}</li>`).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#141518;color:#e2e4ec;border-radius:12px;overflow:hidden">
        <div style="background:#ff4d2e;padding:20px 24px;color:#fff;font-size:20px;font-weight:bold">🏆 ${BRAND}</div>
        <div style="padding:24px">
          <h2 style="margin:0 0 8px">Inscrição recebida!</h2>
          <p style="color:#7a7d8a">Olá! Recebemos a inscrição do time <b style="color:#e2e4ec">${escape(team.name)}</b>.</p>
          <p style="color:#7a7d8a">Status do pagamento: <b style="color:#f0a030">${escape(team.paymentStatus || "pendente")}</b>.
             Assim que confirmarmos o PIX, seu time estará oficialmente no torneio.</p>
          <p style="margin:16px 0 4px;font-weight:bold">Jogadores</p>
          <ul style="color:#7a7d8a">${players}</ul>
          <p style="color:#7a7d8a;font-size:13px;margin-top:24px">Boa sorte e bom jogo! 🎮</p>
        </div>
      </div>`;

    try {
      await transporter.sendMail({
        from: `"${BRAND}" <${SMTP_USER.value()}>`,
        to: team.email,
        subject: `Inscrição recebida — ${team.name}`,
        html,
      });
      logger.info(`E-mail de confirmação enviado para ${team.email}`);
    } catch (err) {
      logger.error("Falha ao enviar e-mail:", err);
    }
  }
);

function escape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
