const DEFAULT_BILL = 120000;
const COMPLAINT_KEY = "pondok-rajeg-complaints";
const PROFILE_KEY = "pondok-rajeg-profile-data";
const ROLE_KEY = "pondok_rajeg_role"; // "admin" jika unit ini terdaftar sebagai petugas
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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();
const db = firebase.firestore();

function buildNotifTag(payload) {
  return (
    (payload.data && payload.data.tag) || payload.collapseKey || "my-prr-notif"
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
});

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const swRegistration = await navigator.serviceWorker.ready;

      const token = await messaging.getToken({
        vapidKey:
          "BPzVsG95x8uvmworbflPPJRBee81eTjCHvh8kkSlerKB5YdNyFnYhbov8qYwThcbkE1fE7yHj1GfSjMz22VyngA",
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        const unit = localStorage.getItem("pondok_rajeg_user") || "Tamu";
        await sendToBackend("saveFCMToken", { unit, token });
        console.log("FCM Token perangkat tersimpan:", token);
      }
    } else {
      console.log("Izin notifikasi ditolak oleh pengguna.");
    }
  } catch (error) {
    console.error("Gagal mendapatkan token notifikasi:", error);
  }
}

const articlesData = {
  "pbb-2025": {
    title: "Pengambilan STP PBB 2025",
    date: "15 Agustus 2026",
    image: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
    content: `
      <p>Surat Tagihan Pajak PBB (SPT PBB) tahun 2025 untuk seluruh warga MY PRR kini sudah didistribusikan oleh pengurus dan dapat diambil secara mandiri di pos penjemputan masing-masing wilayah blok.</p>
      <p>Berikut adalah rincian lokasi penjemputan dokumen berdasarkan blok rumah Anda:</p>
      <ul class="pbb-location-list" style="margin-bottom: 12px;">
        <li><strong>Blok A & B:</strong> Rumah Bpk. Akhmad Tika (B9/6)</li>
        <li><strong>Blok C:</strong> Rumah Bpk. Juhaeri (C8/15)</li>
      </ul>
      <p>Mohon membawa kartu identitas diri atau bukti pembayaran IPL terakhir saat mengambil dokumen guna kelancaran pendataan warga.</p>
    `,
  },
  "kerja-bakti": {
    title: "Kerja Bakti Lingkungan Serentak",
    date: "20 Agustus 2026",
    image: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
    content: `
      <p>Dalam rangka menjaga kebersihan lingkungan, keasrian kawasan, serta mengantisipasi saluran air menghadapi musim penghujan, pengurus RT bersama warga akan mengadakan kegiatan <strong>Kerja Bakti Lingkungan Serentak</strong>.</p>
      <p><strong>Waktu & Tempat Pelaksanaan:</strong><br>
      📅 Minggu, 23 Agustus 2026<br>
      ⏰ Pukul 07.00 WIB s.d Selesai<br>
      📍 Titik Kumpul: Pos Keamanan Utama Kawasan Perumahan</p>
      <p>Diharapkan kepada seluruh warga untuk dapat meluangkan waktu berpartisipasi membawa alat kebersihan masing-masing (sapu lidi, cangkul kecil, atau parang pemotong rumput liar).</p>
    `,
  },
};

const $ = (selector) => document.querySelector(selector);
const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const getComplaints = () =>
  JSON.parse(localStorage.getItem(COMPLAINT_KEY) || "[]");
const saveComplaints = (data) =>
  localStorage.setItem(COMPLAINT_KEY, JSON.stringify(data));

