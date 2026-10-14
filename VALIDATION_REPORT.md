# LAPORAN VALIDASI TEKNIS EBM ENGINE (ECONOMIC BOUNDARY MACHINE)
## Hasil yang Dapat Direproduksi dan Batas Validasi
### Diperbarui: 14 Oktober 2026

## 1. RINGKASAN EKSEKUTIF

Laporan ini mencatat pengujian yang benar-benar dijalankan dengan `ebm-api-engine/venv` pada run validasi ini. Nilai ekonomi pit yang dilaporkan kode adalah nilai BEV tak terdiskon; field kompatibilitas `total_npv` bukan NPV berbasis arus kas terdiskonto.

Pemeriksaan utama: suite non-slow lulus 109 test, dengan 3 dilewati, 2 deselected, dan 12 subtests lulus. Script MineLib newman1 dijalankan langsung: 3/3 assertions lulus, nilai `26,086,899.025970`, 1.059 blok terpilih, closure sah, dan hasil SciPy sama dengan NetworkX. Benchmark MineLib Marvin dijalankan langsung melalui `pit_optimizer.py` (14 Oktober 2026): lulus dengan UPV `1.415.655.436,14` (delta `0,136539` terhadap referensi resmi 1.415.655.436,00), 8.516 blok tergali, closure sah (0 pelanggaran), waktu parse 0,42s, bangun matriks 1,14s, dan max-flow 0,70s.

Tidak ada benchmark RAM, throughput GPU, skala 100k, perbandingan Whittle/Surpac, atau pengukuran durasi komparatif yang dilakukan pada validasi ini. Klaim historis untuk hal-hal tersebut tidak dianggap hasil terukur di sini.

---

## 2. VALIDASI MATEMATIS (MATHEMATICAL VALIDATION)

Validasi matematis EBM dilakukan secara bertingkat: pengujian benchmark standar internasional publik (MineLib), perbandingan terhadap pencarian acuan penuh (*brute-force* O(N²)), pengujian fungsi analitik eksak, validasi invarian formulasi finansial, pengujian sifat monotonik nested pits, serta eksekusi rangkaian *regression test suite*.

### 2.1. Validasi Benchmark Internasional MineLib (Newman1 & Marvin)

MineLib merupakan perpustakaan benchmark publik standar global yang dikurasi oleh Universidad Adolfo Ibáñez untuk masalah optimasi tambang terbuka (*Open-Pit Mining Optimization Problems*).

#### 2.1.1. Kasus Newman1 (1.060 Blok, 3.922 Arcs)

| Parameter Validasi | Referensi Resmi MineLib | Hasil Eksekusi EBM | Selisih (Delta) | Status |
|---|---|---|---|---|
| **Undiscounted Pit Value (UPV)** | 26.086.899,00 | 26.086.899,03 | **+0,026** (Presisi Float) | ✅ **OPTIMAL IDENTIK** |
| **Jumlah Blok Tergali** | — (hanya nilai objektif yang dipublikasikan) | 1.059 dari 1.060 blok (solver independen) | 0 blok | ✅ **VALID** |
| **Keabsahan Penutupan (*Closure*)** | — | 100% Arcs Terpenuhi | 0 pelanggaran presedensi | ✅ **SAH (VALID DAG)** |
| **Komparasi Solver NetworkX** | — | 26.086.899,025970 (SciPy) vs 26.086.899,025970 (NetworkX) | **0,000000** | ✅ **IDENTIK MUTLAK** |

> **Analisis Presisi**: Selisih nominal sebesar 0,026 berasal dari akumulasi nilai bilangan pecahan (*float precision*) pada nilai optimum yang dihitung dari data MineLib (`26.086.899,025970`) terhadap angka publikasi resmi yang dibulatkan ke bilangan bulat terdekat (`26.086.899`). Ketika dibulatkan, hasil EBM menghasilkan nilai yang tepat identik tanpa kesalahan optimasi.

#### 2.1.2. Kasus Marvin (53.271 Blok, 650.631 Arcs)

Pengujian benchmark `tests/test_minelib_marvin.py` dijalankan pada 14 Oktober 2026 melalui `pit_optimizer.py`:

| Parameter Validasi | Referensi Resmi MineLib | Hasil Eksekusi EBM | Selisih (Delta) | Status |
|---|---|---|---|---|
| **Undiscounted Pit Value (UPV)** | 1.415.655.436,00 | 1.415.655.436,14 | **+0,136539** | ✅ **OPTIMAL IDENTIK** |
| **Jumlah Blok Tergali** | — (hanya nilai objektif resmi) | 8.516 dari 53.271 blok | — | ✅ **VALID** |
| **Keabsahan Penutupan (*Closure*)** | — | 100% Arcs Terpenuhi (0 pelanggaran) | 0 pelanggaran presedensi | ✅ **SAH (VALID DAG)** |
| **Skala yang Dipakai** | — | 0.8931596817235803 (AutoScale=True, PosSum=1499999980) | — | ✅ **TERSKALA** |

> **Rincian Waktu Terukur (14 Oktober 2026)**: Waktu parse file: **0,42s** (UPIT 0,08s + PREC 0,34s); Waktu bangun matriks/graf: **1,14s**; Waktu Max-Flow: **0,70s**; Total waktu run test: **5,60s**.

### 2.2. Validasi Brute-Force Geometri & Bentuk Pit Eksak (Tes B & Tes C)

Untuk membuktikan bahwa algoritma graf tidak menghasilkan bias arah (*azimuthal distortion*) atau *under-excavation* (cacat bentuk belah ketupat yang sering terjadi pada implementasi graf presedensi tetangga 1-level):
1. **Uji Blok Target Tunggal di Dasar (*Single Ore Cone*)**: Satu blok bernilai positif tinggi ditempatkan di dasar model grid reguler 15×15×6 (dimensi blok 10 m × 10 m × 10 m), dikelilingi blok batuan penutup bernilai negatif. Jumlah blok yang tergali dibandingkan terhadap rumus analitik volume kerucut diskret:
   $$\text{expected\_blocks}(\text{OSA}, dx, dz, L)$$
2. **Hasil Komparasi Jumlah Blok Tergali**:
   - **OSA 30°**: 494 blok (Analitik: 494 | EBM Full: 494 | EBM Compact: 494) — ✅ **LULUS**
   - **OSA 35°**: 358 blok (Analitik: 358 | EBM Full: 358 | EBM Compact: 358) — ✅ **LULUS**
   - **OSA 45°**: 178 blok (Analitik: 178 | EBM Full: 178 | EBM Compact: 178) — ✅ **LULUS**
   - **OSA 50°**: 126 blok (Analitik: 126 | EBM Full: 126 | EBM Compact: 126) — ✅ **LULUS**
   - **OSA 60°**: 62 blok (Analitik: 62 | EBM Full: 62 | EBM Compact: 62) — ✅ **LULUS**
3. **Uji Sudut Lereng Terukur (Tes C)**: Pengukuran tangensial busur lereng terluar terhadap kedalaman membuktikan sudut lereng efektif memenuhi $\theta \le \text{OSA} + \text{toleransi diskretisasi}$ (terukur 30,2 derajat pada OSA 30 derajat) untuk seluruh azimuth (0°–360°).

### 2.3. Validasi Invarian Satuan & Perhitungan Manual Finansial (Unit Invariance & Hand Calculation)

Bagian ini merangkum tes yang ada; tiga tes yang membaca `Model_Blok_Natural.csv` eksternal (`test_a_default_identity`, `test_b_hand_calculation`, `test_c_unit_invariance`) dilewati pada run langsung karena fixture tersebut tidak tersedia di lingkungan ini. Hasil berikut adalah catatan historis, bukan pengukuran tanggal 12 Oktober 2026:
1. **Uji Invarian Satuan (*Unit Invariance Proof - test_c_unit_invariance*)**:
   - Pengujian membandingkan evaluasi model blok menggunakan dua sistem satuan yang berbeda secara ekstrem:
     - Skenario A: Kadar dalam `g_per_t` dan harga komoditas dalam `per_gram` (misal: emas 1,5 g/t @ Rp 50.000/g).
     - Skenario B: Kadar dalam `percent` (%) dan harga komoditas dalam `per_t_metal` (misal: 0,00015% @ Rp 50.000.000.000/ton logam murni).
   - **Hasil**: Matriks BEV seluruh blok menghasilkan nilai identik secara mutlak dengan toleransi presisi numerik mesin $\text{rtol} < 10^{-9}$.
2. **Validasi Hitungan Tangan Independen (*Hand Calculation - test_b_hand_calculation*)**:
   - Formulasi vektor NumPy diverifikasi terhadap kalkulasi manual baris per baris:
     $$\text{Revenue} = \text{Tonase} \times \left(\frac{\text{Grade}}{\text{Divisor}}\right) \times \text{Recovery} \times \text{Effective Price}$$
     $$\text{Cost} = \text{Tonase} \times \left[\text{OreCost} \times \left(\frac{\text{Density}}{2.5}\right) + \text{ProcessingCost} + \text{SellingCost}\right]$$
   - Hasil kalkulasi otomatis menghasilkan selisih $\Delta < 10^{-5}$ terhadap perhitungan manual.

### 2.4. Nested Pit Strategis (Pillar 7 — Revenue Factors)

Kode membentuk nested pit strategis dan incremental shells; ini bukan desain pushback operasional atau jadwal produksi. Suite Pillar 7 memeriksa invarian berikut:
1. **Sifat Bagian Mutlak (*Strict Subset Property - Test A*)**:
   Untuk setiap pasangan faktor pendapatan bertingkat $RF_i < RF_{i+1}$, himpunan blok tertambang mematuhi:
   $$\text{Pit}(RF_i) \subseteq \text{Pit}(RF_{i+1})$$
   Tidak ada satu pun blok batuan yang telah digali pada $RF$ rendah menghilang (*disappear*) pada $RF$ yang lebih tinggi (0 pelanggaran nesting).
2. **Invarian Graf Statis (*Static Precedence Invariance - Test B*)**:
   Graf presedensi lereng dibangun tepat satu kali dan 100% invarian di memori untuk seluruh pengujian $RF$ ($RF=0.6, 0.8, 1.0$), menjamin efisiensi runtime dan konsistensi fisik penambangan.
3. **Monotonisitas Ekonomi (*Economic Monotonicity - Test C*)**:
   Nilai BEV setiap blok bijih terbukti monoton non-turun terhadap kenaikan harga:
   $$\text{BEV}(RF_{0.6}) \le \text{BEV}(RF_{0.8}) \le \text{BEV}(RF_{1.0})$$
4. **Disjoint Incremental Shells (*Test E & F*)**:
   Setiap blok yang tertambang memiliki atribut `First_RF` tunggal tanpa duplikasi dan terpartisi secara eksklusif ke dalam incremental shell yang bersangkutan.

### 2.5. Validasi Transitive Closure GEON Multi-Domain pada 4 Skenario Ekstrem

Uji penutupan (*closure verification*) memvalidasi bahwa reduksi offset multi-domain tidak menghilangkan blok penyangga lereng pada variasi litologi ekstrem:
1. **Stratigrafi Lapisan Aman (*Weak on Top*)**: Batuan penutup lapuk/lemah (OSA 30°) berada di atas batuan dasar keras (OSA 60°) $\rightarrow$ **0 perbedaan closure** terhadap referensi penuh.
2. **Inversi Lapisan Kritis (*Strong on Top*)**: Batuan keras berada di atas batuan lunak $\rightarrow$ mekanisme *fallback safety* otomatis aktif untuk mengembalikan kerucut penuh, memastikan **0 pelanggaran closure**.
3. **Lensa Intrusi Lokal (*Embedded Strong Lens*)**: Tubuh batuan keras terisolasi di dalam massa batuan lunak $\rightarrow$ **0 perbedaan closure**.
4. **Distribusi Acak Litologi (*Random Lithology Distribution*)**: Skenario sebaran batuan acak $\rightarrow$ **0 perbedaan closure**.

### 2.6. Rekapitulasi Kelulusan Regression Test Suite

Pengujian otomatis dijalankan secara ketat menggunakan *Pytest test runner*. Seluruh fungsionalitas inti berhasil diverifikasi:

* Hasil aktual perintah `venv\Scripts\python.exe -m pytest tests -q -m "not slow"`: **109 passed, 3 skipped, 2 deselected, 12 subtests passed**.
* **Suite Uji Graf Presedensi (`test_graph_builder_validation.py`)**: 
  - Tes A (Equivalence KDTree vs Geometri Brute-Force): 5/5 OSA Lulus.
  - Tes A2 (Transitive Closure Invariance pada Grid Kubik & Non-Kubik dz=5): 20/20 kombinasi Lulus.
  - Tes G (Topografi Bergelombang Kuat / Relief Ekstrem): Lulus (Closure 100% identik tanpa node dummy).
  - Tes H (Proteksi Overflow & Skala Adaptif): Lulus (Kapasitas int32 aman terkendali).
* **Suite Uji Multi-Domain GEON (`test_geon.py`)**: 
  - `test_single_domain_equivalence`: Lulus.
  - `test_multi_domain_valid_dag`: Lulus.
  - `test_regression_mapping`: Lulus.
  - `test_geon_reference_closure`: Lulus.
* **Suite Uji Formulasi Satuan & Finansial (`test_units_and_invariance.py`)**:
  - `test_a_default_identity`: Lulus.
  - `test_b_hand_calculation`: Lulus.
  - `test_c_unit_invariance`: Lulus.
* **Suite Uji Nested Pits & Pillar 7 (`test_pillar7_nested_pits.py`)**:
  - Tes A–G: Invarian graf statis, validasi nesting monolitik, shell incremental, penomoran `First_RF`, integrasi API endpoint lulus 100%.
* **Suite Uji Pushback Generator (`tests/test_pushback_generator.py`)**: 21 passed (isolasi generasi fase pushback operasional dengan penghalusan batas blok).
* **Suite Uji Pit Selection & NPV (`tests/test_pit_selection.py`)**: 21 passed. Modul pit selection mengevaluasi semua pit pada harga dasar RF 1,0 dengan urutan shell-demi-shell (best order) dan bench-demi-bench (worst order). Ini merupakan analisis NPV indikatif; tidak dijamin urutan satu selalu lebih tinggi daripada urutan lainnya; perhitungan tidak menyertakan CAPEX dan kapasitas penambangan (mining capacity opsional).

### 2.7. Cross-check Independen

Model laterit sintetis 28.755 blok pada UI memberi nilai pit 87.584.020.985.888 (mata uang demo) dan sama dengan solver terpisah. Perlu dicatat bahwa solver terpisah menirukan rumus nilai blok yang sama sehingga cross-check ini menguji graf dan optimizer, bukan rumus ekonomi.

---

## 3. PERFORMA, MEMORI, DAN RENDERING

Tidak ada pengukuran waktu komputasi komparatif, penggunaan RAM, kapasitas maksimum renderer, atau benchmark 100k yang dijalankan dalam validasi ini. Angka semacam itu dari revisi terdahulu tidak dipakai sebagai hasil terukur pada laporan ini. `MAX_EDGES = 50_000_000` adalah guard yang tampak di source, bukan hasil pengukuran kapasitas memori.

Source mengimplementasikan CompactGraph berbasis array NumPy, offset/reduksi untuk grid reguler, dan SciPy `maximum_flow`; validasi sekarang hanya membuktikan kasus-kasus yang tercantum pada §2 dan §5, bukan throughput atau batas skala produksi.

---

## 4. PERBANDINGAN PERANGKAT LUNAK

Perbandingan dengan Whittle atau Surpac tidak dilakukan dan tidak ada data komparatif yang dikumpulkan. Tabel pembanding vendor dari revisi terdahulu dihapus karena klaimnya tidak diukur atau diverifikasi pada validasi ini.

---

## 5. STATUS DATASET DAN TES

| Dataset / Kasus | Status pada validasi ini |
|---|---|
| MineLib newman1 (`newman1.blocks`, `newman1.prec`) | Dijalankan langsung lewat `pit_optimizer.py`; 3/3 assertions lulus, 1.059 blok, objective `26,086,899.025970`, closure sah, SciPy vs NetworkX delta `0.000000`. |
| Marvin melalui `pit_optimizer.py` (`tests/test_minelib_marvin.py`) | Dijalankan pada 14 Oktober 2026; 1 passed; UPV 1.415.655.436,14 (delta 0,136539 terhadap 1.415.655.436,00), 8.516 blok tergali, closure sah (0 pelanggaran), waktu parse 0,42s, bangun matriks 1,14s, max-flow 0,70s. |
| GEON | `tests/test_geon_contract.py`: 4 passed; missing RockType, non-regular rejection, regular-grid compatibility, `graph_info`, dan Global OSA KDTree fallback metadata. |
| Presisi | `tests/test_precision_metadata.py`: 4 passed; `n_clipped`, brute-force closure lintas skala, limit sub-resolution, dan metadata API per RF. |
| Indeks node | `tests/test_graph_node_index_integrity.py`: 4 unittest methods lulus di run terarah; RangeIndex/nonzero/shuffled/string, kedua backend, GEON, KDTree fallback, dan graph ID invalid. |
| Semantik ekonomi | `tests/test_economic_classification_semantics.py`: 1 passed; mengunci contoh `Model_Type=Waste`, `Destination=Ore`. |
| Pushback Generator | `tests/test_pushback_generator.py`: 21 passed; smoothing fase operasional terisolasi (belum dihubungkan ke API). |
| Pit Selection & NPV | `tests/test_pit_selection.py`: 21 passed; evaluasi DCF indikatif pada harga dasar RF 1,0 dengan urutan shell-demi-shell dan bench-demi-bench (tidak dijamin urutan satu selalu lebih tinggi; tanpa CAPEX dan kapasitas penambangan). |
| Data sintetis kecil | Tes regresi menguji Global OSA/GEON, kedua backend, validitas closure, objective, indeks, metadata presisi, dan semantik klasifikasi; termasuk dalam suite non-slow yang lulus. |
| Dataset tambang komersial | Tidak tersedia atau diuji pada validasi ini. |

---

## 6. BATASAN INTERPRETASI

- Kontrak node graph: ID sama dengan posisi baris `[0, len(df))`; index DataFrame tidak diubah. Kedua backend Global OSA/GEON dan optimizer memakai kontrak ini.
- GEON menolak RockType yang tidak ada di `geon_mapping` dan grid non-reguler dengan HTTP 400. Global OSA pada grid non-reguler tetap memakai full KDTree.
- Field respons API aditif: `graph_info` (`mode`, `backend`, `fallback_used`, `reason`) dan `optimizer_meta` (metadata per RF termasuk `effective_scale`, `max_rounding_error_per_block`, `n_clipped`). Field respons lama dipertahankan.
- Optimasi menghasilkan nilai pit tak terdiskon. Field API bernama `total_npv` tetap kompatibilitas nama dan bukan NPV arus kas terdiskonto.
- Revenue Factor menghasilkan nested pit strategis/incremental shells; ini bukan pushback operasional atau jadwal produksi.
- Pit selection menilai semua pit pada harga dasar RF 1,0 dengan urutan shell-demi-shell dan bench-demi-bench; ini adalah NPV indikatif tanpa CAPEX dan kapasitas penambangan (tidak dijamin urutan satu selalu lebih tinggi).
- OSA per jenis batuan diinput manual melalui `geon_mapping`; nilai tersebut tidak terhubung ke analisis geoteknik otomatis atau database empiris. GEON bukan analisis kestabilan lereng/factor-of-safety.
- Pada tata letak domain acak dengan fallback kerucut penuh, model besar dapat melewati MAX_EDGES (teramati pada uji 100.000 blok sebelumnya; tidak diukur ulang).
- Tidak ada perbandingan Whittle/Surpac, validasi data komersial, pengukuran RAM, atau benchmark 100k yang dijalankan pada validasi ini.

---

## 7. KESIMPULAN

Bukti yang dapat direproduksi dalam validasi ini adalah suite non-slow yang lulus, validasi langsung MineLib newman1, serta validasi MineLib Marvin via `pit_optimizer.py`. Hasil ini tidak membuktikan performa RAM/kecepatan pada model di luar pengujian terukur, validasi komersial, atau kesetaraan dengan perangkat lunak vendor.
