# vacti - Feature Scope Checklist

> Cakupan fitur yang ditetapkan untuk VA + Threat Intel. Setiap fitur **esensial**
> dipetakan ke epic vacti + status keputusan (IKUT / SEDERHANAKAN / BUANG). Checklist ini adalah
> "kontrak cakupan" - tiap item IKUT/SEDERHANAKAN wajib punya task di epic terkait sebelum dianggap selesai.
>
> Legenda status: ✅ ikut penuh · 🟡 ikut tapi disederhanakan · ➕ baru/diperbaiki di vacti · ❌ dibuang.
> Kolom Epic: PF=platform-foundation · RE=recon-engine · TI=threat-intel · RP=reports · AI=api-and-integrations · UI=dashboard-ui.

---

## 1. Recon / Vulnerability Assessment

| #    | Fitur                                                                   | Status | Epic | Catatan                                                                                |
| ---- | ----------------------------------------------------------------------- | ------ | ---- | -------------------------------------------------------------------------------------- |
| 1.1  | Subdomain enum (subfinder)                                              | ✅     | RE   | Skippable bila predefined subs ada                                                     |
| 1.2  | Subdomain enum (amass, sublist3r, oneforall, ctfr, tlsx, netlas, chaos) | ❌     | -    | Berlebih → cukup subfinder                                                             |
| 1.3  | HTTP probe + tech detect (httpx)                                        | ✅     | RE   | Alive, status, title, tech, webserver, CDN/CNAME                                       |
| 1.4  | Port scan (naabu)                                                       | ✅     | RE   | exclude-cdn                                                                            |
| 1.5  | Port scan + NSE (nmap vulscan)                                          | ❌     | -    | Berat, dibuang                                                                         |
| 1.6  | Vuln scan (nuclei, per-severity, templates)                             | ✅     | RE   | Sumber temuan utama                                                                    |
| 1.7  | WordPress scan                                                          | 🟡➕   | RE   | **nuclei + template wordfence** (BUKAN wpscan Ruby), kondisional bila host = WordPress |
| 1.8  | Penanda WordPress (tech fingerprint + pola URL + tanda manual)          | ➕     | RE   | Pemicu langkah 1.7                                                                     |
| 1.9  | URL fetch/crawler (gospider, gau, waybackurls, hakrawler, katana) + GF  | ❌     | -    | Dibuang                                                                                |
| 1.10 | Dir/file fuzzing (ffuf)                                                 | ❌     | -    | Dibuang                                                                                |
| 1.11 | Scanner ekstra (dalfox, crlfuzz, s3scanner)                             | ❌     | -    | Dibuang                                                                                |
| 1.12 | Screenshot (EyeWitness/Selenium)                                        | ❌     | -    | Beban berat, dibuang                                                                   |
| 1.13 | WAF detect (wafw00f) / CMS (CMSeeK)                                     | ❌     | -    | Dibuang                                                                                |
| 1.14 | OSINT (theHarvester, GooFuzz, h8mail, metafinder)                       | ❌     | -    | Dibuang                                                                                |
| 1.15 | Pipeline orchestration (chain/group, paralel tahap)                     | 🟡     | RE   | pg-boss linear 5-tahap, bukan Celery chain/group berat                                 |
| 1.16 | Scan cancellation (revoke celery_ids)                                   | ✅➕   | RE   | AbortController + kill child-process                                                   |
| 1.17 | Idempotent completion (anti scan "stuck")                               | ✅     | RE   | Hardening anti-stuck → visibility timeout + idempoten                                  |
| 1.18 | Per-tool command + output capture (Command model)                       | ✅     | RE   | Audit tiap perintah                                                                    |
| 1.19 | Scan activity timeline (ScanActivity)                                   | ✅     | RE   | Progress granular                                                                      |
| 1.20 | Sub-scan (rescan sebagian)                                              | 🟡     | RE   | Versi ringkas                                                                          |

## 2. Threat Intelligence (DIPERTAHANKAN PENUH)

