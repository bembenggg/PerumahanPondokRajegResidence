# PWA Pondok Rajeg

Aplikasi layanan warga statis untuk GitHub Pages, meliputi dashboard, pembayaran IPL, tombol panik, serta impor/ekspor Excel. Database pusat memakai Google Sheets melalui Google Apps Script.

## Menjalankan lokal

Buka dengan server lokal (bukan langsung dari berkas `index.html`) agar fungsi PWA dapat aktif.

## Deploy ke GitHub Pages

1. Buat repositori GitHub baru lalu unggah seluruh isi folder ini.
2. Di GitHub, buka **Settings → Pages**.
3. Pada **Build and deployment**, pilih **Deploy from a branch**, lalu pilih branch `main` dan folder `/ (root)`.
4. Simpan. GitHub akan memberi alamat situs beberapa saat kemudian.

## Data Excel

Data pembayaran disimpan di browser/perangkat warga (Local Storage). Dari menu **Data Excel**, data dapat diekspor menjadi `Pembayaran-IPL-Pondok-Rajeg.xlsx` atau diimpor kembali. Fitur Excel membutuhkan koneksi internet saat memuat pustaka Excel untuk pertama kali.

## Menghubungkan Google Sheets (database pusat)

1. Buat Google Sheets baru, lalu salin ID-nya dari URL: bagian di antara `/d/` dan `/edit`.
2. Pada spreadsheet, pilih **Extensions → Apps Script**. Salin isi `apps-script/Code.gs` ke editor Apps Script.
3. Ganti nilai `SPREADSHEET_ID` dengan ID spreadsheet pada langkah pertama, lalu simpan.
4. Pilih **Deploy → New deployment → Web app**. Atur *Execute as*: **Me**, dan *Who has access*: **Anyone**. Klik **Deploy**, izinkan akses, lalu salin URL yang berakhir dengan `/exec`.
5. Buka `app.js`; tempel URL itu ke `const APPS_SCRIPT_URL = ''`.
6. Unggah kembali perubahan `app.js` ke GitHub. Pembayaran dan laporan Panic berikutnya otomatis masuk ke spreadsheet.

Sheet **Pembayaran IPL** dan **Laporan Panic** dibuat otomatis ketika data pertama masuk. Data dapat diunduh sebagai format Excel langsung dari Google Sheets melalui **File → Download → Microsoft Excel**.

Untuk menjaga privasi, riwayat seluruh warga tidak ditampilkan ulang pada situs publik. Admin melihat data pusat langsung di Google Sheets; riwayat yang tampil di aplikasi tersimpan pada perangkat warga tersebut.

> Ini mencatat laporan pembayaran, belum memverifikasi transaksi bank/QRIS secara otomatis. Untuk transaksi nyata, integrasikan payment gateway pada tahap berikutnya.
