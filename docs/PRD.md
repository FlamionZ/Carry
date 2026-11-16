# Product Requirements Document (PRD)
## Blending Optimization System — AI-Assisted Dynamic Barge Blending, Quality Prediction & Trailer Distribution

| | |
|---|---|
| **Client** | Adaro — Site Kelanis |
| **Dokumen** | PRD v0.1 — MVP Demo Phase |
| **Disusun oleh** | Astheron Technologies |
| **Status** | Draft untuk presentasi client |

---

## 1. Latar Belakang & Problem Statement

Site Kelanis memproduksi 4 produk batubara dengan spesifikasi calorific value (CV) yang ketat — **E5000, E4900, E4700, E4200** — hasil blending dari **>20 jenis raw material (4 kategori rank)** yang tersebar di **11 ROM area**. Material diangkut oleh **350 unit trailer double vessel (135 ton)** dengan jarak tempuh 73–89 km dan waktu perjalanan **±2 jam** menuju 2 jetty (7 hopper) untuk dimuat ke barge.

Tiga masalah inti yang dihadapi operasional saat ini:

1. **Jeda waktu 2 jam** antara trailer dimuat di ROM dan tiba di hopper/jetty — begitu komposisi blending salah, baru ketahuan setelah terlambat dikoreksi.
2. **Supply trailer fluktuatif per jam** dan **hopper breakdown tidak terprediksi**, sehingga rencana blending yang disusun di awal shift sering meleset di lapangan.
3. **Keputusan blending & distribusi trailer masih manual/reaktif** — mengandalkan pengalaman staff, bukan data real-time — dengan risiko:
   - **Off-spec** (CV di bawah target) → produk ditolak/kena penalti buyer
   - **Giveaway** (CV di atas target) → kerugian karena memberi kualitas lebih tinggi dari yang dibayar

Dokumen konsep dari client (*Blending Optimization Concept*) sudah mengidentifikasi 3 modul AI yang dibutuhkan beserta PIC masing-masing. PRD ini menerjemahkan kebutuhan tersebut menjadi **MVP yang bisa didemokan** sebagai tahap validasi sebelum investasi ke sistem produksi penuh.

---

## 2. Tujuan

### 2.1 Tujuan Bisnis (jangka panjang)
Menutup gap 2 jam antara keputusan diambil dan hasil terlihat, sehingga blending konsisten tepat sasaran — meminimalkan off-spec dan giveaway, serta meningkatkan efisiensi utilisasi trailer, ROM, hopper, dan jetty.

### 2.2 Tujuan MVP (dokumen ini)
Membangun **demo fungsional end-to-end** yang membuktikan konsep ke client secara konkret — bagaimana ketiga modul AI bekerja bersama dan output apa yang akan diterima staff dispatch/planning — sebagai dasar client memberi lampu hijau untuk pilot Phase 1 dengan data real.

---

## 3. Target Pengguna (Personas / PIC)

| PIC (dari dokumen client) | Kebutuhan utama | Modul terkait |
|---|---|---|
| Planning & Stockpile Mgt Kelanis | Tahu estimasi waktu selesai barge & rencana blending | Modul 1 |
| Dispatch KM 0 & 67 | Tahu prediksi kualitas barge & tujuan trailer (jetty/hopper) | Modul 2 |
| Dispatch KM 67 & SIS | Distribusi trailer & tujuan ROM yang optimal | Modul 3 |
| Decision maker Adaro (audiens demo) | Validasi ROI & kelayakan teknis sebelum approve budget lanjutan | Semua modul |

---

## 4. Scope

### 4.1 MVP Demo Scope — Phase 0 (dokumen ini)
Dashboard interaktif dengan **data simulasi** yang menunjukkan output dari ketiga modul secara terintegrasi:

| Fitur | Deskripsi |
|---|---|
| Barge Monitoring | Progress loading, ETA, predicted CV, status (on-spec/monitor/off-spec) untuk tiap barge aktif |
| Blending & Quality Prediction | Target CV vs predicted CV, breakdown kontribusi per ROM sumber |
| Trailer Distribution Plan | Rencana rute trailer: dari ROM mana ke hopper mana, tonase, ETD |
| Rekomendasi AI | Aksi korektif konkret ketika prediksi CV menyimpang dari target (bukan cuma angka — actionable) |
| ROM Inventory Status | Level stok tiap ROM area dan status (available/almost full/low stock) |

### 4.2 Phase 1 — Pilot dengan Data Real (di luar MVP ini)
- Integrasi **1 modul prioritas** (rekomendasi: Modul 2 — Barge Quality, karena sumber data paling jelas: RFID/Alamo + KCT) dengan data historis real dari client
- Validasi akurasi model terhadap ground truth aktual (backtesting)