async function sendToBackend(action, data) {
  if (!APPS_SCRIPT_URL) return false;
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
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

// ============================================================
// DASHBOARD: SEMUA DATA (TAGIHAN, KAS, HISTORY, AKTIVITAS)
// SELALU DIAMBIL LANGSUNG DARI SPREADSHEET (BACKEND), BUKAN
// DARI localStorage, AGAR TIDAK ADA DATA "BEKAS"/KEDALUWARSA.
// ============================================================
let latestUnpaidMonths = [];

async function refreshDashboard(unit) {
  if (!unit) return null;
  const result = await sendToBackend("getDashboard", { unit });
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
        warningTitle.textContent = "SURAT PERINGATAN RESMI RT";
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
  return { icon: "hourglass_top", cls: "", iconCls: "" }; // Menunggu Verifikasi Petugas
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

// ============================================================
// UPDATE WARGA — FEED SOSIAL REAL-TIME (FIRESTORE)
// Posting/like/komentar tersimpan di Firestore (bukan Spreadsheet) supaya
// bisa memakai onSnapshot: begitu ada warga lain posting/like/komentar,
// semua warga yang sedang membuka app langsung melihatnya TANPA reload.
// ============================================================
let unsubscribePostsListener = null;
let latestPostsSnapshotDocs = [];
let feedTimeRefreshInterval = null;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Format waktu relatif gaya Facebook: "Baru saja", "5 menit lalu",
// "3 jam lalu", "Kemarin pukul 14:00", "3 hari lalu", atau tanggal lengkap.
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

// Kompres foto di sisi klien (maks lebar 900px, JPEG) sebelum disimpan
// sebagai data-URL di dokumen Firestore, supaya ukurannya tetap kecil.
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
  if (unsubscribePostsListener) return; // sudah terpasang
  unsubscribePostsListener = db
    .collection("posts")
    .orderBy("createdAt", "desc")
    .limit(50)
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
    // Perbarui label waktu ("5 menit lalu" -> "6 menit lalu") tiap menit
    // tanpa perlu snapshot baru dari server.
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

  if (!latestPostsSnapshotDocs.length) {
    feedList.innerHTML = `<div class="empty-state-box">Belum ada postingan. Jadilah warga pertama yang berbagi! 👋</div>`;
    return;
  }

  feedList.innerHTML = latestPostsSnapshotDocs
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

      return `
    <article class="social-post" data-post-id="${id}">
      <div class="social-post-header">
        <span class="social-avatar">${escapeHtml(initial)}</span>
        <div class="social-post-meta">
          <b>${escapeHtml(data.name || "Warga")}</b>
          <small>${escapeHtml(data.unit || "-")} · ${formatRelativeTimeID(createdAtDate)}</small>
        </div>
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
          ${
            comments.length
              ? comments
                  .map(
                    (c) => `
            <div class="social-comment">
              <b>${escapeHtml(c.name)}</b> <span>${escapeHtml(c.text)}</span>
              <small>${formatRelativeTimeID(new Date(c.createdAtMillis || Date.now()))}</small>
            </div>`,
                  )
                  .join("")
              : `<small style="color: var(--muted);">Belum ada komentar.</small>`
          }
        </div>
        <form class="social-comment-form" data-comment-form="${id}">
          <input type="text" name="commentText" placeholder="Tulis komentar..." required maxlength="300" />
          <button type="submit"><span class="material-symbols-rounded">send</span></button>
        </form>
      </div>
    </article>`;
    })
    .join("");

  bindSocialFeedEvents();
}

function bindSocialFeedEvents() {
  const feedList = $("#socialFeedList");
  if (!feedList) return;

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
  const postRef = db.collection("posts").doc(postId);
  try {
    await db.runTransaction(async (tx) => {
      const docSnap = await tx.get(postRef);
      if (!docSnap.exists) return;
      const likes = Object.assign({}, docSnap.data().likes || {});
      if (likes[unitKey]) {
        delete likes[unitKey];
      } else {
        likes[unitKey] = true;
      }
      tx.update(postRef, { likes: likes });
    });
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
}

// ============================================================
// MODAL BAYAR IPL: PILIH BULAN, LALU AI/PETUGAS MEMVERIFIKASI
// ============================================================
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
    note.innerHTML = `⚠️ <b>Metode Tunai:</b> Serahkan uang tunai kepada petugas keuangan RT, lalu foto kwitansi/tanda terima sebagai bukti. Pastikan foto <b>jelas & sesuai nominal</b> — bukti yang asal-asalan/buram akan ditolak petugas saat verifikasi manual dan status pembayaran Anda tidak akan berubah menjadi Lunas.`;
    proofLabelText.textContent =
      "Bukti Serah Terima Tunai (Foto Kwitansi) — Wajib";
  } else {
    note.className = "payment-method-note";
    note.innerHTML = `💡 Transfer wajib ke <b>Bank Jago a.n Muhamad Kurnia Fauqou Nur (504460167350)</b>. MY AI PRR memvalidasi otomatis rekening tujuan, nominal, nama pengirim, & tahun 2026.`;
    proofLabelText.textContent = "Bukti Transfer (Foto / PDF) — Wajib";
  }
}

