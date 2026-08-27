const CACHE_NAME = "my-prr-warga-v0.18";
const urlsToCache = ["./", "./index.html", "./style.css", "./app.js"];

importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyAL3BJnxwEbNOQ-R-rJGC_w9o1c3ZVC9Fo",
  authDomain: "prr-warga-notification.firebaseapp.com",
  projectId: "prr-warga-notification",
  storageBucket: "prr-warga-notification.firebasestorage.app",
  messagingSenderId: "995899929528",
  appId: "1:995899929528:web:228b76fc6366ce2d0154d",
});

const messaging = firebase.messaging();

// CATATAN [FIX PUSH XIAOMI/REDMI/VIVO]:
// Backend sekarang mengirim payload sebagai "webpush.notification" (display
// message), bukan hanya "data". Untuk display message, browser/push service
// di level OS SUDAH menampilkan notifikasi secara otomatis SEBELUM baris
// kode di bawah ini sempat berjalan — bahkan bisa saja onBackgroundMessage
// TIDAK dipanggil sama sekali oleh FCM SDK karena notifikasi sudah tampil
// otomatis. Handler ini tetap dipertahankan sebagai fallback untuk payload
// data-only (mis. dari versi lama) dan berguna saat aplikasi berjalan di
// background tab (bukan benar-benar closed).
messaging.onBackgroundMessage((payload) => {
  console.log("[service-worker.js] Menerima pesan latar belakang:", payload);

  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "🚨 DARURAT MY PRR";

  const tag =
    (payload.notification && payload.notification.tag) ||
    (payload.data && payload.data.tag) ||
    payload.collapseKey ||
    "my-prr-notif";

  const notificationOptions = {
    body:
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "Ada pemberitahuan baru dari MY PRR.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-96.png",
    vibrate: [300, 100, 300, 100, 300],
    tag: tag,
    renotify: true,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Fallback tambahan: sebagian browser Android OEM (khususnya versi Chrome
// lama di HP MIUI/Funtouch) tidak selalu memicu onBackgroundMessage untuk
// display-message. Menangani event "push" secara langsung memastikan
// notifikasi tetap tampil selama Service Worker sempat dibangunkan sistem,
// walau hanya sesaat.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    // Jika FCM SDK (firebase-messaging-sw) sudah/akan menampilkan notifikasi
    // dari field webpush.notification, browser menanganinya secara native.
    // Blok ini hanya sebagai jaring pengaman tambahan agar tidak pernah
    // "diam saja" ketika payload berbentuk data-only.
    if (payload && payload.data && !payload.notification) {
      const title = payload.data.title || "Notifikasi MY PRR";
      const options = {
        body: payload.data.body || "",
        icon: payload.data.icon || "icons/icon-192.png",
        badge: payload.data.badge || "icons/icon-96.png",
        vibrate: [300, 100, 300, 100, 300],
        tag: payload.data.tag || "my-prr-notif",
        renotify: true,
      };
      event.waitUntil(self.registration.showNotification(title, options));
    }
  } catch (err) {
    console.error("Gagal memproses event push mentah:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow("./");
      }),
  );
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      }),
  );
});