### 4.3 Phase 2 — Full Production (di luar MVP ini)
- Integrasi real-time SCADA, GPS/RFID
- Modul 1 (ETA) dan Modul 3 (Operations Research/optimasi) aktif
- Integrasi ke Fleet Management System (FMS) — dispatch instruction otomatis

### 4.4 Out of Scope untuk MVP Ini (Eksplisit)
- ❌ Koneksi ke data real/live milik client
- ❌ Model ML/OR yang benar-benar terlatih — angka pada demo adalah **simulasi**, bukan hasil model
- ❌ Integrasi FMS
- ❌ Autentikasi user & role-based access control
- ❌ Mobile app / native app

---

## 5. Functional Requirements — MVP Demo

| ID | Requirement | Prioritas |
|---|---|---|
| FR-01 | Menampilkan status ≥3 barge aktif dengan progress, ETA, predicted CV, dan status visual | Must |
| FR-02 | Menampilkan breakdown komposisi blending (per ROM) untuk 1 barge fokus, dengan target vs predicted CV | Must |
| FR-03 | Menampilkan rencana distribusi trailer (from ROM → to Hopper, qty, ETD) dalam bentuk tabel | Must |
| FR-04 | Menampilkan rekomendasi korektif berbasis kondisi barge yang menyimpang dari target | Must |
| FR-05 | Menampilkan status inventory ROM (level & kategori status) | Should |
| FR-06 | Data pada dashboard memperlihatkan indikasi "live" (refresh berkala) untuk mensimulasikan sistem operasional | Should |
| FR-07 | Label eksplisit bahwa data adalah simulasi, tidak boleh disalahartikan sebagai data operasional real | Must |

---

## 6. Non-Functional Requirements

- **Portability** — bisa dibuka langsung di browser tanpa instalasi/server, agar bisa didemokan di laptop mana pun termasuk di lokasi client
- **Performance** — waktu muat halaman < 2 detik
- **Keterbacaan presentasi** — kontras & ukuran teks memadai untuk ditampilkan lewat proyektor/screen share
- **Kejujuran data** — tidak ada representasi yang menyesatkan bahwa data simulasi adalah data operasional aktual

---

## 7. Success Metrics untuk Demo

1. Client memahami value proposition (predictive + actionable recommendation) dalam < 5 menit presentasi
2. Tidak ada pertanyaan teknis dasar (arsitektur, sumber data, skalabilitas) yang tidak terjawab — didukung oleh `ARCHITECTURE.md` dan `SCHEMA.md`
3. Client memberi keputusan lanjut (approve pilot Phase 1) atau feedback konkret untuk iterasi berikutnya

---

## 8. Risks & Assumptions

Risiko berikut diakui langsung oleh client di dokumen konsep awal, dan menjadi constraint desain sejak Phase 1:

| Risiko | Dampak | Mitigasi yang direncanakan |
|---|---|---|
| Network instability di lapangan | Data terputus, sync gagal | Edge buffering / store-and-forward di titik dispatch (lihat `ARCHITECTURE.md`) |
| Sumber data tersebar & manual | Model tidak akurat, delay implementasi | Fase data audit + intake manual terstruktur sebelum full automation |
| Hopper breakdown tidak terprediksi | ETA & quality prediction meleset | Anomaly flagging, bukan auto-reject; human-in-the-loop di Phase 1 |
| Asumsi: client bisa menyediakan data historis minimal 3–6 bulan untuk Phase 1 | Jika tidak tersedia, timeline pilot mundur | Dikonfirmasi di kickoff Phase 1 |

---

## 9. Roadmap Indikatif

```
Phase 0 (MVP Demo)          Phase 1 (Pilot)                 Phase 2 (Production)
─────────────────           ─────────────────               ─────────────────────
Dashboard demo,              1 modul (Barge Quality)         3 modul aktif,
data simulasi,                dengan data historis real,      real-time SCADA/GPS,
untuk validasi konsep         validasi akurasi model           integrasi FMS penuh
─────────────────           ─────────────────               ─────────────────────
     ~1–2 minggu                  ~4–8 minggu                    ~3–6 bulan
```

---

## 10. Referensi

Dokumen ini diturunkan dari *Blending Optimization Concept* milik client, mencakup: skema 4 produk (E5000/E4900/E4700/E4200), 11 ROM area, 350 unit trailer, 7 hopper (H1–H7) di 2 jetty, serta 3 modul AI dan PIC masing-masing sebagaimana didefinisikan client.
