const DEFAULT_BILL = 150000;
const STORAGE_KEY = "pondok-rajeg-payments";
const COMPLAINT_KEY = "pondok-rajeg-complaints";
const PROFILE_KEY = "pondok-rajeg-profile-data";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxkooeosCRLUrNxw18RZF9Epzn4_gfjj6YhOD71wqLOJUBQ9Oq2t7AZvc6RicDTMhjXKg/exec";

// Konfigurasi Firebase PRR Warga
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

// MENANGKAP PESAN KETIKA WEBSITE SEDANG DIBUKA AKTIF (FOREGROUND)
messaging.onMessage((payload) => {
  console.log("📥 Pesan diterima saat aplikasi aktif:", payload);
  const title = payload.notification.title;
  const body = payload.notification.body;

  showToast(title + ": " + body);

  if (Notification.permission === "granted") {
    new Notification(title, {
      body: body,
      icon: "https://i.ibb.co.com/b5VjvFGK/LOGO-PRR.jpg",
      vibrate: [300, 100, 300, 100, 300],
    });
  }
});

// Fungsi meminta izin notifikasi & menyimpan token perangkat ke Spreadsheet
// CATATAN: service worker TIDAK didaftarkan di sini lagi. Kita pakai
// registrasi service-worker.js tunggal yang sudah didaftarkan saat window load
// (lihat bagian paling bawah file ini) agar tidak ada konflik scope SW.
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
      <p>Surat Tagihan Pajak PBB (SPT PBB) tahun 2025 untuk seluruh warga Perumahan Pondok Rajeg Residence (PRR) kini sudah didistribusikan oleh pengurus dan dapat diambil secara mandiri di pos penjemputan masing-masing wilayah blok.</p>
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
  }).format(Number(value));

const getPayments = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const savePayments = (data) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  setTimeout(() => toast.classList.remove("show"), 3200);
}

function latestStatus(unit) {
  const payments = getPayments();
  if (!unit) return payments.some((p) => p.status === "Lunas");
  return payments.some(
    (p) => p.unit.toLowerCase() === unit.toLowerCase() && p.status === "Lunas",
  );
}

