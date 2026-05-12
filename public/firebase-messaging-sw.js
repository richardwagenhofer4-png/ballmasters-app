importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDj3GWOLcKJf5rteCDMa8jgv1CS2-w3G9s",
  authDomain: "ballmasters-app.firebaseapp.com",
  projectId: "ballmasters-app",
  storageBucket: "ballmasters-app.firebasestorage.app",
  messagingSenderId: "100173822895",
  appId: "1:100173822895:web:92b97243f032f77b3dcd5a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload.notification?.title ?? "Ballmasters";
  const body = payload.notification?.body ?? "";
  const url = payload.data?.url ?? "/student/dashboard";

  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url },
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url ?? "/student/dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) return client.focus();
        }
        return clients.openWindow(url);
      })
  );
});
