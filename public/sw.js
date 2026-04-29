/**
 * DataNavigator PWA Service Worker
 *
 * Goals:
 * - Cache DuckDB WASM / worker bundles after first load.
 * - Cache Next static build assets.
 * - Provide an offline app-shell fallback after first visit.
 *
 * Important:
 * - Do not cache Next RSC/router payloads.
 * - Do not cache API/auth responses.
 * - Do not cache non-GET requests.
 */

const VERSION = "datanavigator-v1";

const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const DUCKDB_CACHE = `${VERSION}-duckdb`;

const APP_SHELL_URLS = [
  "/",
  "/dashboard",
  "/dashboard/telecom-report",
];

const DUCKDB_PATTERNS = [
  /duckdb.*\.wasm$/i,
  /duckdb.*\.worker\.js$/i,
  /duckdb.*\.js$/i,
  /cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm/i,
];

function isHttpRequest(request) {
  const url = new URL(request.url);
  return url.protocol === "http:" || url.protocol === "https:";
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isApiOrAuthRequest(request) {
  const url = new URL(request.url);

  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/logout") ||
    url.pathname.startsWith("/signup")
  );
}

function isNextStaticAsset(request) {
  const url = new URL(request.url);

  return (
    isSameOrigin(request) &&
    url.pathname.startsWith("/_next/static/")
  );
}

function isNextRouterOrRscRequest(request) {
  const url = new URL(request.url);

  return (
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc")
  );
}

function isDuckDbAsset(request) {
  const url = request.url;
  return DUCKDB_PATTERNS.some((pattern) => pattern.test(url));
}

async function safeCachePut(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch {
    // Cache writes can fail for opaque responses, quota pressure, or invalid response headers.
    // Non-fatal: the app should continue working from the network.
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response?.ok) {
    await safeCachePut(cache, request, response.clone());
  }

  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response?.ok) {
        await safeCachePut(cache, request, response.clone());
      }

      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

async function navigationFallback(request) {
  const cache = await caches.open(SHELL_CACHE);

  const cachedPage = await cache.match(request);
  if (cachedPage) return cachedPage;

  try {
    const response = await fetch(request);

    if (response?.ok) {
      await safeCachePut(cache, request, response.clone());
    }

    return response;
  } catch {
    return (
      (await cache.match("/dashboard")) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {
        // Non-fatal. Some routes may not be pre-renderable or may still be auth-gated.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== SHELL_CACHE &&
                key !== STATIC_CACHE &&
                key !== DUCKDB_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (
    request.method !== "GET" ||
    !isHttpRequest(request) ||
    isApiOrAuthRequest(request) ||
    isNextRouterOrRscRequest(request)
  ) {
    return;
  }

  if (isDuckDbAsset(request)) {
    event.respondWith(cacheFirst(request, DUCKDB_CACHE));
    return;
  }

  if (isNextStaticAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (
    isSameOrigin(request) &&
    (request.destination === "style" ||
      request.destination === "script" ||
      request.destination === "font" ||
      request.destination === "image")
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});