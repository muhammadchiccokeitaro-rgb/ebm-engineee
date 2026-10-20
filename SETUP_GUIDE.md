# 🚀 EBM Engine — Panduan Setup Lokal

> **Untuk siapa:** Siapa saja yang menerima folder project ini dan ingin menjalankan aplikasi di laptop sendiri.

---

## Prasyarat

Pastikan sudah terinstal:

| Software | Versi minimum | Link download |
|---|---|---|
| **Python** | 3.10+ | https://www.python.org/downloads/ |
| **Node.js** | 18+ | https://nodejs.org/ |

---

## Struktur Folder

```
ebm-engine-app/
├── ebm-api-engine/   ← Backend Python (FastAPI)
└── ebm-frontend/     ← Frontend Next.js (React)
```

---

## LANGKAH 1 — Setup Backend (Python)

Buka **terminal / PowerShell**, masuk ke folder backend:

```powershell
cd ebm-engine-app\ebm-api-engine
```

### Buat virtual environment
```powershell
python -m venv venv
```

### Aktifkan venv
```powershell
# Windows:
.\venv\Scripts\activate

# Mac/Linux:
source venv/bin/activate
```

### Install dependencies
```powershell
pip install -r requirements.txt
```

> Kalau rasterio gagal install, coba: `pip install rasterio --no-binary rasterio`

### Jalankan server backend
```powershell
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Cek di browser: http://localhost:8001/health → harus muncul `{"status":"ok"}`

---

## LANGKAH 2 — Setup Frontend (Next.js)

Buka **terminal baru** (jangan tutup terminal backend):

```powershell
cd ebm-engine-app\ebm-frontend
npm install
npm run dev
```

Buka browser: **http://localhost:3000**

---

## LANGKAH 3 — Hubungkan Frontend ke Backend

1. Klik ikon **⚙️** (API Server) di toolbar kanan atas
2. Pastikan URL: `http://localhost:8001`
3. Klik **Test Koneksi** → harus hijau
4. Klik **Simpan**

---

## Cara Pakai

1. Upload CSV model blok di panel kiri
2. Isi parameter ekonomi
3. Klik **Jalankan Optimasi Pit**
4. Tunggu proses — hasil muncul di 3D viewer

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `ModuleNotFoundError` | Pastikan venv aktif + sudah install requirements |
| `port 8001 already in use` | Ganti ke `--port 8002`, update URL di UI |
| `Failed to fetch` di UI | Pastikan backend jalan, URL di UI benar |
| `npm install` gagal | Hapus `node_modules/` lalu ulangi |
| Model besar timeout | Normal >500k blok, tunggu 2-5 menit |

---

## Kebutuhan Hardware

| | Minimum | Disarankan |
|---|---|---|
| RAM | 8 GB | 16 GB+ |
| CPU | 4 core | 8 core+ |
| Storage | 2 GB | 5 GB |

---

*EBM Engine v2.2.0 — Ultimate Pit Limit Optimizer*
