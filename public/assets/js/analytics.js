/**
 * Google Analytics (gtag) — usa o measurementId do config.
 * Não carrega em ambiente local, para não poluir as métricas durante o dev.
 */
import { firebaseConfig } from "./config.js";

export function initAnalytics() {
  const id = firebaseConfig.measurementId;
  const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if (!id || local || window.__ga_loaded) return;
  window.__ga_loaded = true;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id);
}