| #   | Fitur                                                                  | Status | Epic     | Catatan                                                                            |
| --- | ---------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------- |
| 2.1 | OTX AlienVault (pulses, reputation, malware, passive DNS, URL list)    | ✅     | TI       | Per domain + indikator                                                             |
| 2.2 | LeakCheck (tipe `domain` & `origin`/stealer-log)                       | ✅     | TI       | Kredensial bocor                                                                   |
| 2.3 | Status kredensial checked/unchecked (hash MD5, tanpa simpan plaintext) | ✅     | TI       | Insentif triase                                                                    |
| 2.4 | Manual Indicators (domain/subdomain/IP) + lookup OTX                   | ✅     | TI       |                                                                                    |
| 2.5 | Unified Risk Score (`calculate_risk_score`)                            | ✅     | TI       | 5-komponen (VA40/Leak30/Exposure12/Reputation10/Malware8) atau 4-komponen tanpa VA |
| 2.6 | Konsistensi skor dashboard = TI page = report                          | ✅     | TI/UI/RP | Success criteria terukur (±0)                                                      |
| 2.7 | Refresh flow + progress (ThreatIntelScanStatus)                        | 🟡     | TI       | Polling/SSE, refresh per-domain                                                    |
| 2.8 | Warna risiko (hijau/kuning/merah)                                      | ✅     | TI/UI    | 0-30 / 31-70 / 71-100                                                              |

## 3. Reports (DIDESAIN ULANG)

| #    | Fitur                                                                        | Status | Epic | Catatan                                                                       |
| ---- | ---------------------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------------------- |
| 3.1  | VA Report PDF                                                                | ✅➕   | RP   | Desain baru, ringkasan vuln + severity + temuan                               |
| 3.2  | Threat Intel Report PDF (cover, exec summary, IoC, CVE, breach, rekomendasi) | ✅➕   | RP   | Desain baru                                                                   |
| 3.3  | Dwibahasa EN/ID                                                              | ✅     | RP   |                                                                               |
| 3.4  | Branding per-project (logo, warna, no dok, klasifikasi, signatory)           | ✅     | RP   | `ThreatIntelReportSetting` → setting vacti                                    |
| 3.5  | Engine render                                                                | ➕     | RP   | **Playwright HTML/CSS → PDF** (alternatif Typst), bukan WeasyPrint            |
| 3.6  | Lembar pengesahan/signatory                                                  | ✅     | RP   |                                                                               |
| 3.7  | Logo perusahaan di cover (upload → data URL, fallback monogram)              | ✅➕   | RP   | Branding cover; tanda tangan signatory juga image (data URL)                  |
| 3.8  | Daftar isi (TOC) dwibahasa                                                   | ✅➕   | RP   | Nomor halaman dilewati (layout mengalir; perlu render 2-pass)                 |
| 3.9  | Komponen visual: donut severity, bar chart (per-severity/jenis/status HTTP)  | ✅➕   | RP   | CSS conic + bar; inventaris subdomain jadi tabel + status pill                |
| 3.10 | Ringkasan kerentanan (agregasi per-nama) + finding URL chips                 | ✅➕   | RP   | Finding di-agregasi per nama; daftar URL terdampak                            |
| 3.11 | Detail finding: CVSS, CVE ID, References                                     | ✅➕   | RP   | Ditangkap dari template nuclei (info.classification/reference) → migrasi 0009 |
| 3.12 | Executive summary custom (EN/ID) + placeholder, klasifikasi di cover         | ✅➕   | RP   | Toggle pakai custom; fallback auto-generate                                   |

## 4. Manajemen Project & Target

| #    | Fitur                                                       | Status | Epic  | Catatan                                                                                                                     |
| ---- | ----------------------------------------------------------- | ------ | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Project / workspace (multi-project, scoping `/<slug>/`)     | ✅     | PF    | Multi-project, single-tenant org v1                                                                                         |
| 4.2  | Target domain/organisasi                                    | ✅     | RE    |                                                                                                                             |
| 4.3  | Predefined subdomains                                       | ✅     | RE    | Memungkinkan skip subfinder                                                                                                 |
| 4.4  | Custom request headers                                      | ✅     | RE    |                                                                                                                             |
| 4.5  | Scan Engine/Config (YAML scan-profile, lusinan opsi)        | 🟡➕   | RE    | Profil + **config jsonb** (UA/tags/templates/rate/exclude-subs/extra-args); recon #010, [09-SCAN-CONFIG](09-SCAN-CONFIG.md) |
| 4.6  | Scan History (status, hasil per-scan)                       | ✅     | RE/UI |                                                                                                                             |
| 4.7  | Perbandingan antar-scan (diff)                              | 🟡     | RE/UI | Versi ringkas                                                                                                               |
| 4.8  | Scheduled Scans (Celery Beat)                               | 🟡     | RE    | Cron ringan via pg-boss, bukan celery-beat                                                                                  |
| 4.9  | Recon Notes / Todo per target                               | 🟡     | UI    | Opsional ringan                                                                                                             |
| 4.10 | WHOIS / domain-info kompleks (Netlas/ViewDNS/historical IP) | ❌     | -     | Opsional kecil bila perlu nanti                                                                                             |
| 4.11 | Universal search                                            | 🟡     | UI    |                                                                                                                             |
| 4.12 | Interesting keywords/lookup (admin, ftp, cpanel)            | 🟡     | RE    | Versi ringkas                                                                                                               |

