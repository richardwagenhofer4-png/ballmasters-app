importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Firebase config — must be hardcoded; service workers cannot access env vars
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyDj3GWOLcKJf5rteCDMa8jgv1CS2-w3G9s",
  authDomain: "ballmasters-app.firebaseapp.com",
  projectId: "ballmasters-app",
  storageBucket: "ballmasters-app.firebasestorage.app",
  messagingSenderId: "100173822895",
  appId: "1:100173822895:web:92b97243f032f77b3dcd5a",
};

// VAPID key — used by the client when calling getToken(), stored here for reference
var VAPID_KEY = "BLWMJ6in175-WbwZ3kjqjweFftkFz_KbmtZMSmCzqc4BDosLiToc5ZENuUMpZwPcF9fYD9neovYPgkkD7yQuVC8";

firebase.initializeApp(FIREBASE_CONFIG);

var messaging = firebase.messaging();

var CACHE_NAME = "ballmasters-shell-v1";

// App-shell resources to precache on install
var SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Force the SW to activate immediately without waiting for existing clients to close
self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_URLS);
    })
  );
});

self.addEventListener("activate", function (event) {
  // Delete caches from previous versions
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Network-first for API/auth requests; cache-first for static assets
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests and cross-origin requests
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Skip Next.js internals, API routes, and HMR
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("__nextjs")
  ) return;

  // Cache-first for static assets (icons, manifest, fonts)
  if (
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        return cached || fetch(event.request).then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          return response;
        });
      })
    );
    return;
  }

  // Network-first for navigation (HTML pages) — fall back to cached "/" if offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match("/") || new Response("You are offline", { status: 503 });
      })
    );
  }
});

messaging.onBackgroundMessage(function (payload) {
  var title = (payload.notification && payload.notification.title) || "Ballmasters";
  var body = (payload.notification && payload.notification.body) || "";
  var url = (payload.data && payload.data.url) || "/student/dashboard";

  self.registration.showNotification(title, {
    body: body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: url },
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/student/dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if (clientList[i].url === url && "focus" in clientList[i]) {
            return clientList[i].focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
