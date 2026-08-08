# vacti - Cakupan Fitur Esensial & Kecocokan Teknologi

> Hasil pemetaan menyeluruh kebutuhan VA + Threat Intel, lalu disaring ke yang benar-benar penting.
> Tujuan: simpel tapi lengkap untuk VA + Threat Intel, dengan API & integrasi sebagai warga kelas satu.

## A. MASUK (esensial)

### 1. Recon / Vulnerability Assessment (disederhanakan, anti-double)

Pipeline tunggal & lurus (bukan banyak tool tumpang-tindih):

```
subfinder (opsional, skip bila predefined subs)
   → httpx (probe: alive, status, title, tech, webserver, CDN/CNAME)
      → naabu (port scan, exclude-cdn)
         → nuclei (vuln umum, per-severity, templates)
         → nuclei + template WordPress/wordfence (hanya host terdeteksi WordPress)
```

- **subfinder** (Go) - enum subdomain; bisa dilewati jika user sudah memberi daftar subdomain.
- **httpx** (Go) - probe HTTP + deteksi teknologi (dasar penanda WordPress).
- **naabu** (Go) - port scan cepat.
- **nuclei** (Go) - pemindai kerentanan berbasis template (sumber temuan utama).
- **WordPress scan = nuclei + template WordPress/wordfence** (BUKAN wpscan Ruby) - dijalankan
  KONDISIONAL hanya bila host ditandai WordPress (oleh httpx/tech-detect atau ditandai user).
  → keuntungan: **semua tool murni Go, tanpa runtime Ruby**, image lebih ringan, satu engine (nuclei).
- Penanda WordPress: tech fingerprint httpx → pola URL (`wp-content`/`wp-includes`/`wp-login.php`)
  → opsi tanda manual oleh user.

### 2. Threat Intelligence (DIPERTAHANKAN PENUH)

- **OTX AlienVault**: pulses, reputation, malware, passive DNS, URL list (per domain + indikator).
- **LeakCheck**: kredensial bocor (tipe `domain` & `origin`/stealer-log) + status "checked/unchecked".
- **Manual Indicators**: tambah domain/subdomain/IP manual + lookup OTX.
- **Unified Risk Score** (`calculate_risk_score`): 5 komponen dgn VA (VA 40 + Leak 30 + Exposure 12 +
  Reputation 10 + Malware 8) / 4 komponen tanpa VA (redistribusi) - dipakai konsisten di dashboard,
  halaman TI, dan report.
- **Status & progress** refresh (polling/streaming).

### 3. Reports (didesain ulang - lebih bagus/rapi/keren)

- **VA Report** (PDF) - ringkasan kerentanan + severity + temuan.
- **Threat Intel Report** (PDF) - cover, exec summary, IoC, CVE, breach monitoring, rekomendasi.
- **Dwibahasa EN/ID**, branding per-project (logo, warna, nomor dokumen, klasifikasi, signatory).
- Render dari HTML/CSS modern (Playwright) atau Typst → desain baru, bukan WeasyPrint lama.

### 4. Manajemen Project & Target

- **Project** (workspace, multi-tenant, scoping `/<slug>/`).
- **Target**: domain / organisasi, predefined subdomains, custom request headers.
- **Scan Engine / Config**: profil scan ringkas (pilih tool aktif, ports, severity, rate/threads,
  timeout) - versi sederhana dari YAML scan-profile yang berkelebihan opsi, tanpa lusinan opsi.
- **Scan History**: status, progres real-time, hasil per-scan, perbandingan antar-scan.
- **Scheduled Scans**: terjadwal (cron) - ringan, bukan celery-beat berat.
- **Recon Notes / Todo** (opsional ringan).

### 5. Integrasi (WAJIB)

- **Notifications via webhook**: Discord, Slack, Telegram, Google Chat (+ Lark opsional) -
  status scan, temuan, perubahan. Pemicu per-event dapat dikonfigurasi.
- **AI integration** (provider abstraction: OpenAI default + Ollama):
  enrichment kerentanan (description/impact/remediation), executive summary report,
  analisis/ringkasan threat. Hasil di-cache.
- **API Key Vault**: simpan & kelola kunci (OTX, LeakCheck, WPScan, provider AI) - terenkripsi.

### 6. API (WAJIB - warga kelas satu)

- **REST/typed API** untuk semua resource: project, target, scan (start/stop/status), subdomain,
  endpoint, port, vuln, threat-intel, report, settings.
- **OpenAPI** terdokumentasi otomatis.
- **Auth**: session + **API token** (untuk otomasi/CI eksternal).
- **RBAC**: model tiga-peran standar - SysAdmin / PenetrationTester / Auditor, dengan permission:
  modify_system_config, modify_scan_config, modify_scan_results, modify_report,
  initiate_scans, modify_targets (auditor = read + report saja).
- **Realtime**: progres scan via SSE/WebSocket.

### 7. Passive Recon & Exposure Discovery (➕ baru - studi referensi passive-recon)

Sumber OSINT **pasif** (HTTP API, bukan scanner aktif/biner) yang memperkaya attack surface VA dan
sebagian CTI. Detail penuh: [11-PASSIVE-RECON-AND-EXPOSURE.md](11-PASSIVE-RECON-AND-EXPOSURE.md).

- **Passive engines**: VirusTotal (passive DNS: subdomain, domain-siblings, undetected-URLs+tanggal,
  resolutions IP↔hostname) + Wayback Machine CDX (URL arsip). (URLScan opsional roadmap.)