## 5. Integrasi (WAJIB)

| #   | Fitur                                                               | Status | Epic  | Catatan                                                                                                                                          |
| --- | ------------------------------------------------------------------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | Notifications webhook (Discord, Slack, Telegram, Google Chat, Lark) | ✅     | AI    | Per-event; **Discord rich embed + Google Chat cardsV2** (2026-06-05)                                                                             |
| 5.2 | AI enrichment vuln (description/impact/remediation)                 | ✅     | AI    | Hasil di-cache                                                                                                                                   |
| 5.3 | AI executive summary report                                         | ✅     | AI    |                                                                                                                                                  |
| 5.4 | AI threat analysis/ringkasan                                        | ✅     | AI    |                                                                                                                                                  |
| 5.5 | Provider AI                                                         | ➕     | AI    | **Vercel AI SDK**: OpenAI default + Ollama; per-proyek **Base URL** opsional + system-default provider/key |
| 5.6 | API Key Vault (OTX, LeakCheck, AI) terenkripsi                      | ✅     | AI/PF | Enkripsi at-rest                                                                                                                                 |
| 5.7 | HackerOne / Bug bounty sync-import-submit                           | ❌     | -     | Dibuang                                                                                                                                          |

## 6. API (WAJIB - warga kelas satu)

| #   | Fitur                                                                                         | Status | Epic  | Catatan                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | REST API semua resource (project/target/scan/subdomain/endpoint/port/vuln/TI/report/settings) | ✅➕   | AI    | typed                                                                                                                                                    |
| 6.2 | OpenAPI terdokumentasi                                                                        | ✅➕   | AI    | Redoc `/api/docs` + `/api/openapi.json`; **ditaut in-app** (Settings → API Tokens). API-first: parity REST penuh + schema req/resp lengkap (in progress) |
| 6.3 | Auth session + API token                                                                      | ✅     | PF/AI | Token utk otomasi/CI eksternal                                                                                                                           |
| 6.4 | RBAC (SysAdmin / PenetrationTester / Auditor)                                                 | ✅     | PF    | Permission: modify_system_config, modify_scan_config, modify_scan_results, modify_report, initiate_scans, modify_targets                                 |
| 6.5 | Realtime progress (SSE/WebSocket)                                                             | ✅     | RE/AI | SSE                                                                                                                                                      |
| 6.6 | Datatables server-side (operator `= & \| > < !`)                                              | ✅     | UI/AI | Server-side pagination (scans `?limit/offset/total`)                                                                                                     |
| 6.7 | Mind-map visualisasi                                                                          | ❌     | -     | Dibuang (nice-to-have)                                                                                                                                   |

## 7. Dashboard & UI

| #   | Fitur                                                       | Status | Epic | Catatan                           |
| --- | ----------------------------------------------------------- | ------ | ---- | --------------------------------- |
| 7.1 | Dashboard ringkasan (counts target/subdomain/endpoint/vuln) | ✅     | UI   |                                   |
| 7.2 | Severity breakdown + tren 7 hari                            | ✅     | UI   |                                   |
| 7.3 | Kartu Threat Intel + risk score                             | ✅     | UI   |                                   |
| 7.4 | IoC/CVE/leak analytics                                      | ✅     | UI   |                                   |
| 7.5 | Charts                                                      | ➕     | UI   | Recharts/Visx (bukan ApexCharts)  |
| 7.6 | Dark mode + WCAG AA                                         | ➕     | UI   | Desain baru shadcn/ui             |
| 7.7 | Onboarding                                                  | ✅     | UI   | Dashboard "Get started" checklist |

## 8. Platform / Infra (fondasi)

