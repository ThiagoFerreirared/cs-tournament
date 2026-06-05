/**
 * Inicialização única do Firebase (SDK modular v10).
 *
 * Todos os módulos importam `db` e `auth` daqui, garantindo uma só instância
 * do app em toda a aplicação.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);

/* ------------------------------------------------------------------ *
 * App Check (reCAPTCHA v3)
 * Rejeita requisições que não venham deste site. A "site key" é pública
 * por design.
 *
 * Só é inicializado em PRODUÇÃO. Em localhost/rede local o reCAPTCHA não
 * consegue emitir token e o SDK do Auth passa a falhar com
 * "auth/network-request-failed" — então pulamos o App Check no ambiente
 * local para permitir login/testes sem fricção. A proteção continua
 * valendo no domínio público.
 * ------------------------------------------------------------------ */
function isLocalEnv() {
  const h = location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "" ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export const appCheck = isLocalEnv()
  ? null
  : initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider("6LfzSg0tAAAAAKEpb4x-ApKVrckWq0qeTNzvScKB"),
      isTokenAutoRefreshEnabled: true,
    });

export const db = getFirestore(app);
export const auth = getAuth(app);
