const DEFAULT_BILL = 120000;
const PROFILE_KEY = "pondok-rajeg-profile-data";
const ROLE_KEY = "pondok_rajeg_role";
const NOTIF_SEEN_KEY = "pondok_rajeg_notif_seen";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxkooeosCRLUrNxw18RZF9Epzn4_gfjj6YhOD71wqLOJUBQ9Oq2t7AZvc6RicDTMhjXKg/exec";

const firebaseConfig = {
  apiKey: "AIzaSyAL3BJnxwEbNOQ-R-rJGC_w9o1c3ZVC9Fo",
  authDomain: "prr-warga-notification.firebaseapp.com",
  projectId: "prr-warga-notification",
  storageBucket: "prr-warga-notification.firebasestorage.app",
  messagingSenderId: "995899929528",
  appId: "1:995899929528:web:228b76fc6366ce2d0154d",
};

let loadingDotsInterval = null;

function startLoadingDotsAnimation() {
  const dotsEl = document.getElementById("loadingDots");
  if (!dotsEl) return;
  let count = 0;
  if (loadingDotsInterval) clearInterval(loadingDotsInterval);
  loadingDotsInterval = setInterval(() => {
    count = (count + 1) % 4; // Berputar 0, 1, 2, 3 titik
    dotsEl.textContent = ".".repeat(count);
  }, 400);
}

function stopLoadingDotsAnimation() {
  if (loadingDotsInterval) {
    clearInterval(loadingDotsInterval);
    loadingDotsInterval = null;
  }
}

let techScanInterval = null;

function startTechScannerAnimation() {
  const statusEl = document.getElementById("techStatusText");
  const dotsEl = document.getElementById("loadingDots");
  if (!statusEl) return;

  const messages = [
    "Membaca matrix piksel dokumen...",
    "Mengekstrak parameter finansial...",
    "Memvalidasi checksum referensi...",
    "Mencocokkan enkripsi bank...",
  ];

  let msgIndex = 0;
  let dotCount = 0;

  if (techScanInterval) clearInterval(techScanInterval);
  techScanInterval = setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    if (dotsEl) dotsEl.textContent = ".".repeat(dotCount);

    // Ganti teks status secara berkala setiap 1.2 detik
    if (dotCount === 0) {
      msgIndex = (msgIndex + 1) % messages.length;
      statusEl.textContent = messages[msgIndex];
    }
  }, 400);
}

function stopTechScannerAnimation() {
  if (techScanInterval) {
    clearInterval(techScanInterval);
    techScanInterval = null;
  }
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();
const db = firebase.firestore();

function buildNotifTag(payload) {
  return (
    (payload.notification && payload.notification.tag) ||
    (payload.data && payload.data.tag) ||
    payload.collapseKey ||
    "my-prr-notif"
  );
}

messaging.onMessage((payload) => {
  console.log("📥 Pesan diterima saat aplikasi aktif:", payload);
  const title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "Notifikasi MY PRR";
  const body =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    "";
  const tag = buildNotifTag(payload);

  showToast(title + ": " + body);

  if (Notification.permission === "granted") {
    new Notification(title, {
      body: body,
      icon: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
      vibrate: [300, 100, 300, 100, 300],
      tag: tag,
    });
  }

  // Segarkan daftar lonceng begitu ada pesan masuk.
  loadNotifications();
});

// [BARU] Fix: mengklasifikasi error teknis dari browser (mis. "Registration
// failed - push service error") menjadi KODE PENDEK yang gampang di-filter
// di spreadsheet oleh developer — bukan lagi ditampilkan sebagai alert
// panjang ke warga. Detail teknis lengkapnya tetap dicatat apa adanya ke
// sheet "PushErrorLogs" (lihat logPushErrorToServer), supaya developer bisa
// langsung analisis penyebab & pola per-perangkat tanpa warga harus
// membaca/memahami pesan teknis sama sekali.
function classifyPushError(rawMessage) {
  const msg = String(rawMessage || "").toLowerCase();
  if (
    msg.includes("push service error") ||
    msg.includes("registration failed") ||
    msg.includes("aborterror")
  ) {
    return "PUSH_SERVICE_ERROR"; // umum di HP Xiaomi/Redmi (MIUI) & Vivo — Google Play Services bermasalah
  }
  if (msg.includes("messaging/permission-blocked") || msg.includes("denied")) {
    return "PERMISSION_BLOCKED";
  }
  if (
    msg.includes("messaging/token-subscribe-failed") ||
    msg.includes("token-unsubscribe-failed")
  ) {
    return "TOKEN_SUBSCRIBE_FAILED";
  }
  if (msg.includes("no token")) {
    return "NO_TOKEN_RETURNED";
  }
  return "UNKNOWN_ERROR";
}

// Mengirim detail error ke spreadsheet (sheet "PushErrorLogs") secara diam-
// diam di belakang layar — tidak pernah mengganggu UX warga sama sekali,
// bahkan kalau pengiriman log ini sendiri gagal (mis. lagi offline).
async function logPushErrorToServer(errorCode, errorMessage) {
  try {
    const unit = localStorage.getItem("pondok_rajeg_user") || "Tamu";
    const name = localStorage.getItem("pondok_rajeg_name") || unit;
    await sendToBackend(
      "logPushError",
      {
        unit,
        name,
        errorCode,
        errorMessage: String(errorMessage || ""),
        userAgent: navigator.userAgent || "",
        platform: navigator.platform || "",
      },
      { silent: true },
    );
  } catch (err) {
    console.error("Gagal mencatat error push ke server:", err);
  }
}

// [BARU] Modal modern untuk hasil aktivasi push notification — dipisah dari
// pemanggilan otomatis (lihat parameter isManualRetry di bawah), supaya
// TIDAK muncul mengganggu setiap kali warga login (requestNotificationPermission
// dipanggil otomatis tiap bootSession). Modal ini hanya tampil saat warga
// SECARA SADAR menekan tombol "Coba Aktifkan Ulang Notifikasi" di Profil.
function showPushSuccessModal() {
  const dialog = $("#pushSuccessDialog");
  if (dialog) dialog.showModal();
}

function showPushErrorModal() {
  const dialog = $("#pushErrorDialog");
  if (dialog) dialog.showModal();
}

async function requestNotificationPermission(isManualRetry = false) {
  if (!("Notification" in window)) return;
  try {
    // [BARU] Fix #iOS: sebelumnya SELALU memanggil Notification.requestPermission()
    // ulang setiap login (dipanggil otomatis lewat bootSession). Di Safari
    // iOS, memanggil ini di luar konteks user-gesture langsung (bukan reaksi
    // klik tombol) kadang tidak mengembalikan status yang akurat, WALAU izin
    // sebenarnya sudah "granted" sebelumnya — inilah kemungkinan penyebab
    // toast "notifikasi tidak aktif" muncul terus padahal sudah diizinkan.
    // Sekarang kita cek dulu status yang SUDAH tersimpan (properti sinkron,
    // tidak butuh gesture) — hanya minta ulang kalau memang belum pernah
    // diputuskan ("default").
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission === "granted") {
      const swRegistration = await navigator.serviceWorker.ready;

      const token = await messaging.getToken({
        vapidKey:
          "BPzVsG95x8uvmworbflPPJRBee81eTjCHvh8kkSlerKB5YdNyFnYhbov8qYwThcbkE1fE7yHj1GfSjMz22VyngA",
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        const unit = localStorage.getItem("pondok_rajeg_user") || "Tamu";
        try {
          await sendToBackend(
            "saveFCMToken",
            { unit, token },
            { silent: true },
          );
          // [BARU] Modal sukses HANYA muncul kalau ini percobaan manual
          // (tombol "Coba Aktifkan Ulang Notifikasi"). Saat dipanggil
          // otomatis tiap login, sukses tetap SENYAP — tidak perlu
          // mengganggu warga dengan modal setiap kali buka app.
          if (isManualRetry) showPushSuccessModal();
        } catch (saveErr) {
          // [BARU] Fix #3/#4: sebelumnya kegagalan simpan token ke server
          // DIAM-DIAM saja (hanya console.error) — warga tidak pernah tahu
          // kalau HP-nya sebenarnya TIDAK terdaftar utk menerima push. Kalau
          // ini terjadi terus-menerus di banyak HP, itulah sebabnya notif
          // tidak pernah muncul sama sekali di perangkat manapun.
          console.error("Gagal menyimpan token FCM ke server:", saveErr);
          logPushErrorToServer("SAVE_TOKEN_FAILED", saveErr && saveErr.message);
          if (isManualRetry) showPushErrorModal();
        }
      } else {
        // getToken() berhasil dipanggil tapi tidak mengembalikan token sama
        // sekali — biasanya karena push service browser di HP ini gagal
        // registrasi (umum terjadi di sebagian besar browser OEM Android).
        console.error("messaging.getToken() tidak mengembalikan token.");
        logPushErrorToServer(
          "NO_TOKEN_RETURNED",
          "messaging.getToken() returned empty/null",
        );
        if (isManualRetry) showPushErrorModal();
      }
    } else {
      if (isManualRetry) {
        showPushErrorModal();
      } else {
        showToast(
          "Izin notifikasi belum aktif. Aktifkan agar bisa menerima sinyal darurat warga.",
        );
      }
    }
  } catch (error) {
    // [BARU] Fix: sebelumnya error di sini ditampilkan sebagai alert panjang
    // berisi langkah troubleshooting teknis — membingungkan buat warga awam.
    // Detail teknis lengkapnya (kode error + pesan asli browser + user agent
    // HP) otomatis tercatat ke spreadsheet "PushErrorLogs" supaya developer
    // bisa langsung mendiagnosis tanpa warga perlu melapor manual. Warga
    // sendiri cukup dapat modal singkat & menenangkan (hanya saat mencoba
    // manual — saat otomatis di background, cukup senyap).
    console.error("Gagal mendapatkan token notifikasi:", error);
    const errorCode = classifyPushError(error && error.message);
    logPushErrorToServer(errorCode, error && error.message);
    if (isManualRetry) showPushErrorModal();
  }
}

const $ = (selector) => document.querySelector(selector);
const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

// [BARU] Fix #3: timeout + pesan kontekstual terpusat — SEMUA pemanggilan
// backend lewat fungsi ini (dipakai hampir seluruh tombol simpan di app),
// jadi cukup diperbaiki di SATU tempat. Kalau server lambat merespons
// (>20 detik) atau koneksi terputus, pesan errornya jelas & actionable,
// bukan sekadar hang tanpa penjelasan.
async function sendToBackend(action, data, options = {}) {
  if (!APPS_SCRIPT_URL) return false;
  // [BARU] Fix #3: opsi { silent: true } dipakai untuk panggilan LATAR
  // BELAKANG (polling notifikasi, cek versi konten, ambil profil/dashboard,
  // dsb) supaya TIDAK memunculkan modal "Server Sedang Padat" — modal itu
  // hanya untuk aksi SIMPAN yang eksplisit ditekan warga/admin. Panggilan
  // senyap tetap melempar error seperti biasa (form pemanggil yang menangani).
  const silent = options.silent === true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 detik

  let response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action, data }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // [BARU] Fix #3: sebelumnya error koneksi/timeout ini cuma dilempar
    // sebagai Error biasa — tampilannya jadi tergantung masing-masing form
    // (kebanyakan cuma toast singkat yang gampang terlewat). Sekarang untuk
    // aksi SIMPAN (bukan panggilan senyap), selalu ditampilkan lewat MODAL
    // terpusat, konsisten di SEMUA tombol Simpan di seluruh aplikasi.
    if (err.name === "AbortError") {
      if (!silent) {
        showAppModal(
          "Server Sedang Padat",
          "Server MY PRR sedang padat / responsnya lambat. Mohon tunggu sebentar, lalu coba simpan lagi.",
          false,
        );
      }
      throw new Error(
        "Server MY PRR sedang padat, mohon tunggu sebentar lalu coba simpan lagi.",
      );
    }
    if (!silent) {
      showAppModal(
        "Gagal Terhubung",
        "Gagal terhubung ke server. Periksa koneksi internet Anda, lalu coba simpan lagi.",
        false,
      );
    }
    throw new Error(
      "Gagal terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.",
    );
  }
  clearTimeout(timeoutId);

  let result;
  try {
    result = await response.json();
  } catch (err) {
    // [BARU] Fix #3: server merespons tapi bukan JSON valid (mis. HTML error
    // page dari Apps Script saat sedang overload) — untuk aksi Simpan, tetap
    // ditampilkan lewat modal yang sama, bukan dianggap sukses diam-diam.
    if (!silent) {
      showAppModal(
        "Server Sedang Padat",
        "Server MY PRR sedang padat / merespons tidak sesuai. Mohon tunggu sebentar lalu coba simpan lagi.",
        false,
      );
    }
    throw new Error(
      "Server MY PRR sedang padat / merespons tidak sesuai. Mohon tunggu sebentar lalu coba simpan lagi.",
    );
  }
  if (!result.ok) throw new Error(result.message || "Gagal menyimpan data.");
  return result;
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4500);
}

function showAppModal(title, message, isSuccess = true) {
  const dialog = $("#appMessageDialog");
  const titleEl = $("#appMessageTitle");
  const textEl = $("#appMessageText");
  const eyebrowEl = $("#appMessageEyebrow");
  const iconBox = $("#appMessageIconBox");
  const iconEl = $("#appMessageIcon");
  const closeBtn = $("#appMessageCloseBtn");

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = message;
  if (eyebrowEl) eyebrowEl.style.color = isSuccess ? "var(--green)" : "#dc2626";
  if (iconBox) {
    iconBox.className =
      "modal-icon-box " + (isSuccess ? "success-bg" : "danger-bg");
  }
  if (iconEl) iconEl.textContent = isSuccess ? "verified_user" : "gpp_bad";
  if (closeBtn)
    closeBtn.style.background = isSuccess ? "var(--green)" : "#dc2626";

  if (dialog) dialog.showModal();
}

// [BARU] Fix #3: modal khusus kegagalan SIMPAN (bukan toast yang cuma 4.5
// detik & gampang tidak sempat terbaca). Pesan otomatis dibedakan: kalau
// penyebabnya server lambat/timeout, disebutkan eksplisit "server sedang
// padat" — kalau sebab lain, tampilkan pesan error apa adanya. Selalu
// mendorong untuk mencoba lagi.
function showSaveFailureModal(err) {
  const rawMessage =
    (err && err.message) || "Terjadi kesalahan yang tidak diketahui.";
  const isServerBusy =
    rawMessage.includes("padat") ||
    rawMessage.includes("terhubung ke server") ||
    rawMessage.includes("merespons tidak sesuai");

  const message = isServerBusy
    ? rawMessage +
      "\n\nData Anda BELUM tersimpan. Silakan coba tekan tombol Simpan sekali lagi."
    : rawMessage +
      "\n\nSilakan periksa kembali data Anda, lalu coba simpan lagi.";

  showAppModal(
    isServerBusy ? "Server Sedang Padat" : "Gagal Menyimpan",
    message,
    false,
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let latestUnpaidMonths = [];

async function refreshDashboard(unit) {
  if (!unit) return null;
  const result = await sendToBackend(
    "getDashboard",
    { unit },
    { silent: true },
  );
  if (!result || !result.ok)
    throw new Error((result && result.message) || "Gagal memuat data.");

  latestUnpaidMonths = result.unpaidMonths || [];

  renderBillStatus(result.billStatus);
  renderArrears(result.arrears);
  renderFinance(result.finance);
  renderMonthlyHistory(result.history);

  return result;
}

function renderBillStatus(billStatus) {
  const currentBillEl = $("#currentBill");
  const chip = $("#billStatus");
  if (!billStatus) return;

  if (currentBillEl) {
    currentBillEl.textContent = billStatus.currentMonthPaid
      ? "Lunas"
      : rupiah(billStatus.currentBillAmount);
  }
  if (chip) {
    chip.textContent = billStatus.currentMonthPaid
      ? "Pembayaran tercatat"
      : "Belum dibayar";
    chip.style.color = billStatus.currentMonthPaid ? "#087a4b" : "";
    chip.style.background = billStatus.currentMonthPaid ? "#dcf8e6" : "";
  }
}

function renderArrears(arrears) {
  const warningSection = $("#arrearsWarningSection");
  const warningCard = $("#warningCardContainer");
  const warningIconBox = warningCard
    ? warningCard.querySelector(".warning-icon-box")
    : null;
  const warningTitle = $("#warningTitle");
  const warningDesc = $("#warningDesc");
  const unpaidMonthsText = $("#unpaidMonthsText");

  if (!warningSection || !arrears) return;
  const count = arrears.count || 0;

  if (count >= 3) {
    warningSection.style.display = "block";
    if (unpaidMonthsText)
      unpaidMonthsText.textContent = (arrears.months || []).join(", ");

    if (count >= 5) {
      if (warningCard) {
        warningCard.style.background =
          "linear-gradient(135deg, #b91c1c, #991b1b)";
        warningCard.style.borderColor = "#fca5a5";
        warningCard.style.color = "#ffffff";
      }
      if (warningIconBox) {
        warningIconBox.style.background = "#ef4444";
        warningIconBox.style.color = "#ffffff";
      }
      if (warningTitle) {
        warningTitle.textContent = "PEMBERITAHUAN TEGAS PENGURUS";
        warningTitle.style.color = "#ffffff";
      }
      if (warningDesc) {
        warningDesc.innerHTML = `Tunggakan IPL Anda telah mencapai <b style="color: #fde047;">${count} bulan</b>. Layanan <b style="color: #fff;">pengangkutan sampah di rumah Anda dihentikan sementara</b> hingga kewajiban diselesaikan.`;
        warningDesc.style.color = "#fef2f2";
      }
    } else {
      if (warningCard) {
        warningCard.style.background =
          "linear-gradient(135deg, #fefce8, #fef9c3)";
        warningCard.style.borderColor = "#fde047";
        warningCard.style.color = "#713f12";
      }
      if (warningIconBox) {
        warningIconBox.style.background = "#ca8a04";
        warningIconBox.style.color = "#ffffff";
      }
      if (warningTitle) {
        warningTitle.textContent = "SURAT PERINGATAN RESMI PAGUYUBAN PRR";
        warningTitle.style.color = "#854d0e";
      }
      if (warningDesc) {
        warningDesc.innerHTML = `Tunggakan IPL terdeteksi selama <span id="unpaidCount">${count}</span> bulan. Layanan pengambilan sampah di rumah Anda berisiko ditangguhkan jika tidak segera diselesaikan.`;
        warningDesc.style.color = "#713f12";
      }
    }
  } else {
    warningSection.style.display = "none";
  }
}

function renderFinance(finance) {
  if (!finance) return;
  const totalCashEl = $("#totalCashFlow");
  const totalExpenseEl = $("#totalExpense");
  const netBalanceEl = $("#netBalance");

  if (totalCashEl) totalCashEl.textContent = rupiah(finance.income);
  if (totalExpenseEl) totalExpenseEl.textContent = rupiah(finance.expense);
  if (netBalanceEl) netBalanceEl.textContent = rupiah(finance.net);

  const reportList = $("#financeReportList");
  if (reportList) {
    const items = (finance.monthlyBreakdown || []).slice(0, 3);
    reportList.innerHTML = items.length
      ? items
          .map(
            (m) => `
      <div class="activity">
        <div class="activity-icon income"><span class="material-symbols-rounded">trending_up</span></div>
        <div class="activity-text">
          <b>${m.label}</b>
          <small>Masuk: ${rupiah(m.income)} • Keluar: ${rupiah(m.expense)}</small>
        </div>
        <div class="activity-amount text-success">${m.net >= 0 ? "+" : ""}${rupiah(m.net)}</div>
      </div>`,
          )
          .join("")
      : `<div class="empty-state-box">Belum ada data laporan keuangan.</div>`;
  }

  const monthlyContent = $("#monthlyFinanceContent");
  if (monthlyContent) {
    const items = finance.monthlyBreakdown || [];
    monthlyContent.innerHTML = items.length
      ? items
          .map(
            (m) => `
      <article class="finance-detail-item">
        <b>${m.label}</b>
        <p>Pemasukan: ${rupiah(m.income)} | Pengeluaran: ${rupiah(m.expense)}</p>
        <small class="text-success">Saldo Bersih Bulan Ini: ${rupiah(m.net)}</small>
      </article>`,
          )
          .join("")
      : `<div class="empty-state-box">Belum ada data keuangan bulanan.</div>`;
  }

  const yearlyContent = $("#yearlyFinanceContent");
  if (yearlyContent && finance.yearBreakdown) {
    const y = finance.yearBreakdown;
    yearlyContent.innerHTML = `
      <article class="finance-detail-item">
        <b>Tahun ${y.year} (Berjalan)</b>
        <p>Total Pemasukan: ${rupiah(y.income)} | Total Pengeluaran: ${rupiah(y.expense)}</p>
        <small class="text-success">Akumulasi Kas Bersih: ${rupiah(y.net)}</small>
      </article>`;
  }
}

function statusVisual(status) {
  if (status === "Lunas")
    return { icon: "event_available", cls: "text-success", iconCls: " income" };
  if (status === "Ditolak")
    return { icon: "cancel", cls: "text-danger", iconCls: "" };
  return { icon: "hourglass_top", cls: "", iconCls: "" };
}

function renderMonthlyHistory(history) {
  const list = $("#monthlyHistoryList");
  if (!list) return;
  if (!history || !history.length) {
    list.innerHTML = `<div class="empty-state-box">Belum ada riwayat pembayaran tercatat untuk rumah Anda.</div>`;
    return;
  }
  list.innerHTML = history
    .map((h) => {
      const v = statusVisual(h.status);
      return `
    <div class="activity">
      <div class="activity-icon${v.iconCls}"><span class="material-symbols-rounded">${v.icon}</span></div>
      <div class="activity-text">
        <b>${h.months || "-"}</b>
        <small>${h.status} • ${h.method} • ${h.date}</small>
      </div>
      <div class="activity-amount ${v.cls}">${rupiah(h.amount)}</div>
    </div>`;
    })
    .join("");
}

let notificationCache = [];
let notifPollInterval = null;

function notifIconFor(type) {
  switch (String(type || "").toLowerCase()) {
    case "panic":
      return "🚨";
    case "post":
      return "📝";
    case "trash":
      return "🚛";
    case "expense":
      return "💸";
    case "payment":
      return "💳";
    case "complaint":
      return "📣";
    case "content":
      return "🗂️";
    case "comment":
      return "💬";
    default:
      return "📢";
  }
}

function renderNotificationList() {
  const box = $("#notificationListContent");
  if (!box) return;

  if (!notificationCache.length) {
    box.innerHTML = `<div class="empty-state-box">Belum ada notifikasi. Pengumuman pengurus dan sinyal darurat warga akan muncul di sini.</div>`;
    return;
  }

  const lastSeen = Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0);
  box.innerHTML = notificationCache
    .map((n) => {
      const isNew = Number(n.millis || 0) > lastSeen;
      // [BARU] Fix #2: notifikasi terkait postingan/komentar sekarang bisa
      // diklik, langsung menuju postingan yang dimaksud di Update Warga.
      const clickable = n.refType === "post" && n.refId;
      return `
      <div class="notification-item-card${isNew ? " notif-new" : ""}${clickable ? " notif-clickable" : ""}"${clickable ? ` data-ref-post="${escapeHtml(n.refId)}"` : ""}>
        <b>${notifIconFor(n.type)} ${escapeHtml(n.title)}</b>
        <p>${escapeHtml(n.body)}</p>
        <span class="notif-time">${escapeHtml(n.date || "")}</span>
        ${clickable ? `<span class="notif-goto-hint">Lihat postingan →</span>` : ""}
      </div>`;
    })
    .join("");

  box.querySelectorAll("[data-ref-post]").forEach((el) => {
    el.addEventListener("click", () => {
      const postId = el.dataset.refPost;
      $("#notificationDialog")?.close();
      goToPost(postId);
    });
  });
}

// [BARU] Fix #2: scroll ke postingan tertentu di feed Update Warga & beri
// efek highlight sesaat, supaya warga langsung tahu postingan mana yang
// dimaksud notifikasi yang baru saja diklik.
function goToPost(postId) {
  // [BARU] Fix #4/#6: karena Update Warga sekarang halaman terpisah
  // (#feedPageView, defaultnya display:none), pindah ke halaman itu dulu
  // sebelum coba scroll — kalau tidak, scrollIntoView tidak akan berefek
  // apa-apa pada elemen yang sedang disembunyikan.
  if (typeof window.showAppPage === "function") window.showAppPage("feed");

  const tryScroll = (attempt) => {
    const el = document.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("post-highlight");
      setTimeout(() => el.classList.remove("post-highlight"), 2200);
      return;
    }
    // Postingan mungkin belum ter-render (mis. dialog feed belum dibuka atau
    // baru saja dimuat) — coba beberapa kali sebelum menyerah.
    if (attempt < 5) setTimeout(() => tryScroll(attempt + 1), 300);
  };
  tryScroll(0);
}

