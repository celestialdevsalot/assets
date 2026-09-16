self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function addHeaders(headers) {
  const h = new Headers(headers);
  if (!h.has("Cross-Origin-Opener-Policy"))
    h.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!h.has("Cross-Origin-Embedder-Policy"))
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
  if (!h.has("Cross-Origin-Resource-Policy"))
    h.set("Cross-Origin-Resource-Policy", "cross-origin");
  return h;
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (!url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const headers = addHeaders(resp.headers);
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers,
        });
      })
      .catch(() => fetch(e.request))
  );
});