- **Mode scan `passive`** (OSINT-only, tanpa biner) selain `active` & `full` (passive→feed→active).
- **Passive DNS / IP history**: temukan **origin di balik WAF**; melengkapi OTX (CTI).
- **Exposure findings** (regex pure-TS): AWS/GCP/GitHub/Slack/Stripe key, JWT, private key, DB-URL,
  basic-auth URL, combo-list/stealer cred, dll - mengisi komponen **Exposure** Unified Risk Score;
  beririsan LeakCheck → cross-link.
- **Content analysis**: kategori file by-ekstensi (backup/config/keys/dokumen) dgn aturan editable.
- **Deep-fetch (opt-in)**: ambil konten URL, **wajib SSRF-guard** + cap ukuran + proxy opsional.
- **Diff diperluas** (finding/IP/arsip) + **export CSV/ZIP**.
- **Tetap ringan**: engine = klien HTTP, rotasi/kuota kunci API di **Postgres (bukan Redis)**,
  tanpa biner baru, tetap tiga service.

## B. KELUAR (sengaja dibuang)

- ❌ **Bug Bounty mode + HackerOne** (sync program, import, submit report).
- ❌ **Screenshot** (EyeWitness/Selenium/Firefox/geckodriver) - beban berat dihapus.
- ❌ **Tool subdomain berlebih**: amass, sublist3r, oneforall, ctfr, tlsx, netlas, chaos → cukup subfinder.
- ❌ **URL fetching/crawler aktif**: gospider, hakrawler, katana + GF patterns (crawling aktif berat).
  → Catatan: **discovery URL PASIF** (Wayback CDX, VirusTotal undetected-URLs) kini **MASUK** (lihat A.7) -
  pasif = satu panggilan API arsip, bukan crawler. `gau/waybackurls` digantikan engine pasif internal.
- ❌ **Dir/file fuzzing**: ffuf.
- ❌ **Scanner ekstra**: dalfox, crlfuzz, s3scanner, nmap+NSE.
- ❌ **OSINT berat**: theHarvester, dorking/GooFuzz, h8mail, metafinder, CMSeeK, WAF detection.
- ❌ **WHOIS/domain-info kompleks** (Netlas, ViewDNS, historical IP) - opsional kecil bila perlu.
- ❌ Infra berat: Celery+Redis broker, Celery Beat, autoscale worker, Ollama wajib, Nginx multi-stage.

## C. Profil Kompleksitas (apa yang sebenarnya harus didukung tech)

| Dimensi                                    | Beban      | Catatan                                                                                                   |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| Orkestrasi job long-running                | **Sedang** | Pipeline 5 tahap, cancellation, progress, retry. Bukan throughput ekstrem (self-hosted, target terbatas). |
| Menjalankan tool eksternal                 | Rendah     | Exec 4 binary Go + 1 gem Ruby (wpscan). Sama untuk semua bahasa.                                          |
| Integrasi I/O (API eksternal, webhook, AI) | **Tinggi** | OTX/LeakCheck/AI/webhook - dominan I/O, async-friendly.                                                   |
| API + RBAC + multi-tenant + realtime       | **Tinggi** | Permukaan CRUD/typed-API/SSE besar.                                                                       |
| Render PDF                                 | Sedang     | HTML/CSS→PDF via Playwright/Typst (bahasa-agnostik).                                                      |
| Dashboard/visualisasi                      | **Tinggi** | Tabel besar, chart, dark mode, desain keren.                                                              |

➡️ **Kompleksitas didominasi I/O + API/integrasi + UI**, bukan komputasi berat atau konkurensi
ekstrem. Orkestrasi scan "sedang" dan bisa ditangani queue Postgres-backed + 1 worker.

## D. Verdict Teknologi

**Opsi 1 - Full-stack TypeScript tetap paling cocok** untuk profil ini:

- Mayoritas kerja = API + integrasi + UI/dashboard → **type-safety ujung-ke-ujung** memangkas error
  dan paling cepat dikembangkan; satu toolchain CI (tsc/ESLint/Vitest/Playwright) = CI terbaik.
- Orkestrasi scan ditangani **pg-boss** (queue di Postgres, tanpa Redis) + worker khusus:
  konkurensi dibatasi per-job, cancellation via `AbortController` + kill child-process, progress
  via SSE. WPScan (Ruby) & 4 binary Go cukup di-exec dari worker (Ruby + binaries ada di image).
- AI lewat **Vercel AI SDK** (OpenAI/Ollama) - abstraksi provider modern & streaming.
- Report HTML/CSS dirender Playwright (yang juga dipakai e2e) → desain baru paling leluasa.
- Infra minimal: **Postgres** (+ worker). Ringan, modern, reliable.

**Pilih Opsi 2 (Go + Next.js)** hanya jika kamu memproyeksikan **banyak scan konkuren/berat** dan
ingin engine compiled super-hemat-resource (goroutine + worker pool native, ~single binary) -
dgn konsekuensi backend dua bahasa (Go untuk engine/API, TS untuk UI) + OpenAPI codegen untuk
type-sharing. Untuk cakupan vacti yang sudah disederhanakan, keunggulan ini **belum tentu terpakai**.

### Catatan runtime image (kedua opsi)

Footprint sangat ringan: **4 binary ProjectDiscovery murni Go** (subfinder/httpx/naabu/nuclei) +
set template nuclei (termasuk WordPress/wordfence) + (untuk PDF) Chromium via Playwright **atau**
Typst. **Tanpa Ruby** (WordPress scan kini lewat nuclei). Jauh lebih kecil dari suite recon berat 30+ tool.

## Rekomendasi akhir

**Opsi 1 (Full-stack TypeScript)** - paling menopang kompleksitas nyata vacti (I/O + API + UI),
paling ringan & modern, CI terbaik, minim error, desain paling keren.