// [BARU] Navigasi terpusat dari klik PUSH NOTIFICATION (bukan cuma badge
// lonceng in-app yang sudah lebih dulu berfungsi). Dipanggil dari 2 jalur:
// 1) postMessage dari service worker, kalau tab app SUDAH terbuka saat
//    notifikasi di-tap (lihat listener "message" di bawah).
// 2) parameter URL (?refType=...&refId=...), kalau notifikasi di-tap saat
//    app BELUM terbuka sama sekali (service worker buka tab baru lewat
//    clients.openWindow, lihat notificationclick di service-worker.js).
function handleNotifNavigation(refType, refId, title, body) {
  if (refType === "post" && refId) {
    goToPost(refId);
  } else if (refType === "complaint") {
    if (typeof window.showAppPage === "function") window.showAppPage("home");
    setTimeout(() => {
      $("#complaintList")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 350);
  } else if (title || body) {
    // [BARU] Fix #2: refType lain (panic/content/payment/expense/trash/dll)
    // TIDAK punya halaman/section khusus untuk dituju — daripada warga
    // dibawa ke Beranda tanpa konteks (lalu bingung notifikasi ini soal
    // apa), langsung tampilkan ISI notifikasinya lewat modal.
    showAppModal(title || "Notifikasi", body || "", true);
  }
}

// Jalur 1: app SUDAH terbuka di tab lain saat notifikasi ditekan.
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "my-prr-notif-navigate") {
      handleNotifNavigation(
        event.data.refType,
        event.data.refId,
        event.data.title,
        event.data.body,
      );
    }
  });
}

// Jalur 2: app baru dibuka lewat notifikasi (tab baru), refType/refId/
// notifTitle/notifBody datang lewat parameter URL (dibangun service worker
// saat clients.openWindow). Ditunda beberapa saat supaya app sempat boot
// (login otomatis, data feed dimuat) dulu sebelum mencoba navigasi.
(function checkNotifDeepLinkOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const refType = params.get("refType");
  const notifTitle = params.get("notifTitle");
  const notifBody = params.get("notifBody");
  if (!refType && !notifTitle) return;
  const refId = params.get("refId") || "";

  // Bersihkan URL supaya parameter ini tidak ke-trigger ulang kalau
  // halaman di-refresh manual nanti.
  window.history.replaceState({}, "", window.location.pathname);

  const tryNavigate = (attempt) => {
    const mainApp = $("#mainApp");
    const isBooted = mainApp && mainApp.style.display !== "none";
    if (isBooted) {
      handleNotifNavigation(
        refType || "",
        refId,
        notifTitle || "",
        notifBody || "",
      );
      return;
    }
    if (attempt < 10) setTimeout(() => tryNavigate(attempt + 1), 400);
  };
  tryNavigate(0);
})();

function updateNotifBadge() {
  const btn = $("#notificationBtn");
  if (!btn) return;

  const lastSeen = Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0);
  const unreadCount = notificationCache.filter(
    (n) => Number(n.millis || 0) > lastSeen,
  ).length;

  let badge = btn.querySelector(".notif-badge-count");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "notif-badge-count";
    badge.style.cssText =
      "position: absolute; top: 6px; right: 6px; background: #dc2626; color: white; font-size: 10px; font-weight: bold; padding: 1px 5px; border-radius: 10px; min-width: 16px; text-align: center; line-height: 1.2; box-shadow: 0 2px 4px rgba(0,0,0,0.2);";

    if (getComputedStyle(btn).position === "static") {
      btn.style.position = "relative";
    }
    btn.appendChild(badge);
  }

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? "99+" : unreadCount;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

async function loadNotifications() {
  const unit = localStorage.getItem("pondok_rajeg_user") || "";
  if (!unit) return;
  try {
    const result = await sendToBackend(
      "getNotifications",
      { unit },
      { silent: true },
    );
    notificationCache = (result && result.notifications) || [];
  } catch (err) {
    console.error("Gagal memuat notifikasi:", err);
  }
  renderNotificationList();
  updateNotifBadge();
}

function startNotifPolling() {
  if (notifPollInterval) return;
  notifPollInterval = setInterval(loadNotifications, 120000);
}

function stopNotifPolling() {
  if (notifPollInterval) {
    clearInterval(notifPollInterval);
    notifPollInterval = null;
  }
}

let unsubscribePostsListener = null;
let latestPostsSnapshotDocs = [];
let feedTimeRefreshInterval = null;
// [BARU] Fix #5: sebelumnya feed dibatasi 5 postingan awal (+5 tiap klik
// "Muat Lebih Banyak"). Sekarang dibuat "unlimited" — semua postingan yang
// sudah diambil dari Firestore (lihat .limit di attachPostsListener) langsung
// tampil semua tanpa perlu klik apa pun, biar warga bebas scroll & posting.
let visiblePostsCount = Infinity;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRelativeTimeID(date) {
  if (!date || isNaN(date.getTime())) return "";
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const timeStr = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffSec < 30) return "Baru saja";
  if (diffMin < 1) return `${diffSec} detik lalu`;
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  if (diffDay === 1) return `Kemarin pukul ${timeStr}`;
  if (diffDay < 7) return `${diffDay} hari lalu`;

  const dateStr = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  return `${dateStr} pukul ${timeStr}`;
}

function resizeImageToDataUrl(file, maxWidth, quality) {
  maxWidth = maxWidth || 900;
  quality = quality || 0.6;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function attachPostsListener() {
  if (unsubscribePostsListener) return;
  unsubscribePostsListener = db
    .collection("posts")
    .orderBy("createdAt", "desc")
    // [BARU] Fix #5: dinaikkan dari 50 supaya linimasa terasa lebih
    // "unlimited" untuk komunitas yang aktif, tanpa query jadi terlalu berat.
    .limit(200)
    .onSnapshot(
      (snapshot) => {
        latestPostsSnapshotDocs = snapshot.docs;
        renderSocialFeed();
      },
      (err) => {
        console.error("Gagal memuat feed real-time:", err);
        const feedList = $("#socialFeedList");
        if (feedList)
          feedList.innerHTML = `<div class="empty-state-box">Gagal memuat postingan warga.</div>`;
      },
    );

  if (!feedTimeRefreshInterval) {
    feedTimeRefreshInterval = setInterval(() => {
      if (latestPostsSnapshotDocs.length) renderSocialFeed();
    }, 60000);
  }
}

function detachPostsListener() {
  if (unsubscribePostsListener) {
    unsubscribePostsListener();
    unsubscribePostsListener = null;
  }
  if (feedTimeRefreshInterval) {
    clearInterval(feedTimeRefreshInterval);
    feedTimeRefreshInterval = null;
  }
  latestPostsSnapshotDocs = [];
}

function renderSocialFeed() {
  const feedList = $("#socialFeedList");
  if (!feedList) return;
  const myUnitKey = (localStorage.getItem("pondok_rajeg_user") || "")
    .trim()
    .toLowerCase();
  const myRole = localStorage.getItem(ROLE_KEY) || "warga";

  if (!latestPostsSnapshotDocs.length) {
    feedList.innerHTML = `<div class="empty-state-box">Belum ada postingan. Jadilah warga pertama yang berbagi! 👋</div>`;
    return;
  }

  const totalPosts = latestPostsSnapshotDocs.length;
  const visibleDocs = latestPostsSnapshotDocs.slice(0, visiblePostsCount);

  let html = visibleDocs
    .map((doc) => {
      const data = doc.data();
      const id = doc.id;
      const createdAtDate =
        data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate()
          : new Date();
      const likes = data.likes || {};
      const likedByMe = !!likes[myUnitKey];
      const likeCount = Object.keys(likes).length;
      const comments = Array.isArray(data.comments)
        ? data.comments.slice()
        : [];
      comments.sort(
        (a, b) => (a.createdAtMillis || 0) - (b.createdAtMillis || 0),
      );
      const initial = (data.name || "W").trim().charAt(0).toUpperCase();

      const postUnitKey = (data.unit || "").trim().toLowerCase();
      const canDelete = postUnitKey === myUnitKey || myRole === "admin";

      const commentsHtml = comments.length
        ? comments
            .map((c, cIdx) => {
              const commentUnitKey = (c.unit || "").trim().toLowerCase();
              const canDeleteComment =
                commentUnitKey === myUnitKey || myRole === "admin";
              return `
            <div class="social-comment" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div style="flex: 1; min-width: 0;">
                <b>${escapeHtml(c.name)}</b> <span>${escapeHtml(c.text)}</span>
                <small>${formatRelativeTimeID(new Date(c.createdAtMillis || Date.now()))}</small>
              </div>
              ${
                canDeleteComment
                  ? `<button type="button" class="comment-delete-btn" data-delete-comment="${id}" data-comment-index="${cIdx}" title="Hapus komentar" style="border:none; background:none; color:#dc2626; cursor:pointer; padding:2px;"><span class="material-symbols-rounded" style="font-size: 14px;">close</span></button>`
                  : ""
              }
            </div>`;
            })
            .join("")
        : `<small style="color: var(--muted);">Belum ada komentar.</small>`;

      return `
    <article class="social-post" data-post-id="${id}">
      <div class="social-post-header">
        <div class="social-post-header-left">
          <span class="social-avatar">${escapeHtml(initial)}</span>
          <div class="social-post-meta">
            <b>${escapeHtml(data.name || "Warga")}</b>
            <small>${escapeHtml(data.unit || "-")} · ${formatRelativeTimeID(createdAtDate)}</small>
          </div>
        </div>
        ${canDelete ? `<button type="button" class="social-delete-btn" data-delete-post="${id}" title="Hapus postingan"><span class="material-symbols-rounded">delete</span></button>` : ""}
      </div>
      ${data.text ? `<p class="social-post-text">${escapeHtml(data.text)}</p>` : ""}
      ${data.imageDataUrl ? `<img class="social-post-image" src="${data.imageDataUrl}" alt="Foto postingan warga" loading="lazy" />` : ""}
      <div class="social-post-stats">
        <span>${likeCount} suka</span>
        <button type="button" class="text-link-btn" data-comment-toggle="${id}">${comments.length} komentar</button>
      </div>
      <div class="social-post-actions">
        <button type="button" class="social-action-btn${likedByMe ? " liked" : ""}" data-like="${id}">
          <span class="material-symbols-rounded">${likedByMe ? "favorite" : "favorite_border"}</span> Suka
        </button>
        <button type="button" class="social-action-btn" data-comment-toggle="${id}">
          <span class="material-symbols-rounded">chat_bubble_outline</span> Komentar
        </button>
      </div>
      <div class="social-comments" id="comments-${id}" style="display: none;">
        <div class="social-comments-list">
          ${commentsHtml}
        </div>
        <form class="social-comment-form" data-comment-form="${id}">
          <input type="text" name="commentText" placeholder="Tulis komentar..." required maxlength="300" />
          <button type="submit"><span class="material-symbols-rounded">send</span></button>
        </form>
      </div>
    </article>`;
    })
    .join("");

  if (totalPosts > visiblePostsCount) {
    const remainingCount = totalPosts - visiblePostsCount;
    html += `
      <button type="button" id="loadMorePostsBtn">
        Muat Lebih Banyak (${remainingCount} postingan lainnya) ⬇️
      </button>
    `;
  }

  feedList.innerHTML = html;
  bindSocialFeedEvents();
}

function bindSocialFeedEvents() {
  const feedList = $("#socialFeedList");
  if (!feedList) return;

  const loadMoreBtn = $("#loadMorePostsBtn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visiblePostsCount += 5;
      renderSocialFeed();
    });
  }

  feedList.querySelectorAll("[data-delete-post]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const postId = btn.dataset.deletePost;
      if (!confirm("Yakin ingin menghapus postingan ini?")) return;
      try {
        await db.collection("posts").doc(postId).delete();
        showToast("Postingan berhasil dihapus.");
      } catch (err) {
        showToast(`Gagal menghapus postingan: ${err.message}`);
      }
    });
  });

  feedList.querySelectorAll("[data-delete-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const postId = btn.dataset.deleteComment;
      const commentIndex = Number(btn.dataset.commentIndex);
      if (!confirm("Yakin ingin menghapus komentar ini?")) return;

      try {
        const postRef = db.collection("posts").doc(postId);
        await db.runTransaction(async (tx) => {
          const docSnap = await tx.get(postRef);
          if (!docSnap.exists) return;
          const comments = Array.isArray(docSnap.data().comments)
            ? docSnap.data().comments.slice()
            : [];
          if (comments[commentIndex]) {
            comments.splice(commentIndex, 1);
            tx.update(postRef, { comments: comments });
          }
        });
        showToast("Komentar berhasil dihapus.");
      } catch (err) {
        showToast(`Gagal menghapus komentar: ${err.message}`);
      }
    });
  });

  feedList.querySelectorAll("[data-like]").forEach((btn) => {
    btn.addEventListener("click", () => toggleLike(btn.dataset.like));
  });
  feedList.querySelectorAll("[data-comment-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = $(`#comments-${btn.dataset.commentToggle}`);
      if (box)
        box.style.display = box.style.display === "none" ? "block" : "none";
    });
  });
  feedList.querySelectorAll("[data-comment-form]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const postId = form.dataset.commentForm;
      const input = form.querySelector("input[name='commentText']");
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      try {
        await submitComment(postId, text);
        input.value = "";
      } catch (err) {
        showToast(`Gagal mengirim komentar: ${err.message}`);
      } finally {
        input.disabled = false;
      }
    });
  });
}

async function toggleLike(postId) {
  const unit = localStorage.getItem("pondok_rajeg_user");
  if (!unit) return;
  const unitKey = unit.trim().toLowerCase();
  const name = localStorage.getItem("pondok_rajeg_name") || unit;
  const postRef = db.collection("posts").doc(postId);
  try {
    // [BARU] Fix #1: perlu tahu apakah ini AKSI MENAMBAH suka (bukan
    // membatalkan) dan siapa pemilik post-nya, supaya notifikasi cuma
    // dikirim saat ada suka BARU (bukan tiap kali toggle), dan hanya ke
    // pemilik postingan — bukan broadcast ke semua warga.
    let didLike = false;
    let ownerUnit = "";
    let ownerName = "";
    let postSnippet = "";
    await db.runTransaction(async (tx) => {
      const docSnap = await tx.get(postRef);
      if (!docSnap.exists) return;
      const postData = docSnap.data();
      const likes = Object.assign({}, postData.likes || {});
      if (likes[unitKey]) {
        delete likes[unitKey];
        didLike = false;
      } else {
        likes[unitKey] = true;
        didLike = true;
        ownerUnit = postData.unit || "";
        ownerName = postData.name || "";
        postSnippet = String(postData.text || "").slice(0, 80);
      }
      tx.update(postRef, { likes: likes });
    });

    if (didLike && ownerUnit) {
      try {
        await sendToBackend(
          "notifyLike",
          {
            unit,
            name,
            postOwnerUnit: ownerUnit,
            postOwnerName: ownerName,
            postId,
            postSnippet,
          },
          { silent: true },
        );
      } catch (err) {
        // Jangan ganggu UX like utama kalau pengiriman notifikasi gagal —
        // suka-nya sendiri tetap tersimpan di Firestore di atas.
        console.error("Gagal mengirim notifikasi suka:", err);
      }
    }
  } catch (err) {
    showToast(`Gagal memproses suka: ${err.message}`);
  }
}

async function submitComment(postId, text) {
  const unit = localStorage.getItem("pondok_rajeg_user") || "";
  const name = localStorage.getItem("pondok_rajeg_name") || unit;
  const postRef = db.collection("posts").doc(postId);
  await postRef.update({
    comments: firebase.firestore.FieldValue.arrayUnion({
      unit,
      name,
      text,
      createdAtMillis: Date.now(),
    }),
  });

  // [FIX #1] Sebelumnya komentar di-broadcast ke SEMUA warga. Sekarang
  // ditargetkan ke pemilik postingan saja (backend yang menentukan,
  // butuh postOwnerUnit — bukan cuma nama — supaya bisa ditargetkan tepat).
  try {
    const snap = await postRef.get();
    const postOwnerUnit = snap.exists ? snap.data().unit || "" : "";
    const postOwnerName = snap.exists ? snap.data().name || "" : "";
    await sendToBackend(
      "notifyComment",
      { unit, name, text, postOwnerUnit, postOwnerName, postId },
      { silent: true },
    );
  } catch (err) {
    // Jangan ganggu UX komentar utama kalau pengiriman notifikasi gagal —
    // komentarnya sendiri tetap tersimpan di atas.
    console.error("Gagal mengirim notifikasi komentar:", err);
  }
}

