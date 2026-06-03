/**
 * Service worker DESATIVADO (auto-destrutivo).
 *
 * Versões anteriores cacheavam o app e, em deploys, podiam servir módulos JS
 * desatualizados (mistura de arquivos antigos/novos → tela em branco). Para
 * evitar isso, este SW apenas limpa os caches, se desregistra e não intercepta
 * mais nenhuma requisição. Navegadores que ainda tenham o SW antigo registrado
 * o substituem por este na próxima visita, que então se remove sozinho.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    })()
  );
});
