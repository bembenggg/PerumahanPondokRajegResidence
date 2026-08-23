// firebase-messaging-sw.js
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

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Menerima pesan latar belakang:",
    payload,
  );

  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "🚨 DARURAT PERUMAHAN";

  const notificationOptions = {
    body:
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "Ada sinyal darurat dikirim oleh warga!",
    icon: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
    badge: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
    vibrate: [300, 100, 300, 100, 300],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