| #    | Aspek                                                     | Status | Epic  | Catatan                                                                               |
| ---- | --------------------------------------------------------- | ------ | ----- | ------------------------------------------------------------------------------------- |
| 8.1  | Multi-service (Nginx/Django/Redis/Celery/Ollama/certs)    | 🟡     | PF    | Diringkas → app + worker + Postgres                                                   |
| 8.2  | Queue/broker (Redis + Celery 5 worker autoscale)          | ➕     | PF/RE | **pg-boss** di Postgres, TANPA Redis                                                  |
| 8.3  | DB (PostgreSQL)                                           | ✅     | PF    | + Drizzle ORM + drizzle-kit migrasi                                                   |
| 8.4  | RBAC (django-role-permissions)                            | ✅     | PF    | RBAC TS sendiri                                                                       |
| 8.5  | Settings/env (DOMAIN, POSTGRES, API keys)                 | ✅     | PF    | Hanya `.env.example`; secret-guard hook                                               |
| 8.6  | install.sh/update.sh/Makefile                             | 🟡     | PF    | docker compose up + drizzle migrate                                                   |
| 8.7  | CI (build multi-arch, CodeQL, auto-release, pages)        | ➕     | PF    | GitHub Actions dynamic-detection + reusable, typecheck/lint/unit/integration/e2e gate |
| 8.8  | Husky pre-commit lint-staged + commit-msg commitlint      | ✅➕   | PF    | + pre-push gate + git-identity + no-`.env` guard (3-stage)                             |
| 8.9  | Docs                                                      | ➕     | PF    | Model Diátaxis                                                                        |
| 8.10 | Fixtures (default scan engines, external tools, keywords) | ✅     | PF/RE | `npm run db:seed` - Quick/Standard/Deep profiles + keyword list                       |

---

## 9. Passive Recon & Exposure (➕ baru - studi referensi passive-recon, 2026-06-06)

Sumber: **an OSINT reference design**. Semua engine = OSINT **pasif** (HTTP API), bukan
scanner aktif → tidak menambah biner & tidak melanggar set tool aktif. Spec penuh:
[11-PASSIVE-RECON-AND-EXPOSURE.md](11-PASSIVE-RECON-AND-EXPOSURE.md). Status: sebagian besar **SUDAH
diimplementasikan** (2026-06-07); sisa 9.9-9.11 belum.

| #    | Fitur (ex-referensi passive-recon)                                        | Status | Modul   | Catatan                                                                                                                                     |
| ---- | --------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1  | Passive subdomain (VirusTotal passive DNS)                | ✅➕   | RE      | Mode scan `passive`/`full`; `runPassiveScan`                                                                                                |
| 9.2  | Passive archived-URL (Wayback CDX)                        | ✅➕   | RE      | Arsip pasif (1 API call), **bukan** crawler - merevisi 1.9; `matchType=domain` → cakup domain **+ semua subdomain** (VT sudah harvest subs) |
| 9.3  | VT undetected-URLs (+tanggal) → DiscoveredUrl             | ✅➕   | RE      | `discovered_urls` + `external_seen_at`                                                                                                      |
| 9.4  | Passive DNS / IP resolution history (origin di balik WAF) | ✅➕   | RE/TI   | `ip_resolutions` + sightings; IP directory (VT + URLScan)                                                                                   |
| 9.5  | Exposure findings (regex secret detection, pure-TS)       | ✅➕   | RE(+TI) | 23 aturan; mengisi komponen **Exposure** risk score; cross-link LeakCheck                                                                   |
| 9.6  | Content analysis / kategori file by-ekstensi (editable)   | ✅➕   | RE      | 8 kategori auto-seed; `extension_categories`/suffix rules                                                                                   |
| 9.7  | Endpoint/parameter discovery (turunan analisis URL)       | ✅➕   | RE      | `analyzeEndpoints` → kartu Attack Surface                                                                                                   |
| 9.8  | Deep-fetch konten (opt-in) + **SSRF guard wajib**         | ✅➕   | RE      | `scans.deep_scan`; body→exposure source=body; size-capped                                                                                   |
| 9.9  | Multi-key rotation + kuota + backoff                      | ✅➕   | PF      | Postgres rotator (round-robin/quota/backoff) + per-subdomain VT enrichment                                                                  |
| 9.10 | SOCKS proxy (global + per-key) untuk OSINT/deep-fetch     | ✅➕   | PF      | `PROXY_URL` http(s)/socks via undici dispatcher (worker)                                                                                    |
| 9.11 | Scan diff diperluas (finding + IP + arsip)                | ✅➕   | RE      | `first_scan_id` → "new in scan" diff di Attack Surface                                                                                      |
| 9.12 | Export CSV/ZIP hasil scan                                 | ✅➕   | RE/UI   | Route `/surface/export`; zip writer pure-TS tanpa dep                                                                                       |
| 9.13 | Dashboard discovery-over-time + by-source                 | ✅     | UI      | Chart "URL discovery · last 14 days"                                                                                                        |
| 9.14 | Engine URLScan.io (ketiga)                                | ✅     | RE/TI   | Keyless/with-key; URL + IP (IP directory jalan tanpa VT key)                                                                                |
| 9.x  | Redis/BullMQ + rotator Redis + posture "no-auth"          | ❌     | -       | Bertentangan prinsip ringan/security → pakai pg-boss+Postgres, tetap RBAC                                                                   |