// ============================================================
// AKSES PETUGAS (ROLE: ADMIN) — VERIFIKASI PEMBAYARAN TUNAI
// Petugas login lewat form yang SAMA seperti warga (Blok/Unit + PIN).
// Server yang menentukan role berdasarkan kolom "Role" di sheet Users.
// Kalau role = admin, kartu "Verifikasi Tunai" muncul di Akses Cepat dan
// membuka dialog verifikasi. Identitas admin untuk setiap aksi cukup
// unit yang sedang login (server mengecek ulang rolenya tiap request).
// ============================================================
let currentPending = [];
let rejectTarget = null;

function applyRoleUI(role) {
  const adminQuickBtn = $("#adminQuickBtn");
  if (adminQuickBtn)
    adminQuickBtn.style.display = role === "admin" ? "flex" : "none";
}

async function loadAdminPending() {
  const adminUnit = localStorage.getItem("pondok_rajeg_user");
  if (!adminUnit) return;
  const listEl = $("#pendingList");
  if (listEl)
    listEl.innerHTML = `<div class="empty-state-box">Memuat data...</div>`;

  try {
    const result = await sendToBackend("adminListPending", { adminUnit });
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
    showToast(`Gagal: ${err.message}`);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = "Konfirmasi Lunas";
    }
  }
}