function monthBadgeMeta(category) {
  if (category === "overdue")
    return { text: "Tunggakan", cls: "badge-overdue" };
  if (category === "current")
    return { text: "Bulan Ini", cls: "badge-current" };
  return { text: "Bayar di Muka", cls: "badge-advance" };
}

function renderMonthsPicker(unpaidMonths) {
  const container = $("#monthsPickerContainer");
  if (!container) return;

  if (!unpaidMonths || !unpaidMonths.length) {
    container.innerHTML = `<div class="empty-state-box" style="border: 0;">🎉 Semua tagihan IPL Anda sudah lunas.</div>`;
    updateSelectedMonthsSummary();
    return;
  }

  container.innerHTML = unpaidMonths
    .map((item, idx) => {
      const badge = monthBadgeMeta(item.category);
      return `
    <label class="month-row" data-month="${item.label}">
      <input type="checkbox" name="selectedMonth" value="${item.label}" ${idx === 0 ? "checked" : ""} />
      <span class="month-row-info">
        <b>${item.label}</b>
        <small class="month-badge ${badge.cls}">${badge.text}</small>
      </span>
      <span class="month-row-check"><span class="material-symbols-rounded">check</span></span>
    </label>`;
    })
    .join("");

  container.querySelectorAll(".month-row").forEach((row) => {
    const checkbox = row.querySelector("input");
    const syncState = () => row.classList.toggle("checked", checkbox.checked);
    syncState();
    checkbox.addEventListener("change", () => {
      syncState();
      updateSelectedMonthsSummary();
    });
  });

  updateSelectedMonthsSummary();
}

function getSelectedMonths() {
  return Array.from(
    document.querySelectorAll(
      "#monthsPickerContainer input[name='selectedMonth']:checked",
    ),
  ).map((el) => el.value);
}

function updateSelectedMonthsSummary() {
  const selected = getSelectedMonths();
  const total = selected.length * DEFAULT_BILL;
  const modalBillEl = $("#modalBill");
  const countEl = $("#modalBillMonthsCount");
  const hiddenAmount = $("#paymentAmountHidden");

  if (modalBillEl) modalBillEl.textContent = rupiah(total);
  if (countEl) {
    countEl.textContent = selected.length
      ? `${selected.length} bulan dipilih: ${selected.join(", ")}`
      : "Belum ada bulan dipilih";
  }
  if (hiddenAmount) hiddenAmount.value = total;
}

function updatePaymentMethodUI(method) {
  const note = $("#paymentMethodNote");
  const proofLabelText = $("#proofLabelText");
  if (!note || !proofLabelText) return;

  if (method === "Tunai ke petugas") {
    note.className = "payment-method-note cash-note";
    note.innerHTML = `⚠️ <b>Metode Tunai:</b> Serahkan uang tunai kepada Pengurus Paguyuban PRR bagian keuangan, lalu foto kwitansi/tanda terima sebagai bukti.`;
    proofLabelText.textContent =
      "Bukti Serah Terima Tunai (Foto Kwitansi) — Wajib";
  } else {
    note.className = "payment-method-note";
    note.innerHTML = `💡 Transfer wajib ke <b>Bank Jago a.n Muhamad Kurnia Fauqou Nur (504460167350)</b>.`;
    proofLabelText.textContent = "Bukti Transfer (Foto / PDF) — Wajib";
  }
}

let currentPending = [];
let rejectTarget = null;

function applyRoleUI(role) {
  const adminQuickBtn = $("#adminQuickBtn");
  if (adminQuickBtn)
    adminQuickBtn.style.display = role === "admin" ? "flex" : "none";
  const expenseAdminBtn = $("#expenseAdminBtn");
  if (expenseAdminBtn)
    expenseAdminBtn.style.display = role === "admin" ? "flex" : "none";
  const contentAdminBtn = $("#contentAdminBtn");
  if (contentAdminBtn)
    contentAdminBtn.style.display = role === "admin" ? "flex" : "none";
  const userAdminBtn = $("#userAdminBtn");
  if (userAdminBtn)
    userAdminBtn.style.display = role === "admin" ? "flex" : "none";

  // Susun ulang carousel "Akses cepat" karena jumlah kartu yang tampil berubah
  // (kartu khusus admin baru saja disembunyikan/ditampilkan di atas).
  buildQuickAccessCarousel();
}

// Jumlah kartu per halaman menyesuaikan lebar layar:
// - Mobile (<1024px): grid 3 kolom x 2 baris = 6 kartu/halaman
// - Desktop/website (>=1024px): grid 4 kolom x 2 baris = 8 kartu/halaman
const QUICK_DESKTOP_BREAKPOINT = 1024;
function getQuickCardsPerPage() {
  return window.innerWidth >= QUICK_DESKTOP_BREAKPOINT ? 8 : 6;
}

// Cache daftar node kartu asli (diambil sekali dari #quickGridSource).
// PENTING: setelah build pertama, kartu-kartu ini dipindah (reparent) ke
// dalam #quickCarousel, jadi #quickGridSource akan kosong. Build berikutnya
// (misal saat logout/login ganti role) HARUS memakai cache ini, bukan
// query ulang ke #quickGridSource, atau kartunya akan hilang semua.
let _quickCardsCache = null;

/**
 * Mengambil semua kartu "Akses cepat" yang seharusnya terlihat (sesuai role),
 * lalu membaginya jadi halaman @QUICK_CARDS_PER_PAGE kartu / halaman, dan
 * merender carousel geser horizontal + indikator titik + label "x dari y Halaman".
 * Dipanggil ulang setiap kali role berubah (login/logout) agar kartu admin
 * yang baru muncul/hilang tetap terhitung dengan benar dalam paginasi.
 */
function buildQuickAccessCarousel() {
  const carousel = $("#quickCarousel");
  const pager = $("#quickPager");
  const pagerLabel = $("#quickPagerLabel");
  const pagerDots = $("#quickPagerDots");
  if (!carousel) return;

  if (!_quickCardsCache) {
    const source = $("#quickGridSource");
    if (!source) return;
    _quickCardsCache = Array.from(source.querySelectorAll(".quick-card"));
  }

  // Ambil hanya kartu yang tidak disembunyikan (misal kartu admin utk warga biasa)
  const allCards = _quickCardsCache.filter(
    (card) => card.style.display !== "none",
  );

  // Kosongkan carousel lama, lalu bangun ulang per-halaman
  carousel.innerHTML = "";
  const perPage = getQuickCardsPerPage();
  const totalPages = Math.max(1, Math.ceil(allCards.length / perPage));

  for (let p = 0; p < totalPages; p++) {
    const pageEl = document.createElement("div");
    pageEl.className = "quick-page";
    const pageCards = allCards.slice(p * perPage, p * perPage + perPage);
    pageCards.forEach((card) => {
      card.style.display = "flex";
      pageEl.appendChild(card);
    });
    carousel.appendChild(pageEl);
  }

  // Pager (label + titik) hanya tampil kalau lebih dari 1 halaman
  if (pager && pagerLabel && pagerDots) {
    if (totalPages <= 1) {
      pager.style.display = "none";
    } else {
      pager.style.display = "flex";
      pagerDots.innerHTML = "";
      for (let p = 0; p < totalPages; p++) {
        const dot = document.createElement("span");
        dot.className = "dot" + (p === 0 ? " active" : "");
        pagerDots.appendChild(dot);
      }
      pagerLabel.textContent = `1 dari ${totalPages} Halaman`;
    }
  }

  // Update label + titik aktif saat pengguna menggeser carousel
  if (!carousel.dataset.scrollBound) {
    carousel.dataset.scrollBound = "1";
    carousel.addEventListener("scroll", () => {
      const pageWidth = carousel.clientWidth || 1;
      const currentPage = Math.round(carousel.scrollLeft / pageWidth);
      const pages = carousel.querySelectorAll(".quick-page").length;
      if (pagerLabel) {
        pagerLabel.textContent = `${Math.min(currentPage + 1, pages)} dari ${pages} Halaman`;
      }
      if (pagerDots) {
        pagerDots.querySelectorAll(".dot").forEach((dot, idx) => {
          dot.classList.toggle("active", idx === currentPage);
        });
      }
    });
  }

  // Bangun ulang carousel kalau layar melewati breakpoint desktop (misal jendela
  // di-resize atau tablet diputar), supaya jumlah kartu/halaman ikut berubah
  // (3x2 di mobile <-> 4x2 di desktop) tanpa perlu reload halaman.
  if (!window._quickResizeBound) {
    window._quickResizeBound = true;
    let lastIsDesktop = window.innerWidth >= QUICK_DESKTOP_BREAKPOINT;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nowIsDesktop = window.innerWidth >= QUICK_DESKTOP_BREAKPOINT;
        if (nowIsDesktop !== lastIsDesktop) {
          lastIsDesktop = nowIsDesktop;
          buildQuickAccessCarousel();
        }
      }, 200);
    });
  }
}

async function loadAdminPending() {
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  if (!adminUnit) return;
  const listEl = $("#pendingList");
  if (listEl) listEl.innerHTML = shimmerListHtml(3);

  try {
    const result = await sendToBackend(
      "adminListPending",
      { adminUnit },
      { silent: true },
    );
    currentPending = result.pending || [];
    renderAdminPending();
  } catch (err) {
    if (listEl)
      listEl.innerHTML = `<div class="empty-state-box">Gagal memuat: ${err.message}</div>`;
  }
}

function extractDriveFileId(url) {
  if (!url) return null;
  const match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function showAdminDetail(item) {
  const titleEl = $("#adminDetailTitle");
  const metaEl = $("#adminDetailMeta");
  const previewEl = $("#adminProofPreview");
  const confirmBtn = $("#adminDetailConfirmBtn");
  const rejectBtn = $("#adminDetailRejectBtn");

  if (titleEl) titleEl.textContent = `${item.unit} · ${item.name}`;
  if (metaEl) {
    metaEl.innerHTML = `
      <div><span>Nominal</span>${rupiah(item.amount)}</div>
      <div><span>Bulan</span>${item.months || "-"}</div>
      <div><span>Metode</span>${item.method}</div>
      <div><span>Waktu Kirim</span>${item.timestamp}</div>
    `;
  }

  if (previewEl) {
    const fileId = extractDriveFileId(item.buktiUrl);
    if (fileId) {
      previewEl.innerHTML = `<iframe src="https://drive.google.com/file/d/${fileId}/preview" allow="autoplay"></iframe>`;
    } else if (item.buktiUrl) {
      previewEl.innerHTML = `<div class="empty-state-box" style="border: 0;">Pratinjau tidak tersedia. <a href="${item.buktiUrl}" target="_blank" rel="noopener">Buka bukti di tab baru</a></div>`;
    } else {
      previewEl.innerHTML = `<div class="empty-state-box" style="border: 0;">Tidak ada bukti terlampir.</div>`;
    }
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Konfirmasi Lunas";
    confirmBtn.onclick = () => confirmAdminPayment(item, confirmBtn, true);
  }
  if (rejectBtn) {
    rejectBtn.onclick = () => {
      rejectTarget = item;
      const reasonInput = $("#rejectReasonText");
      if (reasonInput) reasonInput.value = "";
      $("#adminDetailDialog")?.close();
      $("#rejectReasonDialog")?.showModal();
    };
  }

  $("#adminDetailDialog")?.showModal();
}

function renderAdminPending() {
  const listEl = $("#pendingList");
  if (!listEl) return;

  if (!currentPending.length) {
    listEl.innerHTML = `<div class="empty-state-box">🎉 Tidak ada pembayaran tunai yang menunggu verifikasi saat ini.</div>`;
    return;
  }

  listEl.innerHTML = currentPending
    .map(
      (p, idx) => `
    <div class="pending-card">
      <div class="pending-card-header">
        <div>
          <b>${p.unit} · ${p.name}</b>
          <small>${p.timestamp}</small>
        </div>
        <div class="pending-amount">${rupiah(p.amount)}</div>
      </div>
      <div class="pending-meta">
        <div><span>Bulan:</span> ${p.months || "-"}</div>
        <div><span>Metode:</span> ${p.method}</div>
      </div>
      <button type="button" class="text-link-btn" data-detail="${idx}" style="margin-bottom: 10px;">
        <span class="material-symbols-rounded" style="font-size: 14px; vertical-align: middle;">visibility</span>
        Lihat Detail & Bukti
      </button>
      <div class="pending-actions">
        <button type="button" class="primary-button" data-confirm="${idx}">Konfirmasi Lunas</button>
        <button type="button" class="primary-button btn-reject" data-reject="${idx}">Tolak</button>
      </div>
    </div>`,
    )
    .join("");

  listEl.querySelectorAll("[data-detail]").forEach((btn) => {
    btn.addEventListener("click", () =>
      showAdminDetail(currentPending[Number(btn.dataset.detail)]),
    );
  });
  listEl.querySelectorAll("[data-confirm]").forEach((btn) => {
    btn.addEventListener("click", () =>
      confirmAdminPayment(currentPending[Number(btn.dataset.confirm)], btn),
    );
  });
  listEl.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rejectTarget = currentPending[Number(btn.dataset.reject)];
      const reasonInput = $("#rejectReasonText");
      if (reasonInput) reasonInput.value = "";
      $("#rejectReasonDialog")?.showModal();
    });
  });
}

async function confirmAdminPayment(item, btnEl, closeDetail) {
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = "Memproses...";
  }
  try {
    const result = await sendToBackend("adminConfirmPayment", {
      adminUnit,
      rowIndex: item.rowIndex,
      timestamp: item.timestamp,
      unit: item.unit,
    });
    if (closeDetail) $("#adminDetailDialog")?.close();
    showToast(result.message);
    loadAdminPending();
  } catch (err) {
    showSaveFailureModal(err);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = "Konfirmasi Lunas";
    }
  }
}

let currentExpenses = [];

function renderExpenses() {
  const listEl = $("#expenseList");
  if (!listEl) return;

  if (!currentExpenses.length) {
    listEl.innerHTML = `<div class="empty-state-box">Belum ada pengeluaran tercatat. Setiap kas keluar yang dicatat di sini langsung masuk ke laporan keuangan warga.</div>`;
    return;
  }

  listEl.innerHTML = currentExpenses
    .map(
      (e, idx) => `
    <div class="expense-row">
      <div class="expense-row-main">
        <b>${escapeHtml(e.description || "-")}</b>
        <small>${escapeHtml(e.category || "Lainnya")} • ${escapeHtml(e.date || "-")}</small>
      </div>
      <div class="expense-row-side">
        <span class="text-danger">${rupiah(e.amount)}</span>
        <button type="button" class="expense-delete-btn" data-expense-delete="${idx}" title="Hapus pengeluaran">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
    </div>`,
    )
    .join("");

  listEl.querySelectorAll("[data-expense-delete]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteExpense(currentExpenses[Number(btn.dataset.expenseDelete)]),
    );
  });
}