**SUDAH dikirim (2026-06-07):** 9.1-9.8, 9.12, 9.13, 9.14 - engine VT/Wayback/URLScan, exposure
regex (23 aturan), kategori file, endpoint/param, deep-fetch (SSRF-guarded), export CSV/ZIP, chart
discovery. 41 unit test recon + e2e 34 hijau; diverifikasi live.
**SELESAI SEMUA (2026-06-07):** 9.9 (rotator Postgres + per-sub VT), 9.10 (proxy http/socks via
undici), 9.11 (scan-diff `first_scan_id`) kini terkirim juga. Seluruh section 9 ✅.

---

## 10. Management CRUD completeness (2026-06-07)

Setiap resource harus punya **CRUD lengkap** lewat UI + API (API-first), dengan RBAC server-side,
audit, konfirmasi untuk destructive action, dan cascade delete yang benar. Audit menemukan banyak
"create-only" - dilengkapi di sesi ini.

| #     | Resource                         | Create      | Read | Update                | Delete | Catatan                                                                                                   |
| ----- | -------------------------------- | ----------- | ---- | --------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 10.1  | User                             | ✅➕ (baru) | ✅   | ✅➕ (role/pass)      | ✅➕   | Add user (email/pass/role) + delete; admin **reset password user lain**; guard last-SysAdmin & self       |
| 10.2  | Project                          | ✅          | ✅   | ✅➕ (rename)         | ✅➕   | Edit nama/sektor/slug; **default project** (tampil saat login); delete cascade (targets/scans/TI/passive) |
| 10.3  | Target                           | ✅          | ✅   | ✅➕                  | ✅➕   | Edit domain/headers/predefined-subs; delete cascade (scans + hasil)                                       |
| 10.4  | Scan                             | ✅          | ✅   | ✅ (cancel/status)    | ✅➕   | Delete cascade (subdomain/endpoint/port/vuln/activity)                                                    |
| 10.5  | Finding (vuln)                   | (scan)      | ✅   | ✅➕ (status/AI/note) | ✅➕   | Status + **analyst note** (RBAC-gated, audited); delete satuan                                            |
| 10.6  | Leaked credential                | (TI)        | ✅   | ✅ (status)           | ✅➕   | Delete satuan                                                                                             |
| 10.7  | Exposure finding                 | (passive)   | ✅   | ✅➕ (status/note)    | ✅➕   | Status + **analyst note** (RBAC-gated, audited); delete satuan                                            |
| 10.8  | Manual indicator                 | ✅          | ✅   | ✅➕                  | ✅➕   | Edit + delete via web (API sudah ada)                                                                     |
| 10.9  | Scan profile                     | ✅          | ✅   | ✅➕                  | ✅     | Edit nama/config (UA/tags/templates/rate/keywords)                                                        |
| 10.10 | Webhook/Token/Signatory/Schedule | ✅          | ✅   | ✅➕                  | ✅     | Edit webhook, signatory, schedule (cron/profile/enabled); token rotate/delete                             |
| 10.11 | Recon note (per target)          | ✅          | ✅   | ✅➕                  | ✅     | Edit + delete catatan/TODO target                                                                         |

Aturan destructive action: RBAC server-side, konfirmasi di UI
(`ConfirmButton`), `recordAudit`, cascade FK `onDelete`, dan jangan biarkan UI/API "create-only".

**Update/Edit lengkap (2026-06-08).** Audit "create+delete-only" ditutup - **Update penuh** kini ada
untuk: project (nama/sektor/slug), target (domain/headers/predefined-subs), scan profile, schedule
(cron/profil/enabled), webhook, manual indicator, report signatory, dan recon note.

**Account self-service (Settings → Account).** User bisa ganti **password & email** sendiri + **sign
out of all devices** (revoke seluruh sesi). Admin: tambah/hapus user, ubah role, dan **reset password
user lain**.

**Pagination server-side** pada daftar **Projects** + **Targets** (limit/offset di SQL, `?ppage=`).

---

## 11. Triage table UX (2026-06-08)

Setiap tabel triase punya alat triase massal yang konsisten. Berlaku untuk: **findings (vuln),
leaked credentials, sector news, brand news, exposure**.

| #    | Kemampuan                      | Status | Modul | Catatan                                                           |
| ---- | ------------------------------ | ------ | ----- | ----------------------------------------------------------------- |
| 11.1 | Pencarian teks                 | ✅➕   | UI    | Filter cepat per-tabel                                            |
| 11.2 | Multi-select (checkbox) + bulk | ✅➕   | UI    | Pilih banyak baris → **"apply to selected"** (ubah status massal) |
| 11.3 | Ubah status per-baris instan   | ✅➕   | UI    | Auto-submit `<select>` (tanpa tombol Set)                         |
| 11.4 | Filter status + pagination     | ✅➕   | UI    | Filter status + limit/offset SQL                                  |