function logoutToLoginView() {
  localStorage.removeItem("pondok_rajeg_user");
  localStorage.removeItem("pondok_rajeg_name");
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ROLE_KEY);
  detachPostsListener();

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
          applyRoleUI(savedRole);
          safeRefreshDashboard(savedUser);
          attachPostsListener();
          requestNotificationPermission();
        } else {
          if (loginView) loginView.style.display = "flex";
        }
      }, 500);
    }
  }, 2000);

  // TAB ROLE LOGIN: WARGA vs PETUGAS/ADMIN

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
              ? `Halo ${result.name}, Anda masuk sebagai Petugas RT.`
              : `Halo ${result.name}, verifikasi Rumah ${unit} berhasil.`;
        }
        if (loginSuccessDialog) loginSuccessDialog.showModal();

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalButtonText;
      } catch (error) {
        showToast(`Gagal: ${error.message}`);
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
          applyRoleUI(role);
          safeRefreshDashboard(unit);
          attachPostsListener();
          requestNotificationPermission();
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
        showToast(`Gagal: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // BUKA MODAL IPL: AUTO-FILL, MUAT DAFTAR BULAN BELUM LUNAS DARI SERVER
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
            monthsContainer.innerHTML = `<div class="empty-state-box" style="border: 0; color: #dc2626;">Gagal memuat daftar tagihan. Tutup lalu buka kembali form ini.</div>`;
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
      headGenderSelect.style.background = "#f4f8f5";
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
      headGenderSelect.style.background = "#fff";
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

    const newPinInput = profileForm.querySelector("[name='newPin']");
    const confirmPinInput = profileForm.querySelector("[name='confirmPin']");
    if (newPinInput) newPinInput.value = "";
    if (confirmPinInput) confirmPinInput.value = "";

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
      const inputsToShimmer = profileForm.querySelectorAll(
        "input:not([type='hidden']), select",
      );
      inputsToShimmer.forEach((el) => el.classList.add("shimmer-loading"));

      const unit = localStorage.getItem("pondok_rajeg_user") || "";
      try {
        const result = await sendToBackend("getProfile", { unit });
        if (result.ok && result.profile) {
          localStorage.setItem(PROFILE_KEY, JSON.stringify(result.profile));
          populateProfileForm(result.profile);
        } else {
          populateProfileForm({});
        }
      } catch (e) {
        populateProfileForm({});
      } finally {
        inputsToShimmer.forEach((el) => el.classList.remove("shimmer-loading"));
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

      const cachedProfile = localStorage.getItem(PROFILE_KEY);
      if (cachedProfile) {
        populateProfileForm(JSON.parse(cachedProfile));
      } else {
        profileForm.reset();
      }

      showToast("Perubahan dibatalkan. Data tidak disimpan.");
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
      if (container.querySelector("small")) container.innerHTML = "";
      const card = document.createElement("div");
      card.className = "tanggungan-item-card";
      card.innerHTML = `
        <div class="tanggungan-row-top">
          <b style="font-size: 11px; color: var(--green);">Anggota Baru</b>
          <button type="button" class="remove-tanggungan-btn" title="Hapus anggota">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
        <label style="margin:4px 0 2px;">Nama Lengkap
          <input type="text" name="tanggunganName" placeholder="Nama Anggota" required />
        </label>
        <div class="form-row" style="margin-top:4px;">
          <label style="margin:4px 0 2px;">NIK KTP (16 Digit)
            <input type="text" name="tanggunganNik" placeholder="NIK KTP" maxlength="16" required />
          </label>
          <label style="margin:4px 0 2px;">Tanggal Lahir
            <input type="date" name="tanggunganDob" required />
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
      card
        .querySelector(".remove-tanggungan-btn")
        .addEventListener("click", () => {
          card.remove();
          if (container.children.length === 0) {
            container.innerHTML = `<small style="color: var(--muted);">Belum ada tanggungan / anggota serumah yang ditambahkan.</small>`;
          }
        });
      container.appendChild(card);
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
      submitBtn.innerHTML = "Menyimpan ke Server MY PRR... ⏳";

      const houseKK = formData.get("houseKK");
      const houseStatus = formData.get("houseStatus");
      const maritalStatus = formData.get("maritalStatus");

      const headName = formData.get("headName") || "";
      const headNik = formData.get("headNik") || "";
      const headDob = formData.get("headDob") || "";
      const headWhatsApp = formData.get("headWhatsApp") || "";
      const headGender =
        maritalStatus === "Menikah" || maritalStatus === "Duda"
          ? "Laki-laki"
          : maritalStatus === "Janda"
            ? "Perempuan"
            : formData.get("headGender");

      const wifeName =
        maritalStatus === "Menikah" ? formData.get("wifeName") || "" : "";
      const wifeNik =
        maritalStatus === "Menikah" ? formData.get("wifeNik") || "" : "";
      const wifeDob =
        maritalStatus === "Menikah" ? formData.get("wifeDob") || "" : "";
      const wifeWhatsApp =
        maritalStatus === "Menikah" ? formData.get("wifeWhatsApp") || "" : "";

      const cards = profileForm.querySelectorAll(".tanggungan-item-card");
      const tanggungan = [];
      cards.forEach((card) => {
        const name = card.querySelector("[name='tanggunganName']").value.trim();
        const nik = card.querySelector("[name='tanggunganNik']").value.trim();
        const dob = card.querySelector("[name='tanggunganDob']").value;
        const gender = card.querySelector("[name='tanggunganGender']").value;
        const relation = card.querySelector(
          "[name='tanggunganRelation']",
        ).value;
        if (name) tanggungan.push({ name, nik, dob, gender, relation });
      });

      const currentUnit =
        localStorage.getItem("pondok_rajeg_user") || "Unknown";

      const profileData = {
        unit: currentUnit,
        houseKK,
        houseStatus,
        maritalStatus,
        headName,
        headNik,
        headDob,
        headWhatsApp,
        headGender,
        wifeName,
        wifeNik,
        wifeDob,
        wifeWhatsApp,
        tanggungan: tanggungan,
        newPin: newPin,
      };

      try {
        await sendToBackend("profile", profileData);
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));

        if (headName) {
          localStorage.setItem("pondok_rajeg_name", headName);
          refreshWelcomeHeader();
        }

        profileDataLoadedState = true;
        profileDialog.close();

        const successDialog = $("#loginSuccessDialog");
        const successTitle = successDialog?.querySelector("h2");
        const successMsg = $("#loginSuccessMessageText");
        if (successTitle)
          successTitle.textContent = "Profil Berhasil Disimpan!";
        if (successMsg)
          successMsg.textContent = newPin
            ? "Data profil dan PIN baru Anda berhasil diperbarui di Server MY PRR."
            : "Data keluarga unit rumah Anda telah diperbarui dan disinkronkan otomatis.";
        successDialog?.showModal();
      } catch (error) {
        showToast(`Gagal menyimpan ke Server MY PRR: ${error.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const tukangBtn = $("#tukangBtn");
  const tukangDialog = $("#tukangDialog");
  if (tukangBtn && tukangDialog)
    tukangBtn.addEventListener("click", () => tukangDialog.showModal());

  const healthBtn = $("#healthBtn");
  const healthDialog = $("#healthDialog");
  if (healthBtn && healthDialog)
    healthBtn.addEventListener("click", () => healthDialog.showModal());

  const infoBtn = $("#infoBtn");
  const infoDialog = $("#infoDialog");
  if (infoBtn && infoDialog)
    infoBtn.addEventListener("click", () => infoDialog.showModal());

  const infoTabBtns = document.querySelectorAll("[data-infotab]");
  const infoMainTabs = $("#infoMainTabs");
  const infoAnnouncementsContent = $("#infoAnnouncementsContent");
  const infoArticleDetailContent = $("#infoArticleDetailContent");
  const articleDetailBody = $("#articleDetailBody");
  const backToInfoListBtn = $("#backToInfoListBtn");
  const infoModalTitle = $("#infoModalTitle");
  const infoModalEyebrow = $("#infoModalEyebrow");

  infoTabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      infoTabBtns.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      const tabType = e.target.getAttribute("data-infotab");
      const announcementsPane = document.getElementById(
        "infoAnnouncementsContent",
      );
      const adartPane = document.getElementById("infoAdartContent");
      if (tabType === "announcements") {
        if (announcementsPane) announcementsPane.style.display = "block";
        if (adartPane) adartPane.style.display = "none";
      } else {
        if (announcementsPane) announcementsPane.style.display = "none";
        if (adartPane) adartPane.style.display = "block";
      }
    });
  });

  const articleCards = document.querySelectorAll(".clickable-article");
  articleCards.forEach((card) => {
    card.addEventListener("click", () => {
      const articleId = card.getAttribute("data-id");
      const data = articlesData[articleId];
      if (!data) return;

      if (infoMainTabs) infoMainTabs.style.display = "none";
      if (infoAnnouncementsContent)
        infoAnnouncementsContent.style.display = "none";
      if (infoArticleDetailContent)
        infoArticleDetailContent.style.display = "block";
      if (infoModalEyebrow) infoModalEyebrow.textContent = "DETAIL PENGUMUMAN";
      if (infoModalTitle) infoModalTitle.textContent = data.title;

      articleDetailBody.innerHTML = `
        <div class="article-detail-meta">📅 Dipublikasikan: ${data.date}</div>
        <img src="${data.image}" alt="${data.title}" class="article-detail-image" />
        <div class="article-detail-body-text">
          ${data.content}
        </div>
      `;
    });
  });

  if (backToInfoListBtn) {
    backToInfoListBtn.addEventListener("click", () => {
      if (infoArticleDetailContent)
        infoArticleDetailContent.style.display = "none";
      if (infoMainTabs) infoMainTabs.style.display = "flex";
      if (infoAnnouncementsContent)
        infoAnnouncementsContent.style.display = "block";
      if (infoModalEyebrow)
        infoModalEyebrow.textContent = "PUSAT INFORMASI & DOKUMEN";
      if (infoModalTitle)
        infoModalTitle.textContent = "Info Warga & Dokumen RT";
    });
  }

  const tukangTabBtns = document.querySelectorAll(".tukang-tab-btn");
  tukangTabBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      tukangTabBtns.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      const tabType = e.target.getAttribute("data-tukang-tab");
      const internetPane = document.getElementById("internetContent");
      const tukangPane = document.getElementById("tukangContent");
      if (tabType === "internet") {
        if (internetPane) internetPane.style.display = "block";
        if (tukangPane) tukangPane.style.display = "none";
      } else {
        if (internetPane) internetPane.style.display = "none";
        if (tukangPane) tukangPane.style.display = "block";
      }
    });
  });

  const openComplaintModalBtn = $("#openComplaintModalBtn");
  const openComplaintModalBtnRight = $("#openComplaintModalBtnRight");
  const complaintDialog = $("#complaintDialog");
  const showComplaintModal = () => complaintDialog?.showModal();
  if (openComplaintModalBtn)
    openComplaintModalBtn.addEventListener("click", showComplaintModal);
  if (openComplaintModalBtnRight)
    openComplaintModalBtnRight.addEventListener("click", showComplaintModal);

  const complaintForm = $("#complaintForm");
  if (complaintForm) {
    complaintForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const record = {
        category: data.category,
        location: data.location,
        description: data.description,
        date: new Date().toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        status: "Menunggu",
      };
      saveComplaints([record, ...getComplaints()]);
      complaintDialog?.close();
      e.currentTarget.reset();
      renderComplaints();
      showToast("Laporan pengaduan berhasil dikirim ke pengurus RT.");
    });
  }

  const panicButton = $("#panicButton");
  if (panicButton) {
    panicButton.addEventListener("click", () => {
      const panicDialog = $("#panicDialog");
      if (panicDialog) panicDialog.showModal();
    });
  }

  const panicForm = $("#panicForm");
  if (panicForm) {
    panicForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const emergencyType = formData.get("emergency") || "Darurat Warga";
      const unit = localStorage.getItem("pondok_rajeg_user") || "Tidak Dikenal";
      const name = localStorage.getItem("pondok_rajeg_name") || "Warga";

      const submitBtn = panicForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Mengirim sinyal darurat ke seluruh warga... 🚨";

      try {
        const result = await sendToBackend("broadcastPanic", {
          unit,
          name,
          type: emergencyType,
        });
        $("#panicDialog")?.close();
        showToast("🚨 " + result.message);

        const waMessage = encodeURIComponent(
          `DARURAT! Saya warga MY PRR (${name}, Rumah ${unit}) butuh bantuan segera. Jenis: ${emergencyType}`,
        );
        window.open(`https://wa.me/6281299998888?text=${waMessage}`, "_blank");
      } catch (error) {
        showToast(`Gagal mengirim sinyal: ${error.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Kirim sinyal darurat ke Pos";
      }
    });
  }

  // POSTINGAN WARGA (FEED SOSIAL REAL-TIME)
  const postComposerDialog = $("#postComposerDialog");
  const postComposerForm = $("#postComposerForm");
  const openPostComposerBtn = $("#openPostComposerBtn");
  const bottomNavPostBtn = $("#bottomNavPostBtn");
  const postPhotoInput = $("#postPhotoInput");
  const postPhotoPreviewWrap = $("#postPhotoPreviewWrap");
  const postPhotoPreview = $("#postPhotoPreview");

  const openPostComposer = () => {
    if (postComposerForm) postComposerForm.reset();
    if (postPhotoPreviewWrap) postPhotoPreviewWrap.style.display = "none";
    postComposerDialog?.showModal();
  };
  if (openPostComposerBtn)
    openPostComposerBtn.addEventListener("click", openPostComposer);
  if (bottomNavPostBtn)
    bottomNavPostBtn.addEventListener("click", openPostComposer);

  if (postPhotoInput) {
    postPhotoInput.addEventListener("change", async () => {
      const file = postPhotoInput.files && postPhotoInput.files[0];
      if (!file) {
        if (postPhotoPreviewWrap) postPhotoPreviewWrap.style.display = "none";
        return;
      }
      try {
        const dataUrl = await resizeImageToDataUrl(file);
        if (postPhotoPreview) postPhotoPreview.src = dataUrl;
        if (postPhotoPreviewWrap) postPhotoPreviewWrap.style.display = "block";
      } catch (err) {
        showToast("Gagal memuat pratinjau foto.");
      }
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
        const file =
          postPhotoInput && postPhotoInput.files && postPhotoInput.files[0];
        if (file) imageDataUrl = await resizeImageToDataUrl(file);

        await db.collection("posts").add({
          unit,
          name,
          text,
          imageDataUrl: imageDataUrl || null,
          likes: {},
          comments: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        postComposerDialog?.close();
        showToast("Postingan berhasil dibagikan ke warga MY PRR.");
      } catch (err) {
        showToast(`Gagal posting: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  const batteryHelpDialog = $("#batteryHelpDialog");
  const batteryHelpBanner = $("#batteryHelpBanner");
  const batteryHelpOpenBtn = $("#batteryHelpOpenBtn");
  const batteryHelpCloseBanner = $("#batteryHelpCloseBanner");

  function detectRiskyBrand() {
    const ua = navigator.userAgent.toLowerCase();
    if (/redmi|poco|xiaomi|hyperos|miui/.test(ua)) return "xiaomi";
    if (/oppo|realme|coloros/.test(ua)) return "oppo";
    if (/vivo|iqoo|funtouch/.test(ua)) return "vivo";
    return null;
  }

  function maybeShowBatteryHelpBanner() {
    if (!batteryHelpBanner) return;
    const dismissed = localStorage.getItem("prr_battery_help_dismissed");
    if (dismissed) return;
    const brand = detectRiskyBrand();
    if (!brand) return;
    if (Notification.permission !== "granted") return;
    setTimeout(() => {
      batteryHelpBanner.style.display = "flex";
    }, 4000);
  }

  if (batteryHelpOpenBtn && batteryHelpDialog) {
    batteryHelpOpenBtn.addEventListener("click", () => {
      batteryHelpDialog.showModal();
      if (batteryHelpBanner) batteryHelpBanner.style.display = "none";
      localStorage.setItem("prr_battery_help_dismissed", "1");
    });
  }
  if (batteryHelpCloseBanner && batteryHelpBanner) {
    batteryHelpCloseBanner.addEventListener("click", () => {
      batteryHelpBanner.style.display = "none";
      localStorage.setItem("prr_battery_help_dismissed", "1");
    });
  }

  maybeShowBatteryHelpBanner();

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

  // SUBMIT PEMBAYARAN IPL: WARGA PILIH BULAN, LALU AI (TRANSFER) ATAU
  // PETUGAS (TUNAI) YANG MEMVERIFIKASI. TIDAK ADA LAGI CACHE LOKAL.
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
        showToast(
          method === "Tunai ke petugas"
            ? "Mohon lampirkan foto kwitansi/tanda terima tunai."
            : "Mohon lampirkan foto/PDF bukti transfer untuk verifikasi.",
        );
        return;
      }

      const activeUnit = localStorage.getItem("pondok_rajeg_user") || "";
      const activeName =
        localStorage.getItem("pondok_rajeg_name") || activeUnit;

      const loadingModal = $("#aiLoadingModal");
      const loadingTitle = $("#aiLoadingTitle");
      const loadingDesc = $("#aiLoadingDesc");

      $("#iplDialog")?.close();
      if (loadingModal) loadingModal.showModal();

      try {
        if (loadingTitle) loadingTitle.textContent = "Menyiapkan Dokumen...";
        if (loadingDesc)
          loadingDesc.textContent = "Mengonversi file bukti pembayaran Anda...";

        const proofBase64 = await fileToBase64(proofFile);
        const proofMimeType = proofFile.type || "image/jpeg";

        if (method === "Tunai ke petugas") {
          if (loadingTitle)
            loadingTitle.textContent = "Menyimpan Bukti Tunai...";
          if (loadingDesc)
            loadingDesc.textContent =
              "Bukti pembayaran tunai Anda sedang dikirim untuk diverifikasi manual oleh petugas keuangan RT.";
        } else {
          if (loadingTitle)
            loadingTitle.textContent = "MY AI PRR Memindai Struk...";
          if (loadingDesc)
            loadingDesc.textContent =
              "Mengecek nominal, rekening Bank Jago (504460167350), nama pengirim, & tahun 2026...";
        }

        const result = await sendToBackend("payment", {
          name: activeName,
          unit: activeUnit,
          method,
          months: selectedMonths,
          amount: Number(data.amount) || selectedMonths.length * DEFAULT_BILL,
          proofBase64,
          proofMimeType,
        });

        if (loadingModal) loadingModal.close();
        paymentForm.reset();

        safeRefreshDashboard(activeUnit);

        showAppModal(
          result.status === "Lunas"
            ? "Pembayaran Berhasil! 🎉"
            : "Bukti Terkirim ⏳",
          result.message,
          true,
        );
        showToast(result.message);
      } catch (error) {
        if (loadingModal) loadingModal.close();
        $("#iplDialog")?.showModal();

        showAppModal("Verifikasi Gagal ❌", error.message, false);
        showToast(`Gagal: ${error.message}`);
      }
    });
  }

  refreshWelcomeHeader();
  renderComplaints();
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

