# MY PRR — Pondok Rajeg Residence

Aplikasi PWA (Progressive Web App) layanan warga untuk Perumahan Pondok Rajeg
Residence: login per unit rumah, pembayaran IPL dengan verifikasi bukti
transfer otomatis (AI), jadwal shift Security & Tukang Sampah, panel admin
lengkap, feed sosial warga, tombol darurat, dan push notification.

Database pusat memakai **Google Sheets** lewat **Google Apps Script**
(backend serverless, tanpa perlu server sendiri). Feed sosial & push
notification memakai **Firebase** (Firestore + Cloud Messaging).

## Fitur Utama

**Untuk warga:**

- Login PIN (terenkripsi) per unit/blok rumah
- Dashboard: saldo kas Paguyuban, status tagihan IPL, riwayat pembayaran
- Bayar IPL: pilih bulan yang mau dibayar, upload bukti transfer — otomatis
  diverifikasi AI (Gemini Vision), atau tunai dengan verifikasi manual admin
- Direktori Jasa & Internet, info Darurat Medis, Pengumuman, Dokumen
  Pengurus, dan Inventaris warga — semua dikelola dinamis oleh admin
- Jadwal Security & Tukang Sampah hari ini, lengkap dengan jam shift dan
  status "sedang bertugas"
- Update Warga: feed sosial (posting, like, komentar) real-time
- Tombol Panic untuk keadaan darurat, langsung broadcast ke semua warga
- Push notification untuk semua aktivitas penting (tagihan, pengumuman,
  panic, dll)

**Untuk Pengurus Paguyuban (admin):**

- **Verifikasi Tunai** — konfirmasi/tolak pembayaran IPL tunai
- **Catat Pengeluaran** — pencatatan kas keluar Paguyuban
- **Kelola Konten** — tambah/ubah/hapus semua kartu Jasa, Internet, Darurat
  Medis, Pengumuman, Dokumen, Inventaris, dan rostering Security/Sampah,
  termasuk fitur **Upload Massal** (tempel data dari Excel) untuk rostering
- **Kelola Warga** — daftarkan unit rumah baru, ubah data warga, dan reset
  PIN langsung dari aplikasi, tanpa perlu buka spreadsheet manual

## Struktur Berkas

```
index.html            Halaman utama (semua dialog/modal ada di sini)
app.js                 Seluruh logika frontend
style.css              Seluruh styling
service-worker.js      Service worker (cache offline + push notification)
manifest.webmanifest   Manifest PWA (ikon, nama, warna tema)
code.gs                Backend Google Apps Script (ditempel ke Apps Script,
                        BUKAN dijalankan dari GitHub Pages)
icons/                 Ikon aplikasi (berbagai ukuran)
dokumen/                Berkas dokumen statis (kalau ada)
```

## Menjalankan Lokal

Buka dengan server lokal (bukan langsung buka berkas `index.html` dari
File Explorer/Finder) supaya Service Worker & push notification bisa
berfungsi — keduanya butuh origin `http://` atau `https://`, tidak bisa di
`file://`. Contoh cepat:

```bash
npx serve .
# atau
python3 -m http.server 8000
```

## 1. Menghubungkan Google Sheets (database pusat)

1. Buat Google Sheets baru (boleh kosong, sheet-sheet yang dibutuhkan akan
   dibuat **otomatis** saat pertama kali dipakai: `Users`, `Payments`,
   `ContentCards`, `Notifications`, `Expenses`, `Complaints`, `PanicLogs`,
   `ProfilWarga`, `PushTokens`, `PushErrorLogs`).
2. Di spreadsheet itu, buka **Extensions → Apps Script**.
3. Hapus isi editor default, lalu tempel seluruh isi `code.gs` dari repo
   ini.
4. Skrip ini **container-bound** ke spreadsheet (tidak perlu isi
   `SPREADSHEET_ID` manual — otomatis memakai spreadsheet tempat skrip ini
   ditempel lewat `SpreadsheetApp.getActiveSpreadsheet()`).
