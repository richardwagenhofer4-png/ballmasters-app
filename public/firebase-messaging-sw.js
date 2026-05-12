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

// Force the SW to activate immediately without waiting for existing clients to close
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
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