function checkArrears(unit) {
  const warningSection = $("#arrearsWarningSection");
  const warningCard = $("#warningCardContainer");
  const warningIconBox = warningCard
    ? warningCard.querySelector(".warning-icon-box")
    : null;
  const warningTitle = $("#warningTitle");
  const warningDesc = $("#warningDesc");
  const unpaidCountEl = $("#unpaidCount");
  const unpaidMonthsText = $("#unpaidMonthsText");

  if (!warningSection || !unit) return;

  const targetMonths = [
    "Januari 2026",
    "Februari 2026",
    "Maret 2026",
    "April 2026",
    "Mei 2026",
    "Juni 2026",
    "Juli 2026",
    "Agustus 2026",
  ];

  const payments = getPayments();
  const unitPayments = payments.filter(
    (p) => p.unit.toLowerCase() === unit.toLowerCase() && p.status === "Lunas",
  );

  const unpaid = targetMonths.filter(
    (m) =>
      !unitPayments.some(
        (p) => p.date.includes(m) || (p.month && p.month === m),
      ),
  );

  const count = unpaid.length > 0 ? unpaid.length : 3;

  if (count >= 3 || !unitPayments.length) {
    warningSection.style.display = "block";
    if (unpaidCountEl) unpaidCountEl.textContent = count;
    if (unpaidMonthsText) {
      unpaidMonthsText.textContent = unpaid.length
        ? unpaid.join(", ")
        : "Juni, Juli, Agustus 2026";
    }

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

function updateBill(unit) {
  const paid = latestStatus(unit);
  const currentBillEl = $("#currentBill");
  const modalBillEl = $("#modalBill");
  const chip = $("#billStatus");

  if (currentBillEl)
    currentBillEl.textContent = paid ? "Lunas" : rupiah(DEFAULT_BILL);
  if (modalBillEl) modalBillEl.textContent = rupiah(DEFAULT_BILL);
  if (chip) {
    chip.textContent = paid ? "Pembayaran tercatat" : "Belum dibayar";
    chip.style.color = paid ? "#087a4b" : "";
    chip.style.background = paid ? "#dcf8e6" : "";
  }
  checkArrears(unit);
}

function updateCashFlow() {
  const payments = getPayments();
  const totalIncome =
    payments
      .filter((p) => p.status === "Lunas")
      .reduce((acc, curr) => acc + curr.amount, 0) + 4500000;
  const totalExpense = 1200000;
  const net = totalIncome - totalExpense;

  const totalCashEl = $("#totalCashFlow");
  const totalExpenseEl = $("#totalExpense");
  const netBalanceEl = $("#netBalance");

  if (totalCashEl) totalCashEl.textContent = rupiah(totalIncome);
  if (totalExpenseEl) totalExpenseEl.textContent = rupiah(totalExpense);
  if (netBalanceEl) netBalanceEl.textContent = rupiah(net);
}

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

function renderActivities() {
  const list = $("#activityList");
  if (!list) return;
  const payments = getPayments();

  if (!payments.length) {
    list.innerHTML = `
      <div class="activity">
        <div class="activity-icon"><span class="material-symbols-rounded">check</span></div>
        <div class="activity-text"><b>Belum ada pembayaran</b><small>Mulai dengan membayar IPL bulan ini.</small></div>
      </div>`;
    return;
  }

  list.innerHTML = payments
    .slice(0, 4)
    .map(
      (p) => `
    <div class="activity">
      <div class="activity-icon"><span class="material-symbols-rounded">check</span></div>
      <div class="activity-text">
        <b>IPL ${p.unit} · ${p.name}</b>
        <small>${p.date} · ${p.method}</small>
      </div>
      <div class="activity-amount text-success">${rupiah(p.amount)}</div>
    </div>
  `,
    )
    .join("");
}

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
  };

  setTimeout(() => {
    if (splash) {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
        const savedUser = localStorage.getItem("pondok_rajeg_user");
        if (savedUser) {
          if (mainApp) mainApp.style.display = "flex";
          refreshWelcomeHeader();
          updateBill(savedUser);
          requestNotificationPermission();
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

        refreshWelcomeHeader();

        if (loginSuccessMessageText)
          loginSuccessMessageText.textContent = `Halo ${result.name}, verifikasi Rumah ${unit} berhasil.`;
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
      refreshWelcomeHeader();
      if (loginView) {
        loginView.style.opacity = "0";
        setTimeout(() => {
          loginView.style.display = "none";
          if (mainApp) {
            mainApp.style.display = "flex";
            mainApp.style.opacity = "1";
          }
          updateBill(unit);
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
      localStorage.removeItem("pondok_rajeg_user");
      localStorage.removeItem("pondok_rajeg_name");
      localStorage.removeItem(PROFILE_KEY);
      if (logoutConfirmDialog) logoutConfirmDialog.close();
      if (mainApp) {
        mainApp.style.display = "none";
        mainApp.style.opacity = "0";
      }
      if (loginView) {
        loginView.style.display = "flex";
        loginView.style.opacity = "1";
      }
      showToast("Anda telah keluar dari akun.");
    });
  }

  document.querySelectorAll("[data-page='ipl']").forEach((b) => {
    b.addEventListener("click", () => {
      const iplDialog = $("#iplDialog");
      const savedUser = localStorage.getItem("pondok_rajeg_user");
      if (savedUser) {
        const unitField = $("#paymentForm [name='unit']");
        if (unitField) unitField.value = savedUser;
      }
      if (iplDialog) iplDialog.showModal();
    });
  });

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
      submitBtn.innerHTML = "Menyimpan ke Server PRR... ⏳";

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
            ? "Data profil dan PIN baru Anda berhasil diperbarui di Server PRR."
            : "Data keluarga unit rumah Anda telah diperbarui dan disinkronkan otomatis.";
        successDialog?.showModal();
      } catch (error) {
        showToast(`Gagal menyimpan ke Server PRR: ${error.message}`);
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

  // PANIC FORM BROADCAST HANDLER
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
      } catch (error) {
        showToast(`Gagal mengirim sinyal: ${error.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Kirim sinyal darurat ke Pos";
      }
    });
  }

  const panicButton = $("#panicButton");
  if (panicButton)
    panicButton.addEventListener("click", () => $("#panicDialog")?.showModal());

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
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const record = {
        name: data.name,
        unit: data.unit,
        method: data.method,
        amount: Number(data.amount),
        date: new Date().toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        status: "Lunas",
      };
      try {
        await sendToBackend("payment", record);
      } catch (error) {
        showToast(`Pembayaran lokal tercatat: ${error.message}`);
      }
      savePayments([record, ...getPayments()]);
      $("#iplDialog")?.close();
      event.currentTarget.reset();
      const savedUser = localStorage.getItem("pondok_rajeg_user");
      updateBill(savedUser);
      updateCashFlow();
      renderActivities();
      showToast("Pembayaran berhasil dikonfirmasi.");
    });
  }

  refreshWelcomeHeader();
  updateBill(localStorage.getItem("pondok_rajeg_user"));
  updateCashFlow();
  renderActivities();
  renderComplaints();
});

// SATU-SATUNYA SERVICE WORKER: caching PWA + Firebase Cloud Messaging.
// Registrasi ini terjadi lebih dulu (saat window load), lalu
// requestNotificationPermission() di atas cukup menunggu (navigator.serviceWorker.ready)
// registrasi ini alih-alih mendaftarkan file terpisah — sehingga tidak ada
// konflik scope antar service worker.
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