---

## Ringkasan keputusan

- **IKUT/SEDERHANAKAN/BARU (wajib ada task):** seluruh baris ✅ 🟡 ➕ di atas.
- **ROADMAP (➕🔭, belum jadi task v1):** seluruh baris seksi 9 (passive recon & exposure).
- **DIBUANG (tidak boleh muncul sebagai task v1):** 1.2, 1.5, 1.10-1.14, 4.10, 5.7, 6.7, 9.x.
  Catatan: **1.9 direvisi** - discovery URL **pasif** (Wayback/VT) kini MASUK via 9.2/9.3; yang tetap
  dibuang hanya **crawler aktif** (gospider/hakrawler/katana).
- Setiap epic harus menutup baris yang dipetakan ke kodenya. Definition-of-done epic = semua baris
  IKUT/SEDERHANAKAN miliknya punya task + lulus CI gate.

## Addendum - Finding status (2026-06-04)

- ➕ **VA finding status** (RE): each vulnerability has a triage status (Open / On Progress / Resolved /
  Risk Accepted / False Positive / No Impact / WAF Handled / Duplicate / Out of Scope / Reopened);
  only active statuses feed the risk score.
- ➕ **Leak finding status** (TI): LeakCheck findings have a status (New / Investigating / Confirmed /
  Remediated / False Positive / Ignored), replacing the checked toggle. Status applies to leaks only.
- Full spec: [05-FINDING-STATUS.md](05-FINDING-STATUS.md).

## Addendum - Report parity selesai (2026-06-04)

Hasil audit ulang menyeluruh template/model/form report vacti (cover, TOC, lembar pengesahan,
ringkasan kerentanan, branding per-proyek, signatory). Semua komponen sudah ada di vacti:

- ➕ Cover navy bertekstur + **logo** (data URL, fallback monogram) + klasifikasi di pill.
- ➕ **Daftar isi** dwibahasa; eyebrow + section bernomor; **dwibahasa (ID/EN)** di semua
  judul/minihead/label/stat/TOC.
- ➕ Blok **Klasifikasi Dokumen** + note RAHASIA/CONFIDENTIAL; note "Tentang Penilaian".
- ➕ **Donut** severity + **bar chart** (per-severity / per-jenis / subdomain per-status HTTP).
- ➕ **Inventaris subdomain** sebagai tabel + **status pill** HTTP (join subdomain ↔ status endpoint).
- ➕ **Ringkasan kerentanan** (agregasi per-nama: nama | jumlah | tingkat).
- ➕ **Finding** di-agregasi per nama + **URL terdampak** (chips) + tag jumlah/jenis/status.
- ➕ Detail finding **CVSS / CVE / References** - ditangkap dari template nuclei
  (`info.classification`, `info.reference`); deskripsi/remediasi template jadi fallback non-AI.
- ➕ **Tanda tangan** (signature image) per signatory di lembar pengesahan.
- ➕ **Executive summary custom** (EN/ID) dengan placeholder (`{company_name}`, `{target_name}`,
  `{vulnerability_count}`, `{critical_count}`, `{active_count}`, `{scan_date}`, dll).
- Migrasi DB: 0007 (default teal/navy), 0008 (logo/signature/exec-summary), 0009 (cvss/cve/refs).
- Catatan: nomor halaman TOC dilewati (layout mengalir untuk data dinamis; butuh render 2-pass).

## Addendum - Status implementasi & sisa gap (2026-06-04)

Checklist di atas adalah **kontrak cakupan** (keputusan IKUT/SEDERHANAKAN/BUANG), bukan status build.
Berikut status **implementasi nyata** hasil audit kode. Baris ✅ = sudah jalan; ⬜ = belum dibangun.

### Sudah terimplementasi (✅)

- Recon penuh: subfinder → httpx → naabu → nuclei + WordPress kondisional; idempotent completion;
  Command capture; ScanActivity timeline + SSE; predefined subs; scan profiles.
- Threat Intel penuh: OTX, LeakCheck, manual indicators, `computeProjectRisk` (konsisten
  dashboard/TI/report), refresh + progress, leak finding status, VA finding status.