async function loadExpenses() {
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  const listEl = $("#expenseList");
  if (!adminUnit || !listEl) return;
  listEl.innerHTML = shimmerListHtml(3);
  try {
    const result = await sendToBackend(
      "adminListExpenses",
      { adminUnit },
      { silent: true },
    );
    currentExpenses = (result && result.expenses) || [];
    renderExpenses();
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

async function deleteExpense(item) {
  if (!item) return;
  if (!confirm(`Hapus pengeluaran "${item.description}"?`)) return;
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  try {
    const result = await sendToBackend("adminDeleteExpense", {
      adminUnit,
      rowIndex: item.rowIndex,
      description: item.description,
    });
    showToast(result.message);
    loadExpenses();
    const unit = localStorage.getItem("pondok_rajeg_user");
    if (unit) refreshDashboard(unit).catch(() => {});
  } catch (err) {
    showToast(`Gagal: ${err.message}`);
  }
}

// ============================================================
// [BARU] KARTU KONTEN DINAMIS — JASA & INTERNET, DARURAT MEDIS,
// PENGUMUMAN WARGA, DAN DOKUMEN PENGURUS PAGUYUBAN. Semua diambil
// dari sheet "ContentCards" via backend dan dikelola oleh Petugas
// RT lewat dialog "Kelola Konten".
// ============================================================

// Logo default MY PRR — dipakai sebagai gambar fallback untuk kartu/artikel
// yang tidak dilampiri URL gambar oleh admin (fix #1 & #3).
const CONTENT_DEFAULT_IMAGE = "icons/icon-512.png";

const CONTENT_TYPE_META = {
  jasa: {
    label: "Jasa",
    icon: "handyman",
    accent: "wrench",
    emptyText:
      "Belum ada jasa/internet yang ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "Hubungi via WhatsApp",
  },
  internet: {
    label: "Internet & TV Kabel",
    icon: "wifi",
    accent: "wifi",
    emptyText:
      "Belum ada provider internet yang ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "Hubungi Provider",
  },
  kesehatan: {
    label: "Darurat Medis",
    icon: "medical_services",
    accent: "health",
    emptyText:
      "Belum ada layanan medis darurat yang ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "Hubungi Layanan",
  },
  pengumuman: {
    label: "Pengumuman",
    icon: "campaign",
    accent: "info",
    emptyText: "Belum ada pengumuman warga.",
    waLabel: "",
  },
  adart: {
    label: "Dokumen Pengurus Paguyuban",
    icon: "picture_as_pdf",
    accent: "info",
    emptyText:
      "Dokumen pengurus paguyuban belum ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "",
  },
  // [BARU] Jadwal Tukang Sampah & Security — pakai TimeStart/TimeEnd untuk
  // menampilkan jam shift & badge "Sedang Bertugas" otomatis.
  sampah: {
    label: "Jadwal Tukang Sampah",
    icon: "local_shipping",
    accent: "trash",
    emptyText:
      "Jadwal petugas sampah belum ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "Hubungi Petugas",
  },
  security: {
    label: "Jadwal Security",
    icon: "shield_person",
    accent: "security",
    emptyText:
      "Jadwal petugas security belum ditambahkan Pengurus Paguyuban PRR.",
    waLabel: "Chat Pos Satpam",
  },
  // [BARU] Fix #4: Inventaris Warga — dinamis, admin isi nama barang &
  // status ketersediaannya sendiri lewat "Kelola Konten".
  inventaris: {
    label: "Inventaris Warga",
    icon: "inventory_2",
    accent: "info",
    emptyText: "Belum ada data inventaris.",
    waLabel: "",
  },
};

// Badge ikon/gambar kecil untuk tiap kartu konten (fix #1). Kalau admin
// melampirkan URL gambar, tampilkan gambarnya; kalau tidak, tampilkan ikon
// bulat berwarna sesuai kategori supaya tetap menarik & mudah dibedakan.
function contentThumbHtml(item, type, sizeClass) {
  const meta = CONTENT_TYPE_META[type] || {};
  const size = sizeClass || "";
  if (item && item.imageUrl) {
    return `<div class="content-thumb ${size}"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "")}" loading="lazy" onerror="this.onerror=null;this.src='${CONTENT_DEFAULT_IMAGE}';this.classList.add('content-thumb-fallback');" /></div>`;
  }
  return `<div class="content-thumb content-thumb-icon ${meta.accent || ""} ${size}"><span class="material-symbols-rounded">${meta.icon || "auto_awesome"}</span></div>`;
}

function waLink(phone, message) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message || "")}`;
}

// ------------------------------------------------------------
// [BARU] JADWAL TUKANG SAMPAH & SECURITY — badge "Sedang Bertugas" otomatis
// berdasarkan jam saat ini vs TimeStart/TimeEnd. Menangani shift yang
// melewati tengah malam (mis. 22:00–06:00) dengan benar.
// ------------------------------------------------------------
function isCurrentlyOnDuty(timeStart, timeEnd) {
  if (!timeStart || !timeEnd) return false;
  const toMinutes = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const start = toMinutes(timeStart);
  const end = toMinutes(timeEnd);
  if (start === null || end === null) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (start === end) return false; // rentang kosong/tidak valid
  if (start < end) {
    // Shift normal dalam satu hari (mis. 06:00 - 14:00)
    return nowMinutes >= start && nowMinutes < end;
  }
  // Shift lewat tengah malam (mis. 22:00 - 06:00)
  return nowMinutes >= start || nowMinutes < end;
}

function formatTimeRange(timeStart, timeEnd) {
  if (!timeStart && !timeEnd) return "";
  return `${timeStart || "--:--"} – ${timeEnd || "--:--"}`;
}

// [BARU] Fix #4/#5/#6: nama hari Indonesia sesuai index Date.getDay()
// (0=Minggu). Dipakai untuk rostering mingguan Tukang Sampah & Security.
const DAY_NAMES_ID_CLIENT = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const MONTH_ABBR_ID_CLIENT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function todayNameId() {
  return DAY_NAMES_ID_CLIENT[new Date().getDay()];
}

// [BARU] Format "Senin, 15 Sep 2026" — dipakai bersama jam pada kartu duty
// (Security/Sampah), sesuai format yang diminta: "Senin, dd mmm yyyy hh:MM".
function formatTodayDateId() {
  const now = new Date();
  return `${now.getDate()} ${MONTH_ABBR_ID_CLIENT[now.getMonth()]} ${now.getFullYear()}`;
}

function formatDutyDateTime(timeStart, timeEnd) {
  const dayDate = `${todayNameId()}, ${formatTodayDateId()}`;
  const timeRange = formatTimeRange(timeStart, timeEnd);
  return timeRange
    ? `${dayDate} • ${timeRange}`
    : `${dayDate} • Jam belum diatur`;
}

function parseDaysField(daysStr) {
  return String(daysStr || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

function formatDaysBadge(daysStr) {
  const days = parseDaysField(daysStr);
  if (!days.length) return "Setiap Hari";
  // Singkat jadi 3 huruf per hari biar chip tidak kepanjangan (mis. "Sen, Rab, Jum")
  return days.map((d) => d.slice(0, 3)).join(", ");
}

// Kartu berlaku hari ini kalau field Days kosong (berarti "setiap hari")
// ATAU daftar harinya memuat nama hari ini.
function isScheduledToday(daysStr) {
  const days = parseDaysField(daysStr);
  if (!days.length) return true;
  return days.includes(todayNameId());
}

// [BARU] Fix #3: kalau beberapa petugas bertugas di shift yang PERSIS sama
// (hari & jam sama) hari ini, gabungkan jadi satu baris alih-alih beberapa
// kartu terpisah — supaya card tidak "kepanjangan" saat banyak orang jaga
// bersamaan. 2 nama digabung pakai "&", 3+ nama dipisah koma.
function joinDutyNames(titles) {
  if (titles.length <= 1) return titles[0] || "";
  if (titles.length === 2) return titles.join(" & ");
  return titles.join(", ");
}

function groupDutyItemsByShift(items) {
  const groups = [];
  const indexByKey = {};
  items.forEach((it) => {
    const key = `${it.timeStart || ""}|${it.timeEnd || ""}`;
    if (!(key in indexByKey)) {
      indexByKey[key] = groups.length;
      groups.push({
        timeStart: it.timeStart,
        timeEnd: it.timeEnd,
        titles: [],
        subtitle: it.subtitle || "",
        description: it.description || "",
        // [BARU] Fix #2: simpan nama+nomor PER ORANG (bukan cuma 1 nomor
        // representatif) — supaya kalau nomornya beda-beda, warga bisa
        // pilih tepat mau menghubungi siapa (lihat renderDutyItems).
        people: [],
      });
    }
    const g = groups[indexByKey[key]];
    g.titles.push(it.title);
    g.people.push({ name: it.title, phone: it.phone || "" });
    if (!g.subtitle && it.subtitle) g.subtitle = it.subtitle;
    if (!g.description && it.description) g.description = it.description;
  });
  return groups;
}

// [BARU] Fix #2: kalau semua orang di shift yang sama pakai NOMOR YANG SAMA
// (atau cuma 1 orang yang punya nomor), tombol WA tunggal sudah cukup jelas.
// Tapi kalau nomornya BEDA-BEDA antar orang, satu tombol saja jadi ambigu —
// warga tidak tahu itu menghubungi siapa. Jadi ditampilkan sebagai daftar
// kontak terpisah per orang, masing-masing jelas namanya.
function renderDutyContactSection(group, meta) {
  const peopleWithPhone = group.people.filter((p) => p.phone);
  if (!peopleWithPhone.length) return "";

  const uniquePhones = [...new Set(peopleWithPhone.map((p) => p.phone))];
  // Betul-betul nomor BERSAMA hanya kalau SEMUA orang di shift ini memakai
  // nomor yang sama (mis. line pos bersama). Kalau cuma SEBAGIAN yang punya
  // nomor (mis. 2 orang jaga, cuma 1 yang isi WA), itu BUKAN nomor bersama —
  // label harus jelas menyebut punya siapa nomor itu.
  const allShareSamePhone =
    uniquePhones.length === 1 && peopleWithPhone.length === group.people.length;

  if (uniquePhones.length === 1) {
    // [FIX BUG] Sebelumnya variabel "label" dihitung tapi TIDAK PERNAH
    // dipakai di teks tombol — makanya tombol selalu tampil generik "Chat
    // Pos Satpam" walau nomornya sebenarnya cuma milik SATU orang, bikin
    // warga bingung sedang menghubungi siapa. Sekarang label tombol
    // eksplisit menyebut nama pemilik nomor kalau bukan nomor bersama.
    const namesWithPhone = joinDutyNames(peopleWithPhone.map((p) => p.name));
    const buttonLabel = allShareSamePhone
      ? meta.waLabel || "Chat WhatsApp"
      : `Chat WA ${namesWithPhone}`;
    return `<a href="${waLink(uniquePhones[0], `Halo ${namesWithPhone}, saya warga MY PRR ingin menghubungi...`)}" target="_blank" class="whatsapp-btn duty-wa-btn">
              <span class="material-symbols-rounded">chat</span> ${escapeHtml(buttonLabel)}
            </a>`;
  }

  // Nomor berbeda-beda -> tampilkan sebagai pilihan kontak terpisah per orang.
  return `
    <div class="duty-contact-list">
      <span class="duty-contact-label">Hubungi:</span>
      ${peopleWithPhone
        .map(
          (p) => `
        <a href="${waLink(p.phone, `Halo ${p.name}, saya warga MY PRR ingin menghubungi...`)}" target="_blank" class="duty-contact-chip">
          <span class="material-symbols-rounded">chat</span>${escapeHtml(p.name)}
        </a>`,
        )
        .join("")}
    </div>`;
}

function renderDutyItems(items, box, type) {
  if (!box) return;
  const meta = CONTENT_TYPE_META[type] || {};

  // Fix #4/#5/#6: card di beranda hanya menampilkan jadwal yang berlaku HARI
  // INI (rostering mingguan) — bukan seluruh kartu dari semua hari sekaligus,
  // supaya warga langsung lihat siapa yang bertugas hari ini tanpa bingung.
  const todayItems = items.filter((it) => isScheduledToday(it.days));

  if (!todayItems.length) {
    box.innerHTML = "";
    return;
  }

  // Fix #3: gabungkan entri dengan jam shift yang sama persis, supaya kartu
  // tidak membengkak saat banyak orang bertugas di shift yang sama.
  const groupedItems = groupDutyItemsByShift(todayItems);

  // [BARU] Desain disederhanakan mengikuti referensi: teks langsung di atas
  // gradient (tanpa kotak putih transparan bertumpuk), badge status di kiri
  // atas, ikon kategori di kanan atas. Kalau lebih dari 1 entri hari ini
  // (mis. shift pagi & malam), dipisah garis tipis, bukan kotak terpisah.
  box.innerHTML = `
    <div class="duty-card duty-card-${type}">
      <div class="duty-header-row">
        <div class="duty-badge-pulse">
          <span class="pulse-dot"></span>
          <span>${escapeHtml(meta.label || "")} • Siaga Hari Ini</span>
        </div>
        <span class="material-symbols-rounded duty-shield">${meta.icon || "shield_person"}</span>
      </div>
      ${groupedItems
        .map((g, idx) => {
          const onDuty = isCurrentlyOnDuty(g.timeStart, g.timeEnd);
          const namesJoined = joinDutyNames(g.titles);
          return `
        <div class="duty-entry${idx > 0 ? " duty-entry-divider" : ""}">
          <div class="duty-body-top">
            <b>${escapeHtml(namesJoined)}${g.subtitle ? ` <span class="duty-subtitle-inline">— ${escapeHtml(g.subtitle)}</span>` : ""}</b>
            ${onDuty ? `<span class="duty-active-badge">🟢 Bertugas</span>` : ""}
          </div>
          <p class="duty-datetime">${escapeHtml(formatDutyDateTime(g.timeStart, g.timeEnd))}</p>
          ${g.description ? `<p class="duty-desc">${escapeHtml(g.description)}</p>` : ""}
          ${renderDutyContactSection(g, meta)}
        </div>`;
        })
        .join("")}
    </div>`;
}

async function loadDutySchedule(type, boxSelector) {
  const box = $(boxSelector);
  if (!box) return;
  const cache = readContentCache();
  const cachedItems = cache && Array.isArray(cache[type]) ? cache[type] : null;

  // Fix #3: kalau ada cache, tampilkan langsung (tanpa shimmer berkedip).
  // Data disegarkan diam-diam HANYA kalau memang ada perubahan di spreadsheet.
  if (cachedItems) {
    renderDutyItems(cachedItems, box, type);
  } else {
    box.innerHTML = `
      <div class="duty-card">
        <div class="skeleton-card" style="margin-bottom: 0">
          <div class="skeleton-thumb shimmer"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line shimmer skeleton-line-title"></div>
            <div class="skeleton-line shimmer skeleton-line-sub"></div>
            <div class="skeleton-line shimmer skeleton-line-full"></div>
          </div>
        </div>
      </div>`;
  }

  try {
    const { items, fromCache } = await getContentCardsSmart(type);
    if (!fromCache) renderDutyItems(items, box, type);
  } catch (err) {
    if (!cachedItems) box.innerHTML = "";
  }
}

async function loadSecurityDuty() {
  await loadDutySchedule("security", "#securityDutyContent");
}

async function loadTrashDuty() {
  await loadDutySchedule("sampah", "#trashDutyContent");
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// [BARU] SHIMMER SKELETON LOADING (fix #5 — pengganti teks polos
// "Memuat...") — dipakai saat memuat kartu konten dari backend, supaya
// terasa modern & lebih presisi (bentuk skeleton mengikuti bentuk kartu
// aslinya: kotak ikon + baris judul + baris deskripsi).
// ------------------------------------------------------------
function shimmerCardHtml() {
  return `
    <div class="skeleton-card">
      <div class="skeleton-thumb shimmer"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line shimmer skeleton-line-title"></div>
        <div class="skeleton-line shimmer skeleton-line-sub"></div>
        <div class="skeleton-line shimmer skeleton-line-full"></div>
      </div>
    </div>`;
}

function shimmerListHtml(count) {
  return Array.from({ length: count || 3 }, shimmerCardHtml).join("");
}

function shimmerGridHtml(count) {
  return Array.from(
    { length: count || 4 },
    () => `
    <div class="skeleton-manage-card">
      <div class="skeleton-thumb-sm shimmer"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line shimmer skeleton-line-title"></div>
        <div class="skeleton-line shimmer skeleton-line-sub"></div>
      </div>
    </div>`,
  ).join("");
}

// ------------------------------------------------------------
// [BARU] CACHE KONTEN LOKAL + PENGECEKAN VERSI (fix #5)
// Konten disimpan di localStorage. Sebelum mengambil ulang seluruh
// data dari server, kita cek dulu versi ringan (getContentVersion).
// Kalau versinya sama dengan yang tersimpan, artinya TIDAK ADA
// perubahan di spreadsheet -> pakai data cache, tidak fetch ulang.
// ------------------------------------------------------------
const CONTENT_CACHE_KEY = "pondok_rajeg_content_cache_v1";

function readContentCache() {
  try {
    const raw = localStorage.getItem(CONTENT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writeContentCache(cache) {
  try {
    localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("Gagal menyimpan cache konten:", err);
  }
}

function bustContentCache() {
  try {
    localStorage.removeItem(CONTENT_CACHE_KEY);
  } catch (err) {
    /* abaikan */
  }
}

// Mengambil kartu konten per kategori, memakai cache lokal selama versi di
// server belum berubah. Mengembalikan { items, fromCache }.
async function getContentCardsSmart(type) {
  const cache = readContentCache();
  let serverVersion = null;
  try {
    const verResult = await sendToBackend(
      "getContentVersion",
      {},
      { silent: true },
    );
    serverVersion = verResult && verResult.version;
  } catch (err) {
    serverVersion = null; // gagal cek versi (mis. offline) -> aman-nya, ambil data langsung
  }

  if (
    serverVersion &&
    cache &&
    cache.version === serverVersion &&
    Array.isArray(cache[type])
  ) {
    return { items: cache[type], fromCache: true };
  }

  const items = await fetchContentCards(type);
  const newCache =
    serverVersion && cache && cache.version === serverVersion
      ? cache
      : { version: serverVersion || "" };
  newCache[type] = items;
  writeContentCache(newCache);
  return { items, fromCache: false };
}

async function fetchContentCards(type) {
  const result = await sendToBackend(
    "getContentCards",
    { type },
    { silent: true },
  );
  return (result && result.items) || [];
}

function renderServiceItems(items, box, type) {
  if (!box) return;
  const meta = CONTENT_TYPE_META[type] || CONTENT_TYPE_META.jasa;
  if (!items.length) {
    box.innerHTML = `<div class="empty-state-box">${meta.emptyText}</div>`;
    return;
  }
  box.innerHTML = items
    .map((it) => {
      const hasBoth = !!(it.phone && it.linkUrl);
      const waLabel = hasBoth ? "WhatsApp" : "Chat WhatsApp";
      const linkLabel = hasBoth ? "Link" : "Buka Link";
      const actionsHtml =
        it.phone || it.linkUrl
          ? `<div class="content-item-actions">
              ${
                it.phone
                  ? `<a href="${waLink(it.phone, `Halo ${it.title}, saya warga MY PRR ingin bertanya...`)}" target="_blank" class="whatsapp-btn">
                      <span class="material-symbols-rounded">chat</span> ${waLabel}
                    </a>`
                  : ""
              }
              ${
                it.linkUrl
                  ? `<a href="${it.linkUrl}" target="_blank" class="whatsapp-btn internet-btn"><span class="material-symbols-rounded">open_in_new</span> ${linkLabel}</a>`
                  : ""
              }
            </div>`
          : "";
      // Fix: baris tombol diletakkan DI LUAR kolom sempit di sebelah ikon
      // (bukan lagi di dalam .content-item-body), supaya dapat lebar penuh
      // kartu dan benar-benar muat berdampingan bahkan di layar HP sempit.
      return `
    <article class="tukang-item">
      <div class="content-item-with-thumb">
        ${contentThumbHtml(it, type)}
        <div class="content-item-body">
          <b>${escapeHtml(it.title)}</b>
          ${it.subtitle ? `<div style="font-size:11px; color:var(--muted); margin: -2px 0 6px; font-weight:700;">${escapeHtml(it.subtitle)}</div>` : ""}
          <p>${escapeHtml(it.description || "")}</p>
        </div>
      </div>
      ${actionsHtml}
    </article>`;
    })
    .join("");
}

async function loadServiceList(type, boxSelector, loadingText) {
  const box = $(boxSelector);
  if (!box) return;
  const cache = readContentCache();
  const cachedItems = cache && Array.isArray(cache[type]) ? cache[type] : null;

  // Fix #4/#5: kalau sudah ada cache, langsung tampilkan (tanpa "Memuat...").
  // Data akan disegarkan diam-diam di belakang layar HANYA kalau ternyata berubah.
  if (cachedItems) {
    renderServiceItems(cachedItems, box, type);
  } else {
    box.innerHTML = shimmerListHtml(3);
  }

  try {
    const { items, fromCache } = await getContentCardsSmart(type);
    if (!fromCache) renderServiceItems(items, box, type);
  } catch (err) {
    if (!cachedItems)
      box.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

async function loadTukangList() {
  await loadServiceList("jasa", "#tukangListContent", "Memuat daftar jasa...");
}

async function loadInternetList() {
  await loadServiceList(
    "internet",
    "#internetListContent",
    "Memuat daftar internet...",
  );
}

function renderHealthItems(items, box) {
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="empty-state-box">${CONTENT_TYPE_META.kesehatan.emptyText}</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `
    <article class="tukang-item emergency-item content-item-with-thumb">
      ${contentThumbHtml(it, "kesehatan")}
      <div class="content-item-body">
        <b>${escapeHtml(it.title)}</b>
        <p>${escapeHtml(it.description || it.subtitle || "")}</p>
        ${
          it.phone
            ? `<a href="${waLink(it.phone, `Darurat Medis! Saya warga MY PRR butuh bantuan segera...`)}" target="_blank" class="whatsapp-btn emergency-wa-btn">
                <span class="material-symbols-rounded">phone_in_talk</span> Hubungi via WA
              </a>`
            : ""
        }
      </div>
    </article>`,
    )
    .join("");
}

async function loadHealthList() {
  const box = $("#healthListContent");
  if (!box) return;
  const cache = readContentCache();
  const cachedItems =
    cache && Array.isArray(cache.kesehatan) ? cache.kesehatan : null;

  if (cachedItems) {
    renderHealthItems(cachedItems, box);
  } else {
    box.innerHTML = shimmerListHtml(2);
  }

  try {
    const { items, fromCache } = await getContentCardsSmart("kesehatan");
    if (!fromCache) renderHealthItems(items, box);
  } catch (err) {
    if (!cachedItems)
      box.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

let announcementCache = [];

function renderAnnouncementItems(items, box) {
  if (!box) return;
  announcementCache = items;
  if (!items.length) {
    box.innerHTML = `<div class="empty-state-box">${CONTENT_TYPE_META.pengumuman.emptyText}</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `
    <article class="info-announcement-card clickable-article content-item-with-thumb" data-id="${it.id}">
      ${contentThumbHtml(it, "pengumuman")}
      <div class="content-item-body">
        <b>${escapeHtml(it.title)}</b>
        <p>${escapeHtml((it.description || "").slice(0, 120))}${(it.description || "").length > 120 ? "..." : ""}</p>
        <small style="color: var(--green); font-weight: 700">Baca selengkapnya →</small>
      </div>
    </article>`,
    )
    .join("");

  box.querySelectorAll(".clickable-article").forEach((card) => {
    card.addEventListener("click", () => showInfoArticle(card.dataset.id));
  });
}