5. **(Opsional tapi disarankan)** Buka **Project Settings → Script
   Properties**, tambahkan:
   - `GEMINI_API_KEY` — API key Google AI Studio, untuk verifikasi otomatis
     bukti transfer IPL. Tanpa ini, bukti transfer tetap bisa diupload tapi
     tidak diverifikasi otomatis (perlu cek manual admin).
   - `FCM_CLIENT_EMAIL` dan `FCM_PRIVATE_KEY` — dari Service Account
     project Firebase (lihat langkah 2 di bawah), untuk push notification.
     Tanpa ini, aplikasi tetap jalan normal, hanya push notification-nya
     yang tidak aktif.
6. **Deploy → New deployment → Web app**. Atur _Execute as_: **Me**, dan
   _Who has access_: **Anyone**. Klik **Deploy**, izinkan akses, lalu salin
   URL yang berakhir dengan `/exec`.
7. Buka `app.js`, cari `const APPS_SCRIPT_URL =` di bagian paling atas,
   tempel URL tadi.
8. Buka Users sheet dan tambahkan minimal satu baris admin manual pertama
   kali (kolom: `Unit | PIN | Nama | Role`, isi `Role` dengan `admin`) —
   setelah punya 1 akun admin, sisanya bisa didaftarkan langsung lewat menu
   **Kelola Warga** di aplikasi, tidak perlu edit spreadsheet lagi.

> ⚠️ **Penting:** setiap kali `code.gs` diubah, kamu HARUS deploy ulang
> lewat **Deploy → Manage deployments → (pilih deployment aktif) → Edit
> (ikon pensil) → Version: New version → Deploy**. Menyimpan skrip saja
> (Ctrl+S) **tidak** otomatis memperbarui Web App yang sedang live.

## 2. Menghubungkan Firebase (feed sosial & push notification)

1. Buat project baru di [Firebase Console](https://console.firebase.google.com).
2. Aktifkan **Firestore Database** (mode production/locked, aturan akses
   diatur sesuai kebutuhan) — dipakai untuk feed sosial (posting, like,
   komentar) real-time.
3. Aktifkan **Cloud Messaging** — dipakai untuk push notification.
4. Buka **Project Settings → General**, salin konfigurasi Web App
   (`apiKey`, `authDomain`, `projectId`, dst), tempel ke `firebaseConfig`
   di bagian atas `app.js`.
5. Di **Project Settings → Cloud Messaging → Web configuration**, generate
   **Web Push certificate (VAPID key)**, tempel ke variabel `vapidKey` di
   `app.js` (dicari lewat fungsi `requestNotificationPermission`).
6. Untuk mengirim push dari backend, buat **Service Account** di
   **Project Settings → Service Accounts → Generate new private key**,
   lalu isi `FCM_CLIENT_EMAIL` (client_email) dan `FCM_PRIVATE_KEY`
   (private_key) ke Script Properties Apps Script (lihat langkah 1.5 di
   atas).

## 3. Deploy ke GitHub Pages

1. Buat repositori GitHub baru, unggah seluruh isi folder ini (**kecuali**
   `code.gs` — file itu ditempel ke Apps Script, bukan ke GitHub).
2. Di GitHub, buka **Settings → Pages**.
3. Pada **Build and deployment**, pilih **Deploy from a branch**, lalu
   pilih branch `main` dan folder `/ (root)`. Simpan.
4. GitHub akan memberi alamat situs (`https://<username>.github.io/<repo>/`)
   beberapa saat kemudian, dan otomatis redeploy setiap ada push baru ke
   branch `main` lewat workflow bawaan `pages-build-deployment`.

## Data & Privasi

- Semua data (tagihan, pembayaran, profil warga, jadwal shift, dll)
  tersimpan di **Google Sheets**, bukan di penyimpanan lokal perangkat.
- Riwayat pembayaran & data pribadi warga **hanya bisa dilihat oleh
  pemilik unit yang bersangkutan** dan admin lewat spreadsheet — tidak
  ditampilkan ke warga lain.
- Feed sosial ("Update Warga") bersifat **publik antar-sesama warga**
  (nama & isi postingan terlihat semua warga yang login), sama seperti
  media sosial pada umumnya — pastikan warga paham ini sebelum memakainya.

> Aplikasi ini mencatat & memverifikasi bukti transfer memakai AI, belum
> terintegrasi payment gateway/bank secara langsung. Untuk transaksi
> otomatis real-time, integrasikan payment gateway pada tahap berikutnya.