- Reports: VA + TI PDF lengkap (lihat addendum di atas).
- Integrasi: webhook 5 kanal (Discord/Slack/Telegram/Google Chat/generic) + per-event + UI;
  AI enrichment vuln (cache `ai_cache`) + UI; AI provider abstraction (Vercel AI SDK
  OpenAI/Ollama) + UI; API key vault terenkripsi AES-256-GCM (`libs/auth/vault.ts`).
- API: Hono REST semua resource + OpenAPI (`/api/docs`) + token API (`vct_`) + UI token; SSE.
- Auth: session cookie + API token; password hashing **argon2id** (scrypt hashes auto-upgrade on login).
- UI: dashboard (counts/severity/tren + analytics), TI page, charts (recharts), dark mode,
  settings (tokens/integrations/reports).

### Backlog v1 - STATUS 2026-06-05: ALL COMPLETE ✅

The G1-G17 backlog below (catalogued 2026-06-04) is now **fully shipped & CI-green** - see the
completion table in [06-GAP-ANALYSIS.md §J](06-GAP-ANALYSIS.md). The table is kept for historical
mapping (gap → epic/task). Only items explicitly out of v1 remain deferred (proxy, multi-org, WHOIS,
in-app feed).

| #   | Gap                               | Epic  | Catatan / rencana                                                                                                                                |
| --- | --------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **RBAC enforcement server-side**  | PF    | Role + matrix permission sudah ada (`libs/core/rbac.ts`) tapi BELUM dienforce di API/web. Auditor read-only belum aktif. **Prioritas keamanan.** |
| G2  | **Scan cancellation UI + API**    | RE    | Backend AbortSignal + kill sudah ada; belum ada route `POST /scans/:id/cancel` + tombol UI                                                       |
| G3  | **Scheduled scans (cron)**        | RE    | Belum ada tabel jadwal + dispatcher pg-boss cron + UI                                                                                            |
| G4  | **Scan diff/perbandingan**        | RE/UI | Bandingkan 2 scan (endpoint/port/vuln baru-hilang) - belum ada                                                                                   |
| G5  | **Sub-scan / rescan sebagian**    | RE    | Jalankan ulang subset tahap - belum ada                                                                                                          |
| G6  | **API key vault UI (per-proyek)** | AI/PF | Enkripsi + tabel `apiKeys` ada, tapi OTX/LeakCheck/AI masih dari `.env`; belum ada UI kelola key per-proyek                                      |
| G7  | **AI executive summary (auto)**   | AI    | Saat ini exec summary manual/template; belum ada generate AI otomatis                                                                            |
| G8  | **AI threat analysis (narasi)**   | AI    | Risk score algoritmik sudah ada; narasi/ringkasan TI berbasis LLM belum                                                                          |
| G9  | **argon2id password hashing**     | PF    | Sekarang scrypt (portabel sementara); target produksi argon2id                                                                                   |
| G10 | **Audit log tulis + viewer**      | PF    | Tabel `auditLog` ada tapi tidak pernah ditulis & tak ada UI                                                                                      |
| G11 | **Datatables server-side**        | UI/AI | Filter/sort/paginate server-side; sekarang fetch penuh                                                                                           |
| G12 | **Custom request headers**        | RE    | Kolom `targets.customHeaders` ada tapi belum disuntik ke httpx                                                                                   |
| G13 | **Universal search**              | UI    | Pencarian global lintas resource - belum ada                                                                                                     |
| G14 | **Recon notes/todo per target**   | UI    | Catatan per target - belum ada                                                                                                                   |
| G15 | **Interesting keywords/lookup**   | RE    | Penanda endpoint menarik (admin/ftp/cpanel) - belum ada                                                                                          |
| G16 | **Seed/fixtures**                 | PF/RE | Profil scan default + keyword sebagai seed - belum ada (DEFAULT_PROFILE hardcoded di worker)                                                     |
| G17 | **Onboarding ringkas**            | UI    | Walkthrough awal - belum ada                                                                                                                     |

**Urutan saran:** G1 (RBAC, keamanan) → G2 (scan cancel UI) → G3 (scheduled) → G6 (key vault UI) →
G4/G5 (diff/sub-scan) → sisanya. Proxy support & multi-org tetap di luar v1.

## Addendum - Integrasi, dokumentasi & output-QA (2026-06-05)

- ➕ **Google Chat** notifikasi naik dari teks polos ke **cardsV2** (header + dot severity, widget
  key/value, tombol View) + fallback teks; Discord sudah rich embed. Lihat
  [08-INTEGRATIONS-DOCS-OUTPUT-QA.md](08-INTEGRATIONS-DOCS-OUTPUT-QA.md).