async function loadAnnouncements() {
  const box = $("#infoAnnouncementsContent");
  if (!box) return;
  const cache = readContentCache();
  const cachedItems =
    cache && Array.isArray(cache.pengumuman) ? cache.pengumuman : null;

  if (cachedItems) {
    renderAnnouncementItems(cachedItems, box);
  } else {
    box.innerHTML = shimmerListHtml(3);
  }

  try {
    const { items, fromCache } = await getContentCardsSmart("pengumuman");
    if (!fromCache) {
      renderAnnouncementItems(items, box);
    } else {
      announcementCache = items; // tetap sinkronkan cache-in-memory utk showInfoArticle()
    }
  } catch (err) {
    if (!cachedItems)
      box.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAdartItems(items, box) {
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="empty-state-box">${CONTENT_TYPE_META.adart.emptyText}</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `
    <div class="info-document-card content-item-with-thumb">
      ${contentThumbHtml(it, "adart", "content-thumb-square")}
      <div class="doc-info">
        <b>${escapeHtml(it.title)}</b>
        <small>${escapeHtml(it.subtitle || it.description || "Dokumen Pengurus Paguyuban MY PRR")}</small>
      </div>
      ${it.linkUrl ? `<a href="${it.linkUrl}" target="_blank" class="doc-download-btn"><span class="material-symbols-rounded">download</span></a>` : ""}
    </div>`,
    )
    .join("");
}

async function loadAdartDoc() {
  const box = $("#adartDocumentContent");
  if (!box) return;
  const cache = readContentCache();
  const cachedItems = cache && Array.isArray(cache.adart) ? cache.adart : null;

  if (cachedItems) {
    renderAdartItems(cachedItems, box);
  } else {
    box.innerHTML = shimmerListHtml(1);
  }

  try {
    const { items, fromCache } = await getContentCardsSmart("adart");
    if (!fromCache) renderAdartItems(items, box);
  } catch (err) {
    if (!cachedItems)
      box.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

// [BARU] Fix #4: Inventaris Warga — dinamis, admin isi nama barang & status
// ketersediaan (mis. "3 dari 5 Tersedia") sendiri lewat "Kelola Konten",
// menggantikan 4 kartu hardcoded "Tidak Tersedia" yang lama.
function renderInventoryItems(items, box) {
  if (!box) return;
  if (!items.length) {
    box.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;">${CONTENT_TYPE_META.inventaris.emptyText}</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (it) => `
    <div class="inventory-card">
      <span class="material-symbols-rounded">${CONTENT_TYPE_META.inventaris.icon}</span>
      <div>
        <b>${escapeHtml(it.title)}</b>
        <small>${escapeHtml(it.subtitle || "Status belum diatur")}</small>
      </div>
    </div>`,
    )
    .join("");
}

async function loadInventoryList() {
  const box = $("#inventoryListContent");
  if (!box) return;
  const cache = readContentCache();
  const cachedItems =
    cache && Array.isArray(cache.inventaris) ? cache.inventaris : null;

  if (cachedItems) {
    renderInventoryItems(cachedItems, box);
  } else {
    box.innerHTML = `<div style="grid-column: 1 / -1">${shimmerGridHtml(4)}</div>`;
  }

  try {
    const { items, fromCache } = await getContentCardsSmart("inventaris");
    if (!fromCache) renderInventoryItems(items, box);
  } catch (err) {
    if (!cachedItems)
      box.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function showInfoArticle(id) {
  const article = announcementCache.find((a) => a.id === id);
  if (!article) return;

  const tabs = $("#infoMainTabs");
  const listPane = $("#infoAnnouncementsContent");
  const adartPane = $("#infoAdartContent");
  const detailPane = $("#infoArticleDetailContent");
  const bodyEl = $("#articleDetailBody");
  const titleEl = $("#infoModalTitle");
  const eyebrowEl = $("#infoModalEyebrow");

  // Fix #3: tampilkan gambar di atas artikel — pakai gambar yang dilampirkan
  // admin, atau logo MY PRR sebagai default kalau tidak ada gambar.
  const imgSrc = article.imageUrl || CONTENT_DEFAULT_IMAGE;
  const imgClass = article.imageUrl ? "" : " article-detail-image-default";

  if (bodyEl) {
    bodyEl.innerHTML = `
      <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(article.title)}" class="article-detail-image${imgClass}" loading="lazy" onerror="this.onerror=null;this.src='${CONTENT_DEFAULT_IMAGE}';this.classList.add('article-detail-image-default');" />
      <h3 style="font-size:16px; margin:10px 0 4px; color:var(--dark);">${escapeHtml(article.title)}</h3>
      ${article.subtitle ? `<div class="article-detail-meta">${escapeHtml(article.subtitle)}</div>` : ""}
      <div class="article-detail-body-text"><p>${escapeHtml(article.description || "").replace(/\n/g, "<br>")}</p></div>`;
  }

  if (tabs) tabs.style.display = "none";
  if (listPane) listPane.style.display = "none";
  if (adartPane) adartPane.style.display = "none";
  if (detailPane) detailPane.style.display = "block";
  if (eyebrowEl) eyebrowEl.textContent = "DETAIL PENGUMUMAN";
  if (titleEl) titleEl.textContent = article.title;
}

function backToInfoList() {
  const tabs = $("#infoMainTabs");
  const listPane = $("#infoAnnouncementsContent");
  const adartPane = $("#infoAdartContent");
  const detailPane = $("#infoArticleDetailContent");
  const titleEl = $("#infoModalTitle");
  const eyebrowEl = $("#infoModalEyebrow");

  if (detailPane) detailPane.style.display = "none";
  if (tabs) tabs.style.display = "flex";
  if (adartPane) adartPane.style.display = "none";
  if (listPane) listPane.style.display = "block";
  if (eyebrowEl) eyebrowEl.textContent = "PUSAT INFORMASI & DOKUMEN";
  if (titleEl) titleEl.textContent = "Info Warga & Dokumen Paguyuban PRR";

  document.querySelectorAll("[data-infotab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.infotab === "announcements");
  });
}

// ------------------------------------------------------------
// PANEL ADMIN: KELOLA KONTEN (grid 2 kolom, per kategori/tab)
// ------------------------------------------------------------
let activeContentTab = "jasa";
let contentManagerCache = {};

async function loadContentManagerGrid(type) {
  const grid = $("#contentManagerGrid");
  if (!grid) return;
  const cache = readContentCache();
  const cachedItems = cache && Array.isArray(cache[type]) ? cache[type] : null;

  // Fix #4: loading state sekarang selalu memenuhi lebar grid (lihat CSS),
  // dan kalau ada cache, tampilkan dulu isinya alih-alih kotak "Memuat...".
  if (cachedItems) {
    contentManagerCache[type] = cachedItems;
    renderContentManagerGrid(type, cachedItems);
  } else {
    grid.innerHTML = shimmerGridHtml(4);
  }

  try {
    const { items, fromCache } = await getContentCardsSmart(type);
    contentManagerCache[type] = items;
    if (!fromCache) renderContentManagerGrid(type, items);
  } catch (err) {
    if (!cachedItems)
      grid.innerHTML = `<div class="empty-state-box">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderContentManagerGrid(type, items) {
  const grid = $("#contentManagerGrid");
  if (!grid) return;
  if (!items || !items.length) {
    grid.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;">Belum ada kartu untuk kategori ini. Klik "+ Tambah Kartu" untuk membuat yang pertama.</div>`;
    return;
  }
  grid.innerHTML = items
    .map(
      (it) => `
    <div class="content-manage-card" data-id="${it.id}">
      <div class="content-manage-card-top">
        ${contentThumbHtml(it, type, "content-thumb-sm")}
        <div class="content-manage-card-headtext">
          <b>${escapeHtml(it.title)}</b>
          <span class="content-order-badge">#${it.order || 0}</span>
        </div>
      </div>
      ${it.subtitle ? `<small class="content-manage-subtitle">${escapeHtml(it.subtitle)}</small>` : ""}
      ${it.timeStart || it.timeEnd ? `<div class="content-manage-meta"><span class="material-symbols-rounded">schedule</span>${escapeHtml(formatTimeRange(it.timeStart, it.timeEnd))}</div>` : ""}
      ${it.timeStart || it.timeEnd || it.days ? `<div class="content-manage-meta"><span class="material-symbols-rounded">event_repeat</span>${escapeHtml(formatDaysBadge(it.days))}</div>` : ""}
      ${it.description ? `<p class="content-manage-desc">${escapeHtml(it.description)}</p>` : ""}
      ${it.phone ? `<div class="content-manage-meta"><span class="material-symbols-rounded">call</span>${escapeHtml(it.phone)}</div>` : ""}
      ${it.linkUrl ? `<div class="content-manage-meta"><span class="material-symbols-rounded">link</span><a href="${it.linkUrl}" target="_blank" rel="noopener" class="content-manage-link">${escapeHtml(it.linkUrl)}</a></div>` : ""}
      <div class="content-manage-actions">
        <button type="button" class="chip-btn" data-edit-content="${it.id}">Ubah</button>
        <button type="button" class="chip-btn ghost" data-delete-content="${it.id}">Hapus</button>
      </div>
    </div>`,
    )
    .join("");

  grid.querySelectorAll("[data-edit-content]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items.find((i) => i.id === btn.dataset.editContent);
      if (item) openContentForm(type, item);
    });
  });
  grid.querySelectorAll("[data-delete-content]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteContentCard(type, btn.dataset.deleteContent, items),
    );
  });
}

async function deleteContentCard(type, id, items) {
  const item = items.find((i) => i.id === id);
  if (!confirm(`Hapus kartu "${item ? item.title : ""}"?`)) return;
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  try {
    const result = await sendToBackend("adminDeleteContentCard", {
      adminUnit,
      id,
    });
    showToast(result.message);
    bustContentCache();
    loadContentManagerGrid(type);
    refreshPublicContentIfOpen(type);
  } catch (err) {
    showToast(`Gagal: ${err.message}`);
  }
}

// ------------------------------------------------------------
// [BARU] KELOLA WARGA (ADMIN) — daftar unit baru, ubah data, reset PIN.
// Pola/struktur mengikuti "Kelola Konten" supaya konsisten, tapi menyasar
// sheet "Users" (bukan "ContentCards") lewat action adminListUsers /
// adminRegisterUnit / adminUpdateUnit / adminResetUnitPin / adminDeleteUnit.
// ------------------------------------------------------------
let currentUserList = [];

async function loadUserManagerGrid() {
  const grid = $("#userManagerGrid");
  if (!grid) return;
  grid.innerHTML = shimmerListHtml(3);
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  try {
    const result = await sendToBackend("adminListUsers", { adminUnit });
    currentUserList = result.users || [];
    renderUserManagerGrid(currentUserList);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

function renderUserManagerGrid(users) {
  const grid = $("#userManagerGrid");
  if (!grid) return;
  if (!users.length) {
    grid.innerHTML = `<div class="empty-state-box" style="grid-column: 1 / -1;">Belum ada unit terdaftar. Klik "+ Daftarkan Unit" untuk mendaftarkan warga pertama.</div>`;
    return;
  }
  grid.innerHTML = users
    .map(
      (u) => `
    <div class="content-manage-card" data-unit="${escapeHtml(u.unit)}">
      <div class="content-manage-card-top">
        <div class="content-thumb content-thumb-sm content-thumb-icon ${u.role === "admin" ? "security" : "wrench"}">
          <span class="material-symbols-rounded">${u.role === "admin" ? "shield_person" : "home"}</span>
        </div>
        <div class="content-manage-card-headtext">
          <b>${escapeHtml(u.unit)}</b>
          <span class="content-order-badge">${u.role === "admin" ? "Admin" : "Warga"}</span>
        </div>
      </div>
      <small class="content-manage-subtitle">${escapeHtml(u.name)}</small>
      <div class="content-manage-actions">
        <button type="button" class="chip-btn" data-edit-user="${escapeHtml(u.unit)}">Ubah</button>
        <button type="button" class="chip-btn" data-reset-pin="${escapeHtml(u.unit)}">Reset PIN</button>
        <button type="button" class="chip-btn ghost" data-delete-user="${escapeHtml(u.unit)}">Hapus</button>
      </div>
    </div>`,
    )
    .join("");

  grid.querySelectorAll("[data-edit-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = users.find((x) => x.unit === btn.dataset.editUser);
      if (u) openUserForm(u);
    });
  });
  grid.querySelectorAll("[data-reset-pin]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openResetPinDialog(btn.dataset.resetPin),
    );
  });
  grid.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", () => deleteUserUnit(btn.dataset.deleteUser));
  });
}

function openUserForm(user) {
  const dialog = $("#userFormDialog");
  const form = $("#userForm");
  if (!dialog || !form) return;
  form.reset();

  const isEdit = !!user;
  $("#userFormEyebrow").textContent = isEdit
    ? "UBAH DATA UNIT"
    : "DAFTARKAN UNIT";
  $("#userFormTitle").textContent = isEdit
    ? "Ubah Unit " + user.unit
    : "Unit Baru";
  $("#userFormSubmitBtn").innerHTML = isEdit
    ? "Simpan Perubahan <span>→</span>"
    : "Daftarkan <span>→</span>";

  const unitInput = form.querySelector("[name='unit']");
  const pinSection = $("#userFormPinSection");
  // Saat EDIT: kode unit tidak boleh diubah (jadi identitas kunci di sheet
  // Users) & field PIN disembunyikan (reset PIN sudah ada menu terpisah).
  unitInput.readOnly = isEdit;
  unitInput.style.opacity = isEdit ? "0.6" : "1";
  if (pinSection) pinSection.style.display = isEdit ? "none" : "block";
  form.querySelector("[name='pin']").required = !isEdit;

  if (isEdit) {
    unitInput.value = user.unit;
    form.querySelector("[name='name']").value = user.name;
    form.querySelector("[name='role']").value = user.role;
    form.dataset.editingUnit = user.unit;
  } else {
    delete form.dataset.editingUnit;
  }

  dialog.showModal();
}

async function deleteUserUnit(unit) {
  const u = currentUserList.find((x) => x.unit === unit);
  if (
    !confirm(
      `Hapus unit "${unit}" (${u ? u.name : ""})? Warga ini tidak akan bisa login lagi.`,
    )
  )
    return;
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  try {
    const result = await sendToBackend("adminDeleteUnit", { adminUnit, unit });
    showToast(result.message);
    loadUserManagerGrid();
  } catch (err) {
    showToast(`Gagal: ${err.message}`);
  }
}

function openResetPinDialog(unit) {
  const dialog = $("#resetPinDialog");
  const form = $("#resetPinForm");
  if (!dialog || !form) return;
  form.reset();
  form.dataset.resetUnit = unit;
  $("#resetPinTitle").textContent = "Reset PIN — " + unit;
  dialog.showModal();
}

function refreshPublicContentIfOpen(type) {
  // Segarkan tampilan warga bila dialog terkait sedang terbuka di belakang.
  if (type === "jasa" && $("#tukangDialog")?.open) loadTukangList();
  if (type === "internet" && $("#tukangDialog")?.open) loadInternetList();
  if (type === "kesehatan" && $("#healthDialog")?.open) loadHealthList();
  if ((type === "pengumuman" || type === "adart") && $("#infoDialog")?.open) {
    loadAnnouncements();
    loadAdartDoc();
  }
  // [BARU] Card Security & Tukang Sampah selalu tampil di beranda (bukan di
  // dalam dialog), jadi langsung disegarkan tanpa perlu cek dialog terbuka.
  if (type === "security") loadSecurityDuty();
  if (type === "sampah") loadTrashDuty();
  if (type === "inventaris") loadInventoryList();
}

// [BARU] Fix #2: placeholder form disesuaikan per kategori (sebelumnya
// selalu memakai contoh "Bengkel Pak Ujang" walau sedang menambah kartu
// Security/Sampah/Pengumuman — bikin bingung karena tidak nyambung).
const CONTENT_FORM_PLACEHOLDERS = {
  jasa: {
    title: "Contoh: Bengkel Pak Ujang",
    subtitle: "Contoh: Bengkel Motor & Las",
    description: "Keterangan singkat jasa yang ditawarkan...",
    phone: "+6281234567890",
  },
  internet: {
    title: "Contoh: Biznet Home",
    subtitle: "Contoh: Internet Fiber 50 Mbps",
    description: "Keterangan paket/layanan internet...",
    phone: "+6281234567890",
  },
  kesehatan: {
    title: "Contoh: Klinik Sehat Sentosa",
    subtitle: "Contoh: Klinik 24 Jam",
    description: "Keterangan layanan medis darurat...",
    phone: "+6281234567890",
  },
  pengumuman: {
    title: "Contoh: Kerja Bakti Lingkungan",
    subtitle: "Contoh: Info Warga",
    description: "Isi pengumuman lengkap untuk warga...",
    phone: "",
  },
  adart: {
    title: "Contoh: AD/ART Paguyuban PRR 2026",
    subtitle: "",
    description: "Keterangan dokumen (opsional)...",
    phone: "",
  },
  sampah: {
    title: "Contoh: Pak Ujang",
    subtitle: "Contoh: Rute Blok A–C",
    description: "Catatan tambahan (opsional)...",
    phone: "+6281234567890",
  },
  security: {
    title: "Contoh: Bpk. Slamet",
    subtitle: "Contoh: Pos Utama Gerbang Depan",
    description: "Catatan tugas (opsional)...",
    phone: "+6281234567890",
  },
  inventaris: {
    title: "Contoh: Tenda Warga",
    subtitle: "Contoh: 3 dari 5 Tersedia",
    description: "Catatan kondisi/lokasi penyimpanan (opsional)...",
    phone: "",
  },
};

function applyContentFormPlaceholders(type) {
  const p = CONTENT_FORM_PLACEHOLDERS[type] || CONTENT_FORM_PLACEHOLDERS.jasa;
  const form = $("#contentForm");
  if (!form) return;
  const titleInput = form.querySelector("[name='title']");
  const subtitleInput = form.querySelector("[name='subtitle']");
  const descInput = form.querySelector("[name='description']");
  const phoneInput = form.querySelector("[name='phone']");
  if (titleInput) titleInput.placeholder = p.title;
  if (subtitleInput) subtitleInput.placeholder = p.subtitle;
  if (descInput) descInput.placeholder = p.description;
  if (phoneInput) phoneInput.placeholder = p.phone;
}

function contentFormFieldVisibility(type) {
  const subtitleLabel = $("#contentSubtitleLabel");
  const phoneLabel = $("#contentPhoneLabel");
  const linkLabel = $("#contentLinkLabel");
  const categoryLabel = $("#contentCategoryLabel");
  const timeLabel = $("#contentTimeLabel");
  if (
    !subtitleLabel ||
    !phoneLabel ||
    !linkLabel ||
    !categoryLabel ||
    !timeLabel
  )
    return;

  const isServiceType = type === "jasa" || type === "internet";
  const isDutyType = type === "sampah" || type === "security";
  phoneLabel.style.display =
    type === "pengumuman" || type === "adart" || type === "inventaris"
      ? "none"
      : "block";
  linkLabel.style.display =
    isServiceType || type === "adart" ? "block" : "none";
  subtitleLabel.style.display = type === "adart" ? "none" : "block";
  // Fix #2: kategori Jasa/Internet dipilih lewat dropdown eksplisit (bukan
  // cuma mengandalkan tab admin mana yang aktif saat itu), supaya data yang
  // tersimpan selalu konsisten/seragam dan admin bisa mengubahnya langsung.
  categoryLabel.style.display = isServiceType ? "block" : "none";
  // [BARU] Field jam mulai/selesai HANYA untuk jadwal Tukang Sampah & Security.
  timeLabel.style.display = isDutyType ? "block" : "none";
  applyContentFormPlaceholders(type);
}

// [FIX #5] Isi opsi dropdown Jam (00-23) saja — pilihan menit dihapus,
// jadwal shift selalu dibulatkan ke jam pas (:00).
function populateTimeSelectOptions() {
  const hourSelects = document.querySelectorAll(
    "[name='timeStartHour'], [name='timeEndHour']",
  );
  hourSelects.forEach((sel) => {
    if (sel.dataset.filled) return;
    // [FIX] Opsi kosong di awal — tanpa ini, <select> otomatis "terisi" ke
    // opsi pertama (00) meski admin belum sentuh sama sekali, bikin jam
    // seolah-olah sengaja diisi "00:00" padahal harusnya tetap kosong/opsional.
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "-- : --";
    sel.appendChild(emptyOpt);
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = String(h).padStart(2, "0");
      opt.textContent = String(h).padStart(2, "0");
      sel.appendChild(opt);
    }
    sel.dataset.filled = "1";
  });
}

// Set dropdown Jam dari string "HH:MM" (menitnya diabaikan — selalu :00).
function setTimeSelectValue(form, prefix, value) {
  const [h] = String(value || "").split(":");
  const hourSel = form.querySelector(`[name='${prefix}Hour']`);
  if (hourSel) hourSel.value = h || "";
}

// Ambil dropdown Jam, gabung jadi string "HH:00" (menit selalu 00), atau ""
// kalau belum diisi.
function getTimeSelectValue(form, prefix) {
  const hourSel = form.querySelector(`[name='${prefix}Hour']`);
  const h = hourSel ? hourSel.value : "";
  // [FIX #5] Menit selalu ":00" — dropdown menit sudah dihapus dari form.
  if (!h) return "";
  return `${h}:00`;
}

function openContentForm(type, item) {
  const dialog = $("#contentFormDialog");
  const form = $("#contentForm");
  if (!dialog || !form) return;

  populateTimeSelectOptions();
  form.reset();
  form.querySelector("[name='contentType']").value = type;
  form.querySelector("[name='contentId']").value = item ? item.id : "";
  const categorySelect = form.querySelector("[name='category']");
  if (categorySelect) {
    // Saat edit, ikuti kategori ASLI item (item.type) — bukan sekadar tab
    // admin yang sedang aktif — supaya tetap akurat kalau ada campuran data.
    categorySelect.value = (item && item.type) || type;
  }

  $("#contentFormEyebrow").textContent =
    (item ? "UBAH KARTU · " : "TAMBAH KARTU · ") +
    (CONTENT_TYPE_META[type]?.label || type);
  $("#contentFormTitle").textContent = item ? "Ubah Kartu" : "Kartu Baru";
  $("#contentFormSubmitBtn").innerHTML = item
    ? "Simpan Perubahan <span>→</span>"
    : "Simpan Kartu <span>→</span>";

  contentFormFieldVisibility(type);

  if (item) {
    form.querySelector("[name='title']").value = item.title || "";
    form.querySelector("[name='subtitle']").value = item.subtitle || "";
    form.querySelector("[name='description']").value = item.description || "";
    form.querySelector("[name='phone']").value = item.phone || "";
    form.querySelector("[name='linkUrl']").value = item.linkUrl || "";
    form.querySelector("[name='imageUrl']").value = item.imageUrl || "";
    form.querySelector("[name='order']").value = item.order || 0;
    setTimeSelectValue(form, "timeStart", item.timeStart);
    setTimeSelectValue(form, "timeEnd", item.timeEnd);
    // [BARU] Fix #4/#5: centang ulang checkbox hari sesuai data tersimpan
    // (item.days, dipisah koma) saat membuka form untuk EDIT kartu.
    const selectedDays = parseDaysField(item.days);
    form.querySelectorAll("[name='days']").forEach((cb) => {
      cb.checked = selectedDays.includes(cb.value);
    });
  }

  dialog.showModal();
}

