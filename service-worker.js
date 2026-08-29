const CACHE_NAME = "my-prr-warga-v0.7";
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

  // [FIX BUG - Notif Dobel di iOS, lanjutan] Kalau payload SUDAH punya
  // field "notification" (webpush.notification/display message dari
  // backend), itu artinya push service di level OS SUDAH menampilkan
  // notifikasinya secara otomatis SEBELUM handler ini sempat berjalan.
  // Di Android, FCM SDK biasanya otomatis TIDAK memanggil
  // onBackgroundMessage lagi untuk kasus ini — tapi Safari iOS diketahui
  // punya perilaku berbeda: tetap memanggil handler ini WALAU notifikasi
  // native sudah tampil, menyebabkan notifikasi muncul 2x untuk 1 pesan
  // yang sama. Solusinya: kalau payload.notification sudah ada, JANGAN
  // panggil showNotification() lagi di sini — cukup log saja untuk
  // debugging. showNotification() hanya dipanggil untuk payload DATA-ONLY
  // murni (payload.notification tidak ada), yang memang wajib kita
  // tampilkan manual karena OS tidak bisa auto-display data-only message.
  if (payload.notification) {
    console.log(
      "[service-worker.js] Payload sudah berupa display message (notifikasi native sudah/akan tampil otomatis) — skip showNotification() manual supaya tidak dobel di iOS.",
    );
    return;
  }

  const notificationTitle =
    (payload.data && payload.data.title) || "🚨 DARURAT MY PRR";

  const tag =
    (payload.data && payload.data.tag) || payload.collapseKey || "my-prr-notif";

  const notificationOptions = {
    body:
      (payload.data && payload.data.body) ||
      "Ada pemberitahuan baru dari MY PRR.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-96.png",
    vibrate: [300, 100, 300, 100, 300],
    tag: tag,
    renotify: true,
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// [FIX BUG #1 - Notif Dobel di iOS] Sebelumnya ada 2 listener terpisah yang
// SAMA-SAMA bisa memanggil showNotification() untuk pesan yang sama:
// messaging.onBackgroundMessage() di atas (bawaan SDK Firebase) DAN listener
// "push" mentah tambahan di bawah ini. Di iOS, struktur payload mentah yang
// diterima event "push" ternyata bisa berbeda dari yang diperkirakan kode
// lama (payload.notification tidak selalu terbaca sesuai harapan), sehingga
// listener kedua ini salah kira pesannya "data-only" dan ikut menampilkan
// notifikasi lagi — hasilnya notifikasi muncul 2x untuk 1 pesan yang sama.
//
// Dihapus total (bukan cuma diperbaiki syaratnya) karena jalur utama sudah
// cukup & lebih andal tanpa perlu listener kedua ini sama sekali:
// 1) webpush.notification di payload FCM membuat push service level-OS
//    browser menampilkan notifikasi otomatis, bahkan kalau SW/JS dibekukan
//    (inilah yang memperbaiki kasus Xiaomi/Redmi/Vivo sebelumnya).
// 2) messaging.onBackgroundMessage() di atas menangani sisanya dengan baik.
// Dua jalur itu sudah cukup solid tanpa perlu listener "push" mentah kedua
// yang justru menjadi sumber duplikasi.

// [FIX] Sebelumnya klik notifikasi HANYA fokus/buka app polos ("./"), tidak
// pernah membaca data referensi (postingan/aktivitas terkait) yang sekarang
// disertakan backend (lihat sendFCMv1Message di code.gs). Sekarang:
// - Kalau ada tab app yang sudah terbuka -> kirim pesan (postMessage) ke tab
//   itu supaya app.js langsung navigasi ke konten terkait tanpa reload.
// - Kalau belum ada tab terbuka -> buka tab baru dengan link tujuan yang
//   sudah disertakan backend (event.notification.data.link), app.js akan
//   baca parameter URL itu saat baru boot dan navigasi ke sana otomatis.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const refType = data.refType || "";
  const refId = data.refId || "";
  const title = data.title || "";
  const body = data.body || "";

  // [BARU] Fix #2: sertakan title/body sebagai parameter URL juga (dipakai
  // app.js sebagai fallback MODAL kalau refType tidak punya halaman/section
  // spesifik untuk dituju, mis. panic/content/payment — supaya warga tidak
  // "dibuang" ke Beranda tanpa konteks, tapi langsung lihat isi notifnya).
  let targetUrl = data.link || "./";
  try {
    const urlObj = new URL(targetUrl, self.location.origin);
    if (title) urlObj.searchParams.set("notifTitle", title);
    if (body) urlObj.searchParams.set("notifBody", body);
    targetUrl = urlObj.pathname + urlObj.search;
  } catch (e) {
    // URL tidak valid (jarang terjadi) -> pakai targetUrl apa adanya.
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            // Tab sudah terbuka -> tidak perlu reload, cukup kirim pesan
            // navigasi langsung ke app.js yang sedang berjalan.
            client.postMessage({
              type: "my-prr-notif-navigate",
              refType,
              refId,
              title,
              body,
            });
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
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
