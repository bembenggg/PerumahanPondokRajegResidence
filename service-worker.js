// service-worker.js
// Gabungan: Caching PWA + Firebase Cloud Messaging (background push)

const CACHE_NAME = "my-prr-warga-v1.1"; // dinaikkan supaya SW lama ter-replace
const urlsToCache = ["./", "./index.html", "./style.css", "./app.js"];

// ---------- FIREBASE MESSAGING (background push) ----------
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

// ====== PERBAIKAN #1: NOTIF DOBEL ======
// "tag" membuat notifikasi dengan tag yang sama SALING MENGGANTI, bukan
// menumpuk jadi 2 entri terpisah di notification tray.
// "renotify: true" tetap membuat HP bergetar/berbunyi saat notif diganti,
// jadi warga tetap sadar ada notif baru walau cuma 1 entri yang tampil.
//
// PENTING: solusi permanen ada di BACKEND (Apps Script). Pastikan request
// ke FCM HANYA berisi field "data" (JANGAN sertakan field "notification").
// Kalau field "notification" ikut dikirim, browser akan menampilkan
// notifikasi otomatis DAN kode di bawah ini akan menampilkan notifikasi
// lagi -> itulah sumber notif dobel yang Anda alami.
messaging.onBackgroundMessage((payload) => {
  console.log("[service-worker.js] Menerima pesan latar belakang:", payload);

  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "🚨 DARURAT MY PRR";

  const tag =
    (payload.data && payload.data.tag) || payload.collapseKey || "my-prr-notif";

  const notificationOptions = {
    body:
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "Ada sinyal darurat dikirim oleh warga!",
    // Ganti ke path lokal (lihat perbaikan #3) agar ikon konsisten di semua OS.
    icon: "icons/icon-192.png",
    badge: "icons/icon-96.png",
    vibrate: [300, 100, 300, 100, 300],
    tag: tag,
    renotify: true,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
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

// ---------- CACHING PWA (install / activate / fetch) ----------
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