document.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splashScreen");
  const loginView = document.getElementById("loginView");
  const mainApp = document.getElementById("mainApp");
  const loginForm = document.getElementById("loginForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const welcomeUser = document.getElementById("welcomeUser");
  const loginSuccessDialog = $("#loginSuccessDialog");
  const logoutConfirmDialog = $("#logoutConfirmDialog");
  const loginSuccessMessageText = $("#loginSuccessMessageText");
  const enterDashboardBtn = $("#enterDashboardBtn");
  const confirmLogoutAction = $("#confirmLogoutAction");

  const refreshWelcomeHeader = () => {
    const savedUser = localStorage.getItem("pondok_rajeg_user");
    const savedName = localStorage.getItem("pondok_rajeg_name") || savedUser;
    if (savedUser && welcomeUser) {
      welcomeUser.textContent = `Selamat datang, ${savedName} (Rumah ${savedUser})`;
    }
    const composerAvatarInitial = $("#composerAvatarInitial");
    if (composerAvatarInitial && savedName) {
      composerAvatarInitial.textContent = savedName
        .trim()
        .charAt(0)
        .toUpperCase();
    }
  };

  const safeRefreshDashboard = (unit) => {
    if (!unit) return;
    refreshDashboard(unit).catch((err) => {
      console.error("Gagal memuat dashboard:", err);
      showToast(
        "Gagal memuat data terbaru dari server. Coba muat ulang halaman.",
      );
    });
  };

  const bootSession = (unit, role) => {
    applyRoleUI(role);
    safeRefreshDashboard(unit);
    attachPostsListener();
    requestNotificationPermission();
    loadNotifications();
    startNotifPolling();
    // [BARU] Muat card Security & Tukang Sampah di beranda (dinamis, dengan
    // shimmer + cache-hanya-refresh-saat-berubah, sama seperti konten lain).
    loadSecurityDuty();
    loadTrashDuty();
    loadInventoryList();
    // [BARU] Fix #8: pengaduan sekarang dimuat dari backend saat login,
    // bukan lagi dari localStorage — tetap muncul walau ganti device.
    loadAndRenderComplaints();
  };

  setTimeout(() => {
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
        const savedUser = localStorage.getItem("pondok_rajeg_user");
        const savedRole = localStorage.getItem(ROLE_KEY) || "warga";

        if (savedUser) {
          if (mainApp) mainApp.style.display = "flex";
          refreshWelcomeHeader();
          bootSession(savedUser, savedRole);
        } else {
          if (loginView) loginView.style.display = "flex";
        }
      }, 500);
    }
  }, 2000);

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const unitInput = document.getElementById("loginUnit");
      const pinInput = document.getElementById("loginPin");
      const submitBtn = loginForm.querySelector("button[type='submit']");
      const unit = unitInput ? unitInput.value.trim() : "";
      const pin = pinInput ? pinInput.value.trim() : "";

      if (!unit || !pin) {
        showToast("Mohon masukkan Blok Rumah dan PIN.");
        return;
      }

      const originalButtonText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Memverifikasi... ⏳";

      try {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({ action: "login", data: { unit, pin } }),
        });
        const result = await response.json();

        if (!result.ok) {
          const errorDialog = $("#errorDialog");
          if (errorDialog) errorDialog.showModal();
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalButtonText;
          return;
        }

        localStorage.setItem("pondok_rajeg_user", unit);
        localStorage.setItem("pondok_rajeg_name", result.name);
        localStorage.setItem(
          ROLE_KEY,
          result.role === "admin" ? "admin" : "warga",
        );

        refreshWelcomeHeader();

        if (loginSuccessMessageText) {
          loginSuccessMessageText.textContent =
            result.role === "admin"
              ? `Halo ${result.name}, Anda masuk sebagai Pengurus Paguyuban PRR.`
              : `Halo ${result.name}, verifikasi Rumah ${unit} berhasil.`;
        }
        if (loginSuccessDialog) loginSuccessDialog.showModal();

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalButtonText;
      } catch (error) {
        showSaveFailureModal(error);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalButtonText;
      }
    });
  }

  if (enterDashboardBtn) {
    enterDashboardBtn.addEventListener("click", () => {
      const unit = localStorage.getItem("pondok_rajeg_user");
      const role = localStorage.getItem(ROLE_KEY) || "warga";
      refreshWelcomeHeader();
      if (loginView) {
        loginView.style.opacity = "0";
        setTimeout(() => {
          loginView.style.display = "none";
          if (mainApp) {
            mainApp.style.display = "flex";
            mainApp.style.opacity = "1";
          }
          bootSession(unit, role);
        }, 200);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logoutConfirmDialog?.showModal());
  }

  if (confirmLogoutAction) {
    confirmLogoutAction.addEventListener("click", () => {
      if (logoutConfirmDialog) logoutConfirmDialog.close();
      logoutToLoginView();
      showToast("Anda telah keluar dari akun.");
    });
  }

  const notificationBtn = $("#notificationBtn");
  const notificationDialog = $("#notificationDialog");

  if (notificationBtn && notificationDialog) {
    notificationBtn.addEventListener("click", async () => {
      notificationDialog.showModal();
      const box = $("#notificationListContent");
      if (box && !notificationCache.length) {
        box.innerHTML = shimmerListHtml(3);
      }
      await loadNotifications();
      localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
      updateNotifBadge();
    });
  }

  const adminQuickBtn = $("#adminQuickBtn");
  const adminDialog = $("#adminDialog");
  if (adminQuickBtn && adminDialog) {
    adminQuickBtn.addEventListener("click", () => {
      adminDialog.showModal();
      loadAdminPending();
    });
  }

  const adminRefreshBtn = $("#adminRefreshBtn");
  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", () => loadAdminPending());
  }

  const expenseAdminBtn = $("#expenseAdminBtn");
  const expenseDialog = $("#expenseDialog");
  const expenseForm = $("#expenseForm");
  const expenseRefreshBtn = $("#expenseRefreshBtn");
  const expenseCloseBtn = $("#expenseCloseBtn");

  if (expenseAdminBtn && expenseDialog) {
    expenseAdminBtn.addEventListener("click", () => {
      const dateField = expenseForm?.querySelector("[name='expenseDate']");
      if (dateField && !dateField.value) {
        dateField.value = new Date().toISOString().slice(0, 10);
      }
      expenseDialog.showModal();
      loadExpenses();
    });
  }
  if (expenseRefreshBtn) {
    expenseRefreshBtn.addEventListener("click", () => loadExpenses());
  }
  if (expenseCloseBtn && expenseDialog) {
    expenseCloseBtn.addEventListener("click", () => expenseDialog.close());
  }

  if (expenseForm) {
    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(expenseForm));
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const submitBtn = $("#expenseSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Menyimpan...";

      try {
        const result = await sendToBackend("adminAddExpense", {
          adminUnit,
          date: data.expenseDate,
          description: data.expenseDescription,
          category: data.expenseCategory,
          amount: Number(data.expenseAmount) || 0,
        });
        showToast(result.message);
        expenseForm.reset();
        const dateField = expenseForm.querySelector("[name='expenseDate']");
        if (dateField) dateField.value = new Date().toISOString().slice(0, 10);
        loadExpenses();
        safeRefreshDashboard(adminUnit);
        loadNotifications();
      } catch (err) {
        showSaveFailureModal(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // ------------------------------------------------------------
  // [BARU] PANEL "KELOLA WARGA" (ADMIN) — daftar/ubah/reset PIN unit.
  // ------------------------------------------------------------
  const userAdminBtn = $("#userAdminBtn");
  const userManagerDialog = $("#userManagerDialog");
  const userManagerRefreshBtn = $("#userManagerRefreshBtn");
  const userManagerAddBtn = $("#userManagerAddBtn");
  const userForm = $("#userForm");
  const userFormDialog = $("#userFormDialog");
  const userFormRandomPinBtn = $("#userFormRandomPinBtn");
  const resetPinForm = $("#resetPinForm");
  const resetPinDialog = $("#resetPinDialog");

  if (userAdminBtn && userManagerDialog) {
    userAdminBtn.addEventListener("click", () => {
      userManagerDialog.showModal();
      loadUserManagerGrid();
    });
  }

  if (userManagerRefreshBtn) {
    userManagerRefreshBtn.addEventListener("click", () =>
      loadUserManagerGrid(),
    );
  }

  if (userManagerAddBtn) {
    userManagerAddBtn.addEventListener("click", () => openUserForm(null));
  }

  if (userFormRandomPinBtn) {
    userFormRandomPinBtn.addEventListener("click", () => {
      const pinInput = userForm.querySelector("[name='pin']");
      if (pinInput) {
        pinInput.value = String(Math.floor(100000 + Math.random() * 900000));
        pinInput.type = "text"; // supaya admin bisa lihat & catatkan PIN-nya
      }
    });
  }

  if (userForm) {
    userForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(userForm));
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const isEdit = !!userForm.dataset.editingUnit;
      const submitBtn = $("#userFormSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Menyimpan...";

      try {
        const result = await sendToBackend(
          isEdit ? "adminUpdateUnit" : "adminRegisterUnit",
          {
            adminUnit,
            unit: isEdit ? userForm.dataset.editingUnit : formData.unit,
            name: formData.name,
            role: formData.role,
            pin: formData.pin,
          },
        );
        showAppModal(
          isEdit ? "Unit Diperbarui" : "Unit Terdaftar",
          result.message,
          true,
        );
        userFormDialog?.close();
        loadUserManagerGrid();
      } catch (err) {
        showToast(`Gagal: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  if (resetPinForm) {
    resetPinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(resetPinForm));
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const unit = resetPinForm.dataset.resetUnit;
      const submitBtn = $("#resetPinSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Memproses...";

      try {
        const result = await sendToBackend("adminResetUnitPin", {
          adminUnit,
          unit,
          newPin: formData.newPin,
        });
        // [BARU] PIN baru ditampilkan lewat modal yang TIDAK otomatis
        // hilang (bukan toast), supaya admin sempat mencatat/menyalinnya
        // sebelum menyampaikan ke warga secara pribadi.
        showAppModal("PIN Berhasil Direset", result.message, true);
        resetPinDialog?.close();
      } catch (err) {
        showToast(`Gagal: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // ------------------------------------------------------------
  // PANEL "KELOLA KONTEN" (ADMIN)
  // ------------------------------------------------------------
  const contentAdminBtn = $("#contentAdminBtn");
  const contentManagerDialog = $("#contentManagerDialog");
  const contentTypeSelect = $("#contentTypeSelect");
  const contentRefreshBtn = $("#contentRefreshBtn");
  const contentAddBtn = $("#contentAddBtn");
  const contentBulkUploadBtn = $("#contentBulkUploadBtn");
  const contentFormDialog = $("#contentFormDialog");
  const contentForm = $("#contentForm");

  // [BARU] Fix #2: tombol "Upload Massal" cuma tampil untuk kategori yang
  // memang butuh rostering banyak baris sekaligus (Tukang Sampah & Security).
  function updateBulkUploadBtnVisibility() {
    if (!contentBulkUploadBtn) return;
    const isDutyType =
      activeContentTab === "sampah" || activeContentTab === "security";
    contentBulkUploadBtn.style.display = isDutyType ? "inline-flex" : "none";
  }

  if (contentAdminBtn && contentManagerDialog) {
    contentAdminBtn.addEventListener("click", () => {
      contentManagerDialog.showModal();
      if (contentTypeSelect) contentTypeSelect.value = activeContentTab;
      updateBulkUploadBtnVisibility();
      loadContentManagerGrid(activeContentTab);
    });
  }

  // [BARU] Fix #2: dropdown kategori menggantikan 7 tombol tab horizontal
  // yang sebelumnya bikin panel terasa sesak/berantakan.
  if (contentTypeSelect) {
    contentTypeSelect.addEventListener("change", () => {
      activeContentTab = contentTypeSelect.value;
      updateBulkUploadBtnVisibility();
      loadContentManagerGrid(activeContentTab);
    });
  }

  if (contentRefreshBtn) {
    contentRefreshBtn.addEventListener("click", () =>
      loadContentManagerGrid(activeContentTab),
    );
  }

  if (contentAddBtn) {
    contentAddBtn.addEventListener("click", () =>
      openContentForm(activeContentTab, null),
    );
  }

  // ------------------------------------------------------------
  // [BARU] Fix #2: UPLOAD MASSAL — admin tempel data dari Excel sekaligus
  // (banyak baris shift), diparse jadi banyak kartu, dikirim dalam SATU
  // request backend (bukan satu-satu), jauh lebih cepat untuk rostering.
  // ------------------------------------------------------------
  const bulkUploadDialog = $("#bulkUploadDialog");
  const bulkUploadForm = $("#bulkUploadForm");
  const bulkUploadTextarea = $("#bulkUploadTextarea");
  const bulkUploadPreview = $("#bulkUploadPreview");

  // Menerima paste dari Excel (dipisah TAB) maupun ketik manual (dipisah ";").
  // Kolom: Nama, Hari (dipisah koma), JamMulai, JamSelesai, Telepon(opsional).
  function parseBulkUploadText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = (
          line.includes("\t") ? line.split("\t") : line.split(";")
        ).map((c) => (c || "").trim());
        const [title, days, timeStart, timeEnd, phone] = cols;
        return {
          title: title || "",
          days: days || "",
          timeStart: timeStart || "",
          timeEnd: timeEnd || "",
          phone: phone || "",
        };
      })
      .filter((item) => item.title); // baris tanpa nama dianggap tidak valid, dilewati
  }

  if (contentBulkUploadBtn && bulkUploadDialog) {
    contentBulkUploadBtn.addEventListener("click", () => {
      const label =
        CONTENT_TYPE_META[activeContentTab]?.label || activeContentTab;
      $("#bulkUploadEyebrow").textContent = "UPLOAD MASSAL · " + label;
      $("#bulkUploadTitle").textContent = "Upload Rostering " + label;
      if (bulkUploadTextarea) bulkUploadTextarea.value = "";
      if (bulkUploadPreview) bulkUploadPreview.textContent = "";
      bulkUploadDialog.showModal();
    });
  }

  if (bulkUploadTextarea && bulkUploadPreview) {
    bulkUploadTextarea.addEventListener("input", () => {
      const items = parseBulkUploadText(bulkUploadTextarea.value);
      bulkUploadPreview.textContent = items.length
        ? `✅ ${items.length} baris terdeteksi valid & siap diupload.`
        : "";
    });
  }

  if (bulkUploadForm) {
    bulkUploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const items = parseBulkUploadText(bulkUploadTextarea.value);
      if (!items.length) {
        showToast(
          "Tidak ada baris valid untuk diupload. Pastikan kolom Nama terisi.",
        );
        return;
      }
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const submitBtn = $("#bulkUploadSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Mengupload...";
      try {
        const result = await sendToBackend("adminBulkAddContentCards", {
          adminUnit,
          type: activeContentTab,
          items,
        });
        showToast(result.message);
        bulkUploadDialog?.close();
        bustContentCache();
        loadContentManagerGrid(activeContentTab);
        refreshPublicContentIfOpen(activeContentTab);
      } catch (err) {
        showSaveFailureModal(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // [BARU FIX #2/#3] Tombol diagnostik: admin bisa langsung tes apakah push
  // notification benar2 berfungsi ke HP-nya sendiri, tanpa perlu menebak-nebak
  // kenapa warga tidak menerima notifikasi.
  const testPushBtn = $("#testPushBtn");
  if (testPushBtn) {
    testPushBtn.addEventListener("click", async () => {
      const testUnit = localStorage.getItem("pondok_rajeg_user");
      const originalText = testPushBtn.innerHTML;
      testPushBtn.innerHTML = "Menguji...";
      testPushBtn.disabled = true;
      try {
        const result = await sendToBackend(
          "checkPushSetup",
          { testUnit },
          { silent: true },
        );
        const d = result.data || result;
        const lines = [
          `Kredensial FCM di server: ${d.credentialsConfigured ? "✅ Sudah diatur" : "❌ BELUM diatur (Script Properties)"}`,
          `Jumlah perangkat warga terdaftar: ${d.tokenCount}`,
          `Riwayat kegagalan aktivasi push (lihat sheet "PushErrorLogs" untuk detail): ${d.errorLogCount || 0} kejadian`,
          `Hasil tes kirim ke HP ini (${testUnit}): ${d.testResult || "-"}`,
        ];
        showAppModal(
          "Diagnostik Push Notification",
          lines.join("\n\n"),
          d.credentialsConfigured && d.tokenCount > 0,
        );
      } catch (err) {
        showAppModal(
          "Diagnostik Push Notification",
          `Gagal menjalankan diagnostik: ${err.message}`,
          false,
        );
      } finally {
        testPushBtn.innerHTML = originalText;
        testPushBtn.disabled = false;
      }
    });
  }

  if (contentForm) {
    contentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(contentForm));
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const submitBtn = $("#contentFormSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Menyimpan...";

      const isEdit = !!formData.contentId;
      // Fix #1/#2: untuk kartu Jasa/Internet, kategori FINAL yang disimpan
      // mengikuti dropdown "Kategori" di form (formData.category) — bukan
      // cuma tab admin mana yang kebetulan aktif saat tombol "+ Tambah Kartu"
      // diklik. Ini membuat data selalu konsisten & mencegah kartu tersimpan
      // dengan kategori yang salah/tidak sesuai.
      const isServiceType =
        formData.contentType === "jasa" || formData.contentType === "internet";
      const finalType =
        isServiceType && formData.category
          ? formData.category
          : formData.contentType;

      // [BARU] Fix #4/#5: FormData + Object.fromEntries() TIDAK bisa menangani
      // banyak checkbox dengan name="days" yang sama (cuma ambil nilai
      // terakhir) — jadi hari yang dicentang diambil terpisah lewat query
      // checkbox :checked, lalu digabung jadi teks dipisah koma.
      const selectedDays = Array.from(
        contentForm.querySelectorAll("[name='days']:checked"),
      )
        .map((cb) => cb.value)
        .join(",");

      const payload = {
        adminUnit,
        id: formData.contentId,
        type: finalType,
        title: formData.title,
        subtitle: formData.subtitle,
        description: formData.description,
        phone: formData.phone,
        linkUrl: formData.linkUrl,
        imageUrl: formData.imageUrl,
        order: Number(formData.order) || 0,
        // [BARU] Fix #1: digabung dari 2 dropdown Jam+Menit terpisah (bukan
        // lagi 1 input[type="time"]), lihat getTimeSelectValue().
        timeStart: getTimeSelectValue(contentForm, "timeStart"),
        timeEnd: getTimeSelectValue(contentForm, "timeEnd"),
        days: selectedDays,
      };

      try {
        const result = await sendToBackend(
          isEdit ? "adminUpdateContentCard" : "adminAddContentCard",
          payload,
        );
        showToast(result.message);
        contentFormDialog?.close();
        // Versi konten di server sudah berubah (backend men-bump versi) -> buang
        // cache lokal supaya panel admin & dialog warga sama-sama ambil data baru.
        bustContentCache();
        loadContentManagerGrid(activeContentTab);
        refreshPublicContentIfOpen(finalType);
        if (finalType !== formData.contentType) {
          // Kategori sempat diganti admin lewat dropdown (mis. dari Jasa ke
          // Internet) -> segarkan juga tab/pane asalnya kalau kebetulan terbuka.
          refreshPublicContentIfOpen(formData.contentType);
        }
      } catch (err) {
        showSaveFailureModal(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const rejectReasonForm = $("#rejectReasonForm");
  const rejectReasonDialog = $("#rejectReasonDialog");
  if (rejectReasonForm) {
    rejectReasonForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!rejectTarget) return;
      const adminUnit = localStorage.getItem("pondok_rajeg_user");
      const reasonInput = $("#rejectReasonText");
      const reason = reasonInput ? reasonInput.value.trim() : "";
      const submitBtn = rejectReasonForm.querySelector("button[type='submit']");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Memproses...";

      try {
        const result = await sendToBackend("adminRejectPayment", {
          adminUnit,
          rowIndex: rejectTarget.rowIndex,
          timestamp: rejectTarget.timestamp,
          unit: rejectTarget.unit,
          reason,
        });
        rejectReasonDialog?.close();
        showToast(result.message);
        rejectTarget = null;
        loadAdminPending();
      } catch (err) {
        showSaveFailureModal(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // [BARU] Fix #4/#6: "Update Warga" sekarang HALAMAN TERSENDIRI (bukan
  // scroll-ke-section di Beranda lagi) — showAppPage() menoggle visibilitas
  // #homePageView <-> #feedPageView & status aktif tab bawah, mirip app
  // native modern, bukan cuma widget di dashboard.
  const homePageView = $("#homePageView");
  const feedPageView = $("#feedPageView");
  const navHomeBtn = document.querySelector('.nav-item[data-page="home"]');
  const navFeedBtn = $("#navFeedBtn");

  function showAppPage(page) {
    const isFeed = page === "feed";
    if (homePageView) homePageView.style.display = isFeed ? "none" : "";
    if (feedPageView) feedPageView.style.display = isFeed ? "" : "none";
    if (navHomeBtn) navHomeBtn.classList.toggle("active", !isFeed);
    if (navFeedBtn) navFeedBtn.classList.toggle("active", isFeed);
    // Scroll ke atas tiap pindah halaman, biar tidak "nyangkut" di posisi
    // scroll halaman sebelumnya.
    $(".main-content")?.scrollTo({ top: 0, behavior: "instant" });
  }
  // Diekspos ke scope global supaya goToPost() (dipanggil dari notifikasi)
  // bisa memanggil ini juga sebelum scroll ke postingan yang dituju.
  window.showAppPage = showAppPage;

  if (navFeedBtn) {
    navFeedBtn.addEventListener("click", () => showAppPage("feed"));
  }
  if (navHomeBtn) {
    navHomeBtn.addEventListener("click", () => showAppPage("home"));
  }

  // ------------------------------------------------------------
  // [BARU] Responsif: di mobile, Update Warga tetap halaman terpisah
  // (#feedPageView, ditoggle showAppPage). Di DESKTOP (>=1024px, breakpoint
  // sama seperti dipakai di seluruh app ini), kontennya dipindah jadi
  // sidebar tetap terlihat di kolom kanan (#feedDesktopSlot) — supaya warga
  // desktop tidak perlu "pindah halaman" untuk lihat linimasa, sesuai
  // preferensi tata letak yang diminta. Memindah ELEMEN ASLINYA (bukan
  // clone), jadi semua event listener composer/like/komentar tetap utuh —
  // pola yang sama seperti buildQuickAccessCarousel() di tempat lain.
  // ------------------------------------------------------------
  const FEED_DESKTOP_BREAKPOINT = 1024;
  function syncFeedPlacement() {
    const feedDesktopSlot = $("#feedDesktopSlot");
    const feedSectionEl = document.querySelector(".feed-page-hero");
    if (!feedDesktopSlot || !feedPageView || !feedSectionEl) return;

    const isDesktop = window.innerWidth >= FEED_DESKTOP_BREAKPOINT;
    if (isDesktop) {
      if (feedSectionEl.parentElement !== feedDesktopSlot) {
        feedDesktopSlot.appendChild(feedSectionEl);
      }
      feedDesktopSlot.style.display = "";
      // Halaman mobile-nya dikosongkan tampilannya (kontennya sudah pindah
      // ke sidebar); tidak perlu diatur oleh showAppPage lagi di lebar ini.
      feedPageView.style.display = "none";
    } else {
      if (feedSectionEl.parentElement !== feedPageView) {
        feedPageView.appendChild(feedSectionEl);
      }
      feedDesktopSlot.style.display = "none";
      // TIDAK menyentuh feedPageView.style.display di sini — biar tetap
      // dikendalikan oleh showAppPage() sesuai tab bawah yang aktif.
    }
  }
  syncFeedPlacement();

  let feedResizeTimer = null;
  let feedWasDesktop = window.innerWidth >= FEED_DESKTOP_BREAKPOINT;
  window.addEventListener("resize", () => {
    clearTimeout(feedResizeTimer);
    feedResizeTimer = setTimeout(() => {
      const nowDesktop = window.innerWidth >= FEED_DESKTOP_BREAKPOINT;
      if (nowDesktop !== feedWasDesktop) {
        feedWasDesktop = nowDesktop;
        syncFeedPlacement();
      }
    }, 200);
  });

  document.querySelectorAll("[data-page='ipl']").forEach((b) => {
    b.addEventListener("click", async () => {
      const iplDialog = $("#iplDialog");
      const savedUser = localStorage.getItem("pondok_rajeg_user") || "";
      const savedName = localStorage.getItem("pondok_rajeg_name") || savedUser;

      const unitField = $("#paymentForm [name='unit']");
      const nameField = $("#paymentForm [name='name']");
      if (unitField) unitField.value = savedUser;
      if (nameField) nameField.value = savedName;

      const methodSelect = $("#paymentMethodSelect");
      if (methodSelect) {
        methodSelect.value = "Transfer Bank";
        updatePaymentMethodUI("Transfer Bank");
      }

      const monthsContainer = $("#monthsPickerContainer");
      if (monthsContainer) {
        monthsContainer.innerHTML = `<div class="empty-state-box" style="border: 0;">Memuat daftar tagihan...</div>`;
      }
      updateSelectedMonthsSummary();

      if (iplDialog) iplDialog.showModal();

      if (savedUser) {
        try {
          const data = await refreshDashboard(savedUser);
          renderMonthsPicker((data && data.unpaidMonths) || []);
        } catch (err) {
          if (monthsContainer) {
            monthsContainer.innerHTML = `<div class="empty-state-box" style="border: 0; color: #dc2626;">Gagal memuat daftar tagihan.</div>`;
          }
        }
      }
    });
  });

  const paymentMethodSelect = $("#paymentMethodSelect");
  if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener("change", (e) =>
      updatePaymentMethodUI(e.target.value),
    );
  }

  const selectAllUnpaidBtn = $("#selectAllUnpaidBtn");
  const selectNoneBtn = $("#selectNoneBtn");
  if (selectAllUnpaidBtn) {
    selectAllUnpaidBtn.addEventListener("click", () => {
      document
        .querySelectorAll("#monthsPickerContainer input[name='selectedMonth']")
        .forEach((cb) => {
          cb.checked = true;
          cb.closest(".month-row")?.classList.add("checked");
        });
      updateSelectedMonthsSummary();
    });
  }
  if (selectNoneBtn) {
    selectNoneBtn.addEventListener("click", () => {
      document
        .querySelectorAll("#monthsPickerContainer input[name='selectedMonth']")
        .forEach((cb) => {
          cb.checked = false;
          cb.closest(".month-row")?.classList.remove("checked");
        });
      updateSelectedMonthsSummary();
    });
  }

  const openProfileModalBtnMobile = $("#openProfileModalBtnMobile");
  const topbarProfileBtn = $("#topbarProfileBtn");
  const profileDialog = $("#profileDialog");
  const maritalStatusSelect = $("#maritalStatusSelect");
  const wifeFields = $("#wifeFields");
  const headTitleLabel = $("#headTitleLabel");
  const headGenderSelect = $("#headGenderSelect");
  const addTanggunganBtn = $("#addTanggunganBtn");
  const profileForm = $("#profileForm");

  setupWhatsAppFormatter(profileForm?.querySelector("[name='headWhatsApp']"));
  setupWhatsAppFormatter(profileForm?.querySelector("[name='wifeWhatsApp']"));

  let profileDataLoadedState = false;

  const updateMaritalUI = (status) => {
    if (!wifeFields || !headTitleLabel || !headGenderSelect) return;
    if (status === "Menikah") {
      wifeFields.style.display = "block";
      headTitleLabel.textContent = "Data Kepala Keluarga (Suami)";
      headGenderSelect.value = "Laki-laki";
      headGenderSelect.disabled = true;
    } else if (status === "Duda") {
      wifeFields.style.display = "none";
      headTitleLabel.textContent = "Data Kepala Keluarga (Duda)";
      headGenderSelect.value = "Laki-laki";
      headGenderSelect.disabled = true;
    } else if (status === "Janda") {
      wifeFields.style.display = "none";
      headTitleLabel.textContent = "Data Kepala Keluarga (Janda)";
      headGenderSelect.value = "Perempuan";
      headGenderSelect.disabled = true;
    } else {
      wifeFields.style.display = "none";
      headTitleLabel.textContent = "Data Warga (Lajang)";
      headGenderSelect.disabled = false;
    }
  };

  const populateProfileForm = (savedProfile) => {
    if (!profileForm) return;
    if (savedProfile.houseKK)
      profileForm.querySelector("[name='houseKK']").value =
        savedProfile.houseKK;
    if (savedProfile.houseStatus)
      profileForm.querySelector("[name='houseStatus']").value =
        savedProfile.houseStatus;
    if (savedProfile.maritalStatus && maritalStatusSelect) {
      maritalStatusSelect.value = savedProfile.maritalStatus;
    }
    updateMaritalUI(
      maritalStatusSelect ? maritalStatusSelect.value : "Menikah",
    );

    if (savedProfile.headName)
      profileForm.querySelector("[name='headName']").value =
        savedProfile.headName;
    if (savedProfile.headNik)
      profileForm.querySelector("[name='headNik']").value =
        savedProfile.headNik;
    if (savedProfile.headDob)
      profileForm.querySelector("[name='headDob']").value =
        savedProfile.headDob;
    if (savedProfile.headWhatsApp)
      profileForm.querySelector("[name='headWhatsApp']").value =
        savedProfile.headWhatsApp;

    if (savedProfile.wifeName)
      profileForm.querySelector("[name='wifeName']").value =
        savedProfile.wifeName;
    if (savedProfile.wifeNik)
      profileForm.querySelector("[name='wifeNik']").value =
        savedProfile.wifeNik;
    if (savedProfile.wifeDob)
      profileForm.querySelector("[name='wifeDob']").value =
        savedProfile.wifeDob;
    if (savedProfile.wifeWhatsApp)
      profileForm.querySelector("[name='wifeWhatsApp']").value =
        savedProfile.wifeWhatsApp;

    renderTanggunganInputs(savedProfile.tanggungan || []);
  };

  const openProfileHandler = async () => {
    if (!profileDialog) return;
    const cachedProfile = localStorage.getItem(PROFILE_KEY);
    if (cachedProfile && profileDataLoadedState) {
      profileDialog.showModal();
      return;
    }
    profileDialog.showModal();
    if (!cachedProfile) {
      const unit = localStorage.getItem("pondok_rajeg_user") || "";
      try {
        const result = await sendToBackend(
          "getProfile",
          { unit },
          { silent: true },
        );
        if (result.ok && result.profile) {
          localStorage.setItem(PROFILE_KEY, JSON.stringify(result.profile));
          populateProfileForm(result.profile);
        } else {
          populateProfileForm({});
        }
      } catch (e) {
        populateProfileForm({});
      }
    } else {
      populateProfileForm(JSON.parse(cachedProfile));
    }
    profileDataLoadedState = true;
  };

  if (openProfileModalBtnMobile)
    openProfileModalBtnMobile.addEventListener("click", openProfileHandler);
  if (topbarProfileBtn)
    topbarProfileBtn.addEventListener("click", openProfileHandler);

  const closeProfileBtn = $("#closeProfileBtn");
  const profileCloseConfirmDialog = $("#profileCloseConfirmDialog");
  const confirmCloseProfile = $("#confirmCloseProfile");

  if (closeProfileBtn && profileCloseConfirmDialog) {
    closeProfileBtn.addEventListener("click", () => {
      profileCloseConfirmDialog.showModal();
    });
  }

  if (confirmCloseProfile) {
    confirmCloseProfile.addEventListener("click", () => {
      profileCloseConfirmDialog.close();
      if (profileDialog) profileDialog.close();
      showToast("Perubahan dibatalkan.");
    });
  }

  if (maritalStatusSelect) {
    maritalStatusSelect.addEventListener("change", (e) =>
      updateMaritalUI(e.target.value),
    );
  }

  if (addTanggunganBtn) {
    addTanggunganBtn.addEventListener("click", () => {
      const container = $("#tanggunganContainer");
      if (!container) return;
      if (container.querySelector("small")) container.innerHTML = "";
      container.appendChild(buildTanggunganCard({}));
      container.scrollTop = container.scrollHeight;
    });
  }

  // [BARU] Fix #3/#4: tombol coba-ulang aktivasi push notification dari
  // modal Profil (lihat requestNotificationPermission untuk detail error).
  // isManualRetry=true supaya hasilnya ditampilkan lewat modal modern
  // (bukan cuma senyap seperti pemanggilan otomatis saat login).
  const retryPushPermissionBtn = $("#retryPushPermissionBtn");
  if (retryPushPermissionBtn) {
    retryPushPermissionBtn.addEventListener("click", async () => {
      const originalText = retryPushPermissionBtn.innerHTML;
      retryPushPermissionBtn.innerHTML = "Mencoba...";
      retryPushPermissionBtn.disabled = true;
      try {
        await requestNotificationPermission(true);
      } finally {
        retryPushPermissionBtn.innerHTML = originalText;
        retryPushPermissionBtn.disabled = false;
      }
    });
  }

  // [BARU] Tombol "Coba Lagi" DI DALAM modal gagal itu sendiri — supaya
  // warga bisa langsung coba ulang tanpa harus tutup modal & cari tombol
  // di Profil lagi.
  const pushErrorRetryBtn = $("#pushErrorRetryBtn");
  const pushErrorDialog = $("#pushErrorDialog");
  if (pushErrorRetryBtn && pushErrorDialog) {
    pushErrorRetryBtn.addEventListener("click", async () => {
      const originalText = pushErrorRetryBtn.innerHTML;
      pushErrorRetryBtn.innerHTML = "Mencoba...";
      pushErrorRetryBtn.disabled = true;
      try {
        pushErrorDialog.close();
        await requestNotificationPermission(true);
      } finally {
        pushErrorRetryBtn.innerHTML = originalText;
        pushErrorRetryBtn.disabled = false;
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(profileForm);
      const newPin = formData.get("newPin")
        ? formData.get("newPin").trim()
        : "";
      const confirmPin = formData.get("confirmPin")
        ? formData.get("confirmPin").trim()
        : "";

      if (newPin || confirmPin) {
        if (newPin !== confirmPin) {
          showToast("Konfirmasi PIN baru tidak cocok.");
          return;
        }
        if (newPin.length < 4) {
          showToast("PIN minimal harus terdiri dari 4 digit.");
          return;
        }
      }

      const submitBtn = profileForm.querySelector("button[type='submit']");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Menyimpan ke Server... ⏳";

      const currentUnit =
        localStorage.getItem("pondok_rajeg_user") || "Unknown";

      const tanggungan = collectTanggungan();
      const headGender = headGenderSelect
        ? headGenderSelect.value
        : formData.get("headGender") || "Laki-laki";

      const profileData = {
        unit: currentUnit,
        houseKK: formData.get("houseKK"),
        houseStatus: formData.get("houseStatus"),
        maritalStatus: formData.get("maritalStatus"),
        headName: formData.get("headName") || "",
        headNik: formData.get("headNik") || "",
        headDob: formData.get("headDob") || "",
        headGender: headGender,
        headWhatsApp: formData.get("headWhatsApp") || "",
        wifeName: formData.get("wifeName") || "",
        wifeNik: formData.get("wifeNik") || "",
        wifeDob: formData.get("wifeDob") || "",
        wifeWhatsApp: formData.get("wifeWhatsApp") || "",
        tanggungan: tanggungan,
        newPin,
      };

      try {
        const result = await sendToBackend("profile", profileData);
        const cacheCopy = Object.assign({}, profileData);
        delete cacheCopy.newPin;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(cacheCopy));
        profileDialog.close();
        showToast(result.message);
        profileForm.querySelector("[name='newPin']").value = "";
        profileForm.querySelector("[name='confirmPin']").value = "";
      } catch (error) {
        showSaveFailureModal(error);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const tukangBtn = $("#tukangBtn");
  const tukangDialog = $("#tukangDialog");
  if (tukangBtn && tukangDialog) {
    tukangBtn.addEventListener("click", () => {
      tukangDialog.showModal();
      loadTukangList();
      loadInternetList();
    });
  }

  const tukangTabBtns = document.querySelectorAll("[data-tukangtab]");
  tukangTabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      tukangTabBtns.forEach((b) => b.classList.remove("active"));
      const target = e.currentTarget;
      target.classList.add("active");
      const tabType = target.getAttribute("data-tukangtab");
      const jasaPane = $("#tukangListContent");
      const internetPane = $("#internetListContent");
      if (jasaPane)
        jasaPane.style.display = tabType === "jasa" ? "block" : "none";
      if (internetPane)
        internetPane.style.display = tabType === "internet" ? "block" : "none";
    });
  });

  const healthBtn = $("#healthBtn");
  const healthDialog = $("#healthDialog");
  if (healthBtn && healthDialog) {
    healthBtn.addEventListener("click", () => {
      healthDialog.showModal();
      loadHealthList();
    });
  }

  const infoBtn = $("#infoBtn");
  const infoDialog = $("#infoDialog");
  if (infoBtn && infoDialog) {
    infoBtn.addEventListener("click", () => {
      backToInfoList();
      infoDialog.showModal();
      loadAnnouncements();
      loadAdartDoc();
    });
  }

  const backToInfoListBtn = $("#backToInfoListBtn");
  if (backToInfoListBtn) {
    backToInfoListBtn.addEventListener("click", backToInfoList);
  }

  const infoTabBtns = document.querySelectorAll("[data-infotab]");
  infoTabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      infoTabBtns.forEach((b) => b.classList.remove("active"));
      const target = e.currentTarget;
      target.classList.add("active");
      const tabType = target.getAttribute("data-infotab");
      const announcementsPane = $("#infoAnnouncementsContent");
      const adartPane = $("#infoAdartContent");
      const detailPane = $("#infoArticleDetailContent");
      if (detailPane) detailPane.style.display = "none";
      if (tabType === "announcements") {
        if (announcementsPane) announcementsPane.style.display = "block";
        if (adartPane) adartPane.style.display = "none";
      } else {
        if (announcementsPane) announcementsPane.style.display = "none";
        if (adartPane) adartPane.style.display = "block";
      }
    });
  });

  const openComplaintModalBtn = $("#openComplaintModalBtn");
  const openComplaintModalBtnRight = $("#openComplaintModalBtnRight");
  const complaintDialog = $("#complaintDialog");
  // [BARU] Fix #6: khusus admin, field "Lokasi/Blok" diisi daftar unit
  // warga terdaftar (dari sheet Users) via <datalist> — bisa dicari/pilih,
  // TAPI tetap bebas diketik manual (bukan dikunci ke pilihan saja). Warga
  // biasa tidak perlu ini karena cuma punya 1 unit (dirinya sendiri).
  let unitDatalistLoaded = false;
  async function populateUnitDatalist() {
    if (unitDatalistLoaded) return;
    const datalist = $("#unitDatalist");
    if (!datalist) return;
    const adminUnit = localStorage.getItem("pondok_rajeg_user");
    try {
      const result = await sendToBackend(
        "adminListUsers",
        { adminUnit },
        { silent: true },
      );
      const users = result.users || [];
      datalist.innerHTML = users
        .map(
          (u) =>
            `<option value="${escapeHtml(u.unit)}">${escapeHtml(u.name)}</option>`,
        )
        .join("");
      unitDatalistLoaded = true;
    } catch (err) {
      console.error("Gagal memuat daftar unit untuk autofill lokasi:", err);
    }
  }

  const showComplaintModal = () => {
    const role = localStorage.getItem(ROLE_KEY);
    const locationInput = complaintForm?.querySelector("[name='location']");

    if (role === "admin") {
      // Admin: JANGAN autofill (mereka melapor atas nama unit lain, bukan
      // dirinya sendiri) — tapi siapkan datalist supaya bisa cari/pilih.
      populateUnitDatalist();
    } else {
      // Warga: autofill sesuai unit yang sedang login, supaya tidak perlu
      // ketik ulang manual. Tetap bisa diubah kalau masalahnya di lokasi
      // lain (fasilitas umum, dsb).
      if (locationInput && !locationInput.value) {
        locationInput.value = localStorage.getItem("pondok_rajeg_user") || "";
      }
    }
    complaintDialog?.showModal();
  };
  if (openComplaintModalBtn)
    openComplaintModalBtn.addEventListener("click", showComplaintModal);
  if (openComplaintModalBtnRight)
    openComplaintModalBtnRight.addEventListener("click", showComplaintModal);

  const complaintForm = $("#complaintForm");
  if (complaintForm) {
    complaintForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const unit = localStorage.getItem("pondok_rajeg_user") || "";
      const name = localStorage.getItem("pondok_rajeg_name") || unit;
      const record = {
        category: data.category,
        location: data.location,
        description: data.description,
        status: "Menunggu",
      };
      complaintDialog?.close();
      e.currentTarget.reset();

      const submitBtn = complaintForm.querySelector("button[type='submit']");
      const origBtnText = submitBtn ? submitBtn.innerHTML : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "Mengirim...";
      }

      try {
        // [FIX BUG #8] Sebelumnya pengaduan disimpan optimis ke localStorage
        // (jadi terlihat "berhasil" walau kirimnya gagal, dan HILANG kalau
        // ganti device). Sekarang menunggu konfirmasi backend dulu, baru
        // memuat ulang daftar LANGSUNG DARI SERVER — satu sumber data,
        // konsisten di semua perangkat warga tsb login.
        await sendToBackend("complaint", { ...record, unit, name });
        showToast("Laporan pengaduan berhasil dikirim.");
        loadAndRenderComplaints();
      } catch (err) {
        showToast(`Gagal mengirim pengaduan: ${err.message}`);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnText;
        }
      }
    });
  }

  const panicButton = $("#panicButton");
  const panicDialog = $("#panicDialog");
  const panicForm = $("#panicForm");
  const panicEmergencySelect = $("#panicEmergencySelect");
  const panicOtherDetailLabel = $("#panicOtherDetailLabel");

  if (panicButton && panicDialog) {
    panicButton.addEventListener("click", () => panicDialog.showModal());
  }

  // [FIX #3] Field "Keterangan Tambahan" hanya muncul saat kategori
  // "Lainnya" dipilih di dropdown darurat.
  if (panicEmergencySelect && panicOtherDetailLabel) {
    panicEmergencySelect.addEventListener("change", () => {
      const isOther = panicEmergencySelect.value === "Lainnya";
      panicOtherDetailLabel.style.display = isOther ? "block" : "none";
      panicOtherDetailLabel.querySelector("textarea").required = isOther;
      if (!isOther) panicOtherDetailLabel.querySelector("textarea").value = "";
    });
  }

  if (panicForm) {
    panicForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(panicForm);
      const type = formData.get("emergency") || "Darurat";
      const description = String(formData.get("description") || "").trim();
      const unit = localStorage.getItem("pondok_rajeg_user") || "";
      const name = localStorage.getItem("pondok_rajeg_name") || unit;

      if (!unit) {
        showToast("Sesi tidak dikenali. Silakan masuk ulang.");
        return;
      }

      const submitBtn = panicForm.querySelector("button[type='submit']");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Mengirim sinyal... ⏳";

      try {
        const result = await sendToBackend("broadcastPanic", {
          unit,
          name,
          type,
          description,
        });
        panicDialog?.close();
        showAppModal("Sinyal Darurat Terkirim", result.message, true);
        loadNotifications();
      } catch (err) {
        showAppModal("Sinyal Gagal Terkirim", err.message, false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const postComposerDialog = $("#postComposerDialog");
  const postComposerForm = $("#postComposerForm");
  const openPostComposerBtn = $("#openPostComposerBtn");
  const bottomNavPostBtn = $("#bottomNavPostBtn");
  const postPhotoInput = $("#postPhotoInput");
  const postPhotoCameraInput = $("#postPhotoCameraInput");
  const postPhotoCameraBtn = $("#postPhotoCameraBtn");
  const postPhotoGalleryBtn = $("#postPhotoGalleryBtn");
  const postPhotoPreviewWrap = $("#postPhotoPreviewWrap");
  const postPhotoPreview = $("#postPhotoPreview");

  // [BARU] Fix #1: state file terpadu — dipilih baik lewat tombol "Ambil
  // Foto" (kamera langsung) maupun "Pilih dari Galeri", keduanya menyimpan
  // ke variabel yang sama supaya logic preview & submit tidak perlu tahu
  // dari input mana asalnya.
  let selectedPostFile = null;

  const openPostComposer = () => {
    if (postComposerForm) postComposerForm.reset();
    if (postPhotoPreviewWrap) postPhotoPreviewWrap.style.display = "none";
    selectedPostFile = null;
    postComposerDialog?.showModal();
  };
  if (openPostComposerBtn)
    openPostComposerBtn.addEventListener("click", openPostComposer);
  if (bottomNavPostBtn)
    bottomNavPostBtn.addEventListener("click", openPostComposer);

  if (postPhotoCameraBtn && postPhotoCameraInput) {
    postPhotoCameraBtn.addEventListener("click", () =>
      postPhotoCameraInput.click(),
    );
  }
  if (postPhotoGalleryBtn && postPhotoInput) {
    postPhotoGalleryBtn.addEventListener("click", () => postPhotoInput.click());
  }

  async function handlePostPhotoSelected(file) {
    if (!file) return;
    selectedPostFile = file;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      if (postPhotoPreview) postPhotoPreview.src = dataUrl;
      if (postPhotoPreviewWrap) postPhotoPreviewWrap.style.display = "block";
    } catch (err) {
      showToast("Gagal memuat pratinjau foto.");
    }
  }

  if (postPhotoCameraInput) {
    postPhotoCameraInput.addEventListener("change", () => {
      const file = postPhotoCameraInput.files && postPhotoCameraInput.files[0];
      if (postPhotoInput) postPhotoInput.value = ""; // pastikan tidak dobel dgn input lain
      handlePostPhotoSelected(file);
    });
  }
  if (postPhotoInput) {
    postPhotoInput.addEventListener("change", () => {
      const file = postPhotoInput.files && postPhotoInput.files[0];
      if (postPhotoCameraInput) postPhotoCameraInput.value = "";
      handlePostPhotoSelected(file);
    });
  }

  if (postComposerForm) {
    postComposerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const textInput = postComposerForm.querySelector("[name='text']");
      const text = textInput ? textInput.value.trim() : "";
      if (!text) {
        showToast("Tulis sesuatu dulu sebelum posting.");
        return;
      }

      const unit = localStorage.getItem("pondok_rajeg_user") || "";
      const name = localStorage.getItem("pondok_rajeg_name") || unit;
      const submitBtn = $("#postSubmitBtn");
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Memposting...";

      try {
        let imageDataUrl = null;
        const file = selectedPostFile;
        if (file) imageDataUrl = await resizeImageToDataUrl(file);

        const docRef = await db.collection("posts").add({
          unit,
          name,
          text,
          imageDataUrl: imageDataUrl || null,
          likes: {},
          comments: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        postComposerDialog?.close();
        showToast("Postingan berhasil dibagikan.");

        try {
          await sendToBackend(
            "notifyPost",
            {
              unit,
              name,
              text,
              hasPhoto: !!imageDataUrl,
              postId: docRef.id,
            },
            { silent: true },
          );
          loadNotifications();
        } catch (notifErr) {
          console.error("Gagal mengirim notifikasi postingan:", notifErr);
        }
      } catch (err) {
        showSaveFailureModal(err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const viewFinanceDetailBtn = document.getElementById("viewFinanceDetail");
  const financeDialog = document.getElementById("financeDialog");
  if (viewFinanceDetailBtn && financeDialog)
    viewFinanceDetailBtn.addEventListener("click", () =>
      financeDialog.showModal(),
    );

  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      const tabType = e.target.getAttribute("data-tab");
      const monthlyContent = document.getElementById("monthlyFinanceContent");
      const yearlyContent = document.getElementById("yearlyFinanceContent");
      if (tabType === "monthly") {
        if (monthlyContent) monthlyContent.style.display = "block";
        if (yearlyContent) yearlyContent.style.display = "none";
      } else {
        if (monthlyContent) monthlyContent.style.display = "none";
        if (yearlyContent) yearlyContent.style.display = "block";
      }
    });
  });

  document.querySelectorAll(".close:not(#closeProfileBtn)").forEach((btn) => {
    btn.addEventListener("click", (e) => e.target.closest("dialog")?.close());
  });

  const paymentForm = $("#paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(paymentForm));
      const proofInput = paymentForm.querySelector("[name='proof']");
      const proofFile = proofInput && proofInput.files && proofInput.files[0];
      const selectedMonths = getSelectedMonths();
      const method = data.method;

      if (!selectedMonths.length) {
        showToast("Pilih minimal satu bulan yang ingin dibayar.");
        return;
      }
      if (!proofFile) {
        showToast("Mohon lampirkan bukti pembayaran.");
        return;
      }

      const activeUnit = localStorage.getItem("pondok_rajeg_user") || "";
      const activeName =
        localStorage.getItem("pondok_rajeg_name") || activeUnit;
      const loadingModal = $("#aiLoadingModal");

      $("#iplDialog")?.close();

      if (loadingModal) {
        loadingModal.innerHTML = `
  <div class="cyber-modal-card">
    <div class="cyber-core-container">
      <div class="cyber-ring-outer"></div>
      <div class="cyber-ring-inner"></div>
      <span class="material-symbols-rounded cyber-core-icon">auto_awesome</span>
    </div>

    <div class="cyber-badge">
      <span class="cyber-dot"></span> NEURAL AI Pondok Rajeg Residence v0.6
    </div>

    <h3 style="font-size: 15px; margin: 12px 0 6px; color: #1f2937; font-weight: 700; letter-spacing: -0.2px; line-height: 1.4;">
      My PRR AI Sedang verifikasi awal attachment Bukti Transfer
    </h3>

    <p id="techStatusText" style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5; min-height: 18px; font-family: monospace;">
      Menganalisis matriks piksel dokumen<span id="loadingDots" style="color: #10b981; font-weight: bold;">...</span>
    </p>

    <div class="cyber-progress-track">
      <div class="cyber-progress-bar"></div>
    </div>
  </div>
`;
        loadingModal.showModal();
        startTechScannerAnimation();
      }

      try {
        const proofBase64 = await fileToBase64(proofFile);
        const proofMimeType = proofFile.type || "image/jpeg";

        const result = await sendToBackend("payment", {
          name: activeName,
          unit: activeUnit,
          method,
          months: selectedMonths,
          amount: Number(data.amount) || selectedMonths.length * DEFAULT_BILL,
          proofBase64,
          proofMimeType,
        });

        stopTechScannerAnimation();
        if (loadingModal) loadingModal.close();
        paymentForm.reset();
        safeRefreshDashboard(activeUnit);
        loadNotifications();
        showAppModal("Berhasil!", result.message, true);
      } catch (error) {
        stopTechScannerAnimation();
        if (loadingModal) loadingModal.close();
        $("#iplDialog")?.showModal();
        showAppModal("Gagal", error.message, false);
      }
    });
  }

  refreshWelcomeHeader();
});

function setupWhatsAppFormatter(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", (e) => {
    let val = e.target.value.trim();
    val = val.replace(/[^\d+]/g, "");
    if (val.startsWith("08")) {
      val = "+628" + val.slice(2);
    } else if (val.startsWith("8")) {
      val = "+62" + val;
    } else if (val.startsWith("0")) {
      val = "+62" + val.slice(1);
    }
    e.target.value = val;
  });
}

function logoutToLoginView() {
  localStorage.removeItem("pondok_rajeg_user");
  localStorage.removeItem("pondok_rajeg_name");
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ROLE_KEY);
  detachPostsListener();
  stopNotifPolling();
  notificationCache = [];

  const mainApp = $("#mainApp");
  const loginView = $("#loginView");
  if (mainApp) {
    mainApp.style.display = "none";
    mainApp.style.opacity = "0";
  }
  if (loginView) {
    loginView.style.display = "flex";
    loginView.style.opacity = "1";
  }
}