function renderTanggunganInputs(tanggunganList = []) {
  const container = $("#tanggunganContainer");
  if (!container) return;
  container.innerHTML = "";

  if (typeof tanggunganList === "string") {
    try {
      tanggunganList = JSON.parse(tanggunganList);
    } catch (e) {
      tanggunganList = [];
    }
  }

  if (!Array.isArray(tanggunganList) || tanggunganList.length === 0) {
    container.innerHTML = `<small style="color: var(--muted);">Belum ada tanggungan / anggota serumah yang ditambahkan.</small>`;
    return;
  }

  tanggunganList.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "tanggungan-item-card";
    card.innerHTML = `
      <div class="tanggungan-row-top">
        <b style="font-size: 11px; color: var(--green);">Anggota #${index + 1}</b>
        <button type="button" class="remove-tanggungan-btn" title="Hapus anggota">
          <span class="material-symbols-rounded">delete</span>
        </button>
      </div>
      <label style="margin:4px 0 2px;">Nama Lengkap
        <input type="text" name="tanggunganName" value="${item.name || ""}" placeholder="Nama Anggota" required />
      </label>
      <div class="form-row" style="margin-top:4px;">
        <label style="margin:4px 0 2px;">NIK KTP (16 Digit)
          <input type="text" name="tanggunganNik" value="${item.nik || ""}" placeholder="NIK KTP" maxlength="16" required />
        </label>
        <label style="margin:4px 0 2px;">Tanggal Lahir
          <input type="date" name="tanggunganDob" value="${item.dob || ""}" required />
        </label>
      </div>
      <div class="form-row" style="margin-top:4px;">
        <label style="margin:4px 0 2px;">Gender
          <select name="tanggunganGender" required>
            <option value="Laki-laki" ${item.gender === "Laki-laki" ? "selected" : ""}>Laki-laki</option>
            <option value="Perempuan" ${item.gender === "Perempuan" ? "selected" : ""}>Perempuan</option>
          </select>
        </label>
        <label style="margin:4px 0 2px;">Relasi
          <select name="tanggunganRelation" required>
            <option value="Anak" ${item.relation === "Anak" ? "selected" : ""}>Anak</option>
            <option value="Orang Tua" ${item.relation === "Orang Tua" ? "selected" : ""}>Orang Tua</option>
            <option value="Lainnya" ${item.relation === "Lainnya" ? "selected" : ""}>Lainnya</option>
          </select>
        </label>
      </div>
    `;
    card
      .querySelector(".remove-tanggungan-btn")
      .addEventListener("click", () => {
        card.remove();
        if (container.children.length === 0) {
          container.innerHTML = `<small style="color: var(--muted);">Belum ada tanggungan / anggota serumah yang ditambahkan.</small>`;
        }
      });
    container.appendChild(card);
  });
}