- ➕ **OpenAPI lengkap**: securityScheme bearer + semua 23 endpoint (cancel/diff/schedules/search/leak
  toggle/deletes/pagination) + schema request/response + 401/403/404; Redoc di `/api/docs`.
- ➕ **README GitHub** ditulis ulang (fitur, quickstart+env, contoh API curl, route report, testing, deploy).
- ✅ **Output-QA**: scan nyata ke **testfire.net** (target uji terotorisasi) → report VA PDF dirender →
  paginasi/komponen diperiksa per-halaman (pdftoppm) + alur diuji Playwright.

## Addendum - Triase, berita sektor & batch paralel (2026-06-05)

Lanjutan threat-intel + finding-triage; lima fitur dikerjakan paralel lalu diverifikasi & commit
terpisah (typecheck 12/12, lint, unit 9 proyek, e2e 22/22 hijau).

- ➕ **Berita keamanan sektor** (RSS bebas-API-key + filter keyword per sektor) di kartu TI **dan**
  section report; tiap headline punya **status triase** (preserved lintas refresh via upsert). Lihat
  [10-SECTOR-THREAT-NEWS.md](10-SECTOR-THREAT-NEWS.md).
- ➕ **Feed lokal Indonesia**: Google News (ID), CNN Indonesia Teknologi, detikInet + keyword
  bahasa Indonesia per sektor (perbankan/keuangan/penipuan/bocor/…).
- ➕ **Review toggle 1-klik** + **filter status** + **bulk "mark all reviewed"** untuk tiap finding
  bertstatus (VA vuln, leak, berita) - lihat [05-FINDING-STATUS.md](05-FINDING-STATUS.md) §4.
- ✅ **G11 (sebagian) pagination server-side**: tabel leaks (filter+limit/offset di SQL) & vuln
  (in-memory, set penuh dipakai diff) + komponen `<Pagination>`; daftar scans sudah paginated. Tab
  scan kini URL-driven (`?tab=`) agar filter/paging tidak melempar balik ke tab awal.
- ✅ **G16 seed/keywords**: profil default (Quick/Standard/Deep) kini membawa `interestingKeywords`
  di config dan **dipakai** pipeline httpx (fallback ke default bila kosong); seed backfill config
  ke preset lama tanpa menimpa kustomisasi.
- ➕ **Notifikasi otomatis**: event `vuln.found` (high/critical saat scan selesai) & `ti.refreshed`
  (delta leak baru) lewat webhook per-proyek (Telegram/Discord/Google Chat/Slack).

## Addendum - News triage, AI relevance & AI gateway (2026-06-08)

Lanjutan threat-intel news (extends §2 + addendum 2026-06-05) dan AI provider (extends §5.5).

- ➕ **News cap** newest **15** per sektor/proyek (`NEWS_CAP`); **auto-refresh harian 09:00 WIB**
  (worker cron `0 2 * * *` UTC). "Search now" / "Apply sector" minta **konfirmasi** sebelum
  mengganti set berita.
- ➕ **AI relevance triage** ("AI: filter irrelevant") untuk sector + brand news - **belajar** dari
  tanda Irrelevant/Relevant analis.
- ➕ Label status **"Dismissed" → "Irrelevant"** (nilai DB `dismissed` tetap, tanpa migrasi).
- ➕ **Brand monitoring**: brand query kustom **dipersist** + "Search now" on-demand; render dari DB
  (tanpa fetch saat render).
- ➕ **AI Base URL** (§5.5): per-proyek opsional → arahkan ke gateway kompatibel OpenAI
  (provider/key tidak berubah).

## Addendum - Performance, reliability & docs discoverability (2026-06-08)

Penegasan prinsip **reliable, light & fast** di tingkat build/runtime, plus
penemuan dokumentasi/API.

- ✅ **Production build di bawah supervisor self-healing** - app live jalan `next start` (BUKAN
  `next dev`); worker self-heal juga (auto-restart + backoff). Lihat [how-to/deploy](../how-to/deploy.md).
- ✅ **Navigasi instan**: layout shell persisten (app + settings) + boundary `loading.tsx` + `next/link`
  (client nav + prefetch).
- ✅ **Kerja minimum per-request**: **indeks DB** di kolom FK/filter panas; filter/paginate/agregat
  **sisi SQL** (tren dashboard, join schedules/audit); `cache()` per-request untuk `getCurrentUser`;
  fetch eksternal di-capped + paralel (`Promise.all`).
- ➕ **Docs discoverability**: API reference (`/api/docs` Redoc + `/api/openapi.json`) ditaut in-app
  (Settings → API Tokens); [docs/tutorials/getting-started.md](../tutorials/getting-started.md)
  adalah panduan pemakaian penuh.