function buildTanggunganCard(data) {
  const t = data || {};
  const card = document.createElement("div");
  card.className = "tanggungan-item-card";
  card.innerHTML = `
    <div class="tanggungan-row-top">
      <b style="font-size: 11px; color: var(--green);">${t.name ? escapeHtml(t.name) : "Anggota Baru"}</b>
      <button type="button" class="remove-tanggungan-btn" title="Hapus anggota">
        <span class="material-symbols-rounded">delete</span>
      </button>
    </div>
    <label style="margin:4px 0 2px;">Nama Lengkap
      <input type="text" name="tanggunganName" placeholder="Nama Anggota" value="${escapeHtml(t.name || "")}" required />
    </label>
    <div class="form-row" style="margin-top:4px;">
      <label style="margin:4px 0 2px;">NIK KTP (16 Digit)
        <input type="text" name="tanggunganNik" placeholder="NIK KTP" maxlength="16" value="${escapeHtml(t.nik || "")}" required />
      </label>
      <label style="margin:4px 0 2px;">Tanggal Lahir
        <input type="date" name="tanggunganDob" value="${escapeHtml(t.dob || "")}" required />
      </label>
    </div>
    <div class="form-row" style="margin-top:4px;">
      <label style="margin:4px 0 2px;">Gender
        <select name="tanggunganGender" required>
          <option value="Laki-laki">Laki-laki</option>
          <option value="Perempuan">Perempuan</option>
        </select>
      </label>
      <label style="margin:4px 0 2px;">Relasi
        <select name="tanggunganRelation" required>
          <option value="Anak">Anak</option>
          <option value="Orang Tua">Orang Tua</option>
          <option value="Lainnya">Lainnya</option>
        </select>
      </label>
    </div>
  `;

  if (t.gender) {
    const genderSelect = card.querySelector("[name='tanggunganGender']");
    if (genderSelect) genderSelect.value = t.gender;
  }
  if (t.relation) {
    const relationSelect = card.querySelector("[name='tanggunganRelation']");
    if (relationSelect) relationSelect.value = t.relation;
  }

  const nameInput = card.querySelector("[name='tanggunganName']");
  const label = card.querySelector(".tanggungan-row-top b");
  if (nameInput && label) {
    nameInput.addEventListener("input", () => {
      label.textContent = nameInput.value.trim() || "Anggota Baru";
    });
  }

  card.querySelector(".remove-tanggungan-btn").addEventListener("click", () => {
    const container = $("#tanggunganContainer");
    card.remove();
    if (container && container.children.length === 0) {
      container.innerHTML = `<small style="color: var(--muted);">Belum ada tanggungan / anggota serumah yang ditambahkan.</small>`;
    }
  });

  return card;
}