// AKTIVITAS/PENGADUAN: masih tersimpan lokal per perangkat (belum tersambung
// ke sheet Complaints untuk dibaca kembali). Silakan minta pembaruan lanjutan
// jika ingin daftar pengaduan juga sinkron lintas perangkat seperti data IPL.
function renderComplaints() {
  const list = $("#complaintList");
  if (!list) return;
  const complaints = getComplaints();

  if (!complaints.length) {
    list.innerHTML = `
      <div class="activity">
        <div class="activity-icon"><span class="material-symbols-rounded">forum</span></div>
        <div class="activity-text"><b>Belum ada pengaduan</b><small>Laporkan kendala fasilitas umum di sekitar Anda.</small></div>
      </div>`;
    return;
  }

  list.innerHTML = complaints
    .slice(0, 3)
    .map(
      (c) => `
    <div class="activity">
      <div class="activity-icon"><span class="material-symbols-rounded">campaign</span></div>
      <div class="activity-text">
        <b>${c.category} · ${c.location}</b>
        <small>${c.description} (${c.date})</small>
      </div>
      <div class="activity-amount" style="color: #a46404; background: #fff3d5; padding: 2px 6px; border-radius: 6px; font-size: 9px;">Menunggu</div>
    </div>
  `,
    )
    .join("");
}

let deferredPrompt;
const pwaBanner = $("#pwaInstallBanner");
const pwaInstallBtn = $("#pwaInstallBtn");
const pwaCloseBanner = $("#pwaCloseBanner");
const pwaInstallDesc = $("#pwaInstallDesc");

const isInStandaloneMode = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

if (!isInStandaloneMode()) {
  const isIOS =
    /ipad|iphone|ipod/.test(navigator.userAgent.toLowerCase()) &&
    !window.MSStream;

  if (isIOS) {
    if (pwaInstallDesc) {
      pwaInstallDesc.textContent =
        "Ketuk tombol 'Share' (ikon panah kotak) lalu pilih 'Tambah ke Layar Utama'.";
    }
    if (pwaInstallBtn) {
      pwaInstallBtn.style.display = "none";
    }
    if (pwaBanner) {
      setTimeout(() => {
        pwaBanner.style.display = "flex";
      }, 3000);
    }
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
      if (outcome === "accepted") {
        console.log("Pengguna menerima instalasi MY PRR");
      }
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

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.log("Service Worker gagal mendaftar: ", error);
    });
  });
}