function renderTanggunganInputs(tanggunganList) {
  const container = $("#tanggunganContainer");
  if (!container) return;
  container.innerHTML = "";
  const list = Array.isArray(tanggunganList) ? tanggunganList : [];
  if (!list.length) {
    container.innerHTML = `<small style="color: var(--muted);">Belum ada tanggungan / anggota serumah yang ditambahkan.</small>`;
    return;
  }
  list.forEach((t) => container.appendChild(buildTanggunganCard(t)));
}

function collectTanggungan() {
  return Array.from(
    document.querySelectorAll("#tanggunganContainer .tanggungan-item-card"),
  )
    .map((card) => ({
      name: (card.querySelector("[name='tanggunganName']")?.value || "").trim(),
      nik: (card.querySelector("[name='tanggunganNik']")?.value || "").trim(),
      dob: card.querySelector("[name='tanggunganDob']")?.value || "",
      gender: card.querySelector("[name='tanggunganGender']")?.value || "",
      relation: card.querySelector("[name='tanggunganRelation']")?.value || "",
    }))
    .filter((t) => t.name);
}

// ------------------------------------------------------------
// [BARU] Fix #8/#9: Pengaduan Lingkungan sekarang SEPENUHNYA dari backend
// (bukan localStorage lagi — riwayat tetap muncul walau ganti device), dan
// admin mengelola status LANGSUNG di komponen yang sama dengan warga
// (bukan panel "Kelola Pengaduan" terpisah lagi — sudah dihapus).
// ------------------------------------------------------------
let currentComplaintList = [];
const COMPLAINT_STATUS_META = {
  Menunggu: { label: "Menunggu", color: "#a46404", bg: "#fff3d5" },
  Diproses: { label: "Diproses", color: "#1d4ed8", bg: "#dbeafe" },
  Selesai: { label: "Selesai", color: "#15803d", bg: "#dcfce7" },
};

async function loadAndRenderComplaints() {
  const list = $("#complaintList");
  if (!list) return;
  const unit = localStorage.getItem("pondok_rajeg_user") || "";
  const role = localStorage.getItem(ROLE_KEY) || "warga";
  if (!unit) return;

  list.innerHTML = shimmerListHtml(2);
  try {
    const result =
      role === "admin"
        ? await sendToBackend(
            "adminListComplaints",
            { adminUnit: unit },
            { silent: true },
          )
        : await sendToBackend("getMyComplaints", { unit }, { silent: true });
    currentComplaintList = result.complaints || [];
    renderComplaintList(role === "admin");
  } catch (err) {
    list.innerHTML = `<div class="empty-state-box">Gagal memuat pengaduan: ${escapeHtml(err.message)}</div>`;
  }
}

function renderComplaintList(isAdminView) {
  const list = $("#complaintList");
  if (!list) return;

  if (!currentComplaintList.length) {
    list.innerHTML = `
      <div class="activity">
        <div class="activity-icon"><span class="material-symbols-rounded">forum</span></div>
        <div class="activity-text"><b>Belum ada pengaduan</b><small>${isAdminView ? "Belum ada laporan masuk dari warga." : "Laporkan kendala fasilitas umum."}</small></div>
      </div>`;
    return;
  }

  list.innerHTML = currentComplaintList
    .map((c) => {
      const meta =
        COMPLAINT_STATUS_META[c.status] || COMPLAINT_STATUS_META.Menunggu;
      // [BARU] Fix #9: admin melihat tombol tindak lanjut LANGSUNG di sini,
      // tidak perlu buka panel/card terpisah lagi.
      const adminActions = isAdminView
        ? `<div class="content-manage-actions" style="margin-top: 6px">
            ${c.status !== "Diproses" ? `<button type="button" class="chip-btn" data-set-complaint-status="${escapeHtml(c.id)}|Diproses">Tindak Lanjuti</button>` : ""}
            ${c.status !== "Selesai" ? `<button type="button" class="chip-btn" data-set-complaint-status="${escapeHtml(c.id)}|Selesai">Tandai Selesai</button>` : ""}
            ${c.status !== "Menunggu" ? `<button type="button" class="chip-btn ghost" data-set-complaint-status="${escapeHtml(c.id)}|Menunggu">Batal Proses</button>` : ""}
          </div>`
        : "";
      return `
    <div class="activity">
      <div class="activity-icon"><span class="material-symbols-rounded">campaign</span></div>
      <div class="activity-text" style="flex: 1;">
        <b>${escapeHtml(c.category)} · ${escapeHtml(c.location)}</b>
        <small>${escapeHtml(c.description)}${isAdminView ? ` — ${escapeHtml(c.name || "Warga")} (${escapeHtml(c.unit || "-")})` : ""} · ${escapeHtml(c.timestamp)}</small>
        ${adminActions}
      </div>
      <div class="activity-amount" style="color:${meta.color}; background:${meta.bg}; padding: 2px 6px; border-radius: 6px; font-size: 9px; align-self: flex-start;">${escapeHtml(meta.label)}</div>
    </div>`;
    })
    .join("");

  if (isAdminView) {
    list.querySelectorAll("[data-set-complaint-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [id, status] = btn.dataset.setComplaintStatus.split("|");
        updateComplaintStatus(id, status);
      });
    });
  }
}

async function updateComplaintStatus(id, status) {
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  try {
    const result = await sendToBackend("adminUpdateComplaintStatus", {
      adminUnit,
      id,
      status,
    });
    showToast(result.message);
    const item = currentComplaintList.find((c) => c.id === id);
    if (item) item.status = status;
    renderComplaintList(true);
  } catch (err) {
    showToast(`Gagal: ${err.message}`);
  }
}

// ============================================================
// PWA INSTALL BANNER LOGIC (DUAL-SUPPORT: ANDROID & IOS)
// ============================================================
let deferredPrompt;
const pwaBanner = $("#pwaInstallBanner");
const pwaInstallBtn = $("#pwaInstallBtn");
const pwaCloseBanner = $("#pwaCloseBanner");

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

if (!isInStandaloneMode()) {
  const isIos = /iphone|ipad|ipod/.test(
    window.navigator.userAgent.toLowerCase(),
  );

  if (isIos) {
    setTimeout(() => {
      if (pwaBanner) {
        const bannerSmall = pwaBanner.querySelector(".pwa-banner-text small");
        if (bannerSmall) {
          bannerSmall.innerHTML =
            "Ketuk ikon <b>Bagikan (Share)</b> ➔ Pilih <b>Add to Home Screen</b>.";
        }
        if (pwaInstallBtn) pwaInstallBtn.style.display = "none";
        pwaBanner.style.display = "flex";
      }
    }, 2500);
  } else {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (pwaBanner) {
        setTimeout(() => {
          pwaBanner.style.display = "flex";
        }, 2000);
      }
    });
  }
}

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install outcome: ${outcome}`);
      deferredPrompt = null;
      if (pwaBanner) pwaBanner.style.display = "none";
    }
  });
}

if (pwaCloseBanner) {
  pwaCloseBanner.addEventListener("click", () => {
    if (pwaBanner) pwaBanner.style.display = "none";
  });
}

window.addEventListener("appinstalled", () => {
  if (pwaBanner) pwaBanner.style.display = "none";
  console.log("PWA berhasil diinstal.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
