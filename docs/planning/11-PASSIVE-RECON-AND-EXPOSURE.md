# vacti - Passive Recon & Exposure Discovery

> Desain modul passive reconnaissance & attack-surface vacti berbasis **VirusTotal** + **Wayback Machine**.
> Dokumen ini memetakan kapabilitas ke modul vacti (mayoritas **VA**, beberapa **CTI**),
> memutuskan mana yang MASUK / DIADAPTASI / DIBUANG, dan menjaga prinsip ringan vacti
> (pg-boss, tanpa Redis, tanpa binary berat baru). Semua engine baru = **HTTP API pasif**, bukan
> scanner aktif - jadi tidak melanggar set tool aktif yang dibekukan (subfinder/httpx/naabu/nuclei).

Referensi metodologi: Urwah Atiyat (OrwaGodFather) - "Art of VirusTotal Hacking", "Essence of Recon".
Kasus nyata yang ditangani: origin IP di balik WAF, dokumen sensitif publik (paspor/KTP), arsip
backup terlupakan (`backup.7z`), URL reset-password yang masih valid.

---

## 1. Apa yang referensi passive-recon lakukan (ringkas)

| Kapabilitas referensi passive-recon                         | Sumber data                                             | Inti teknis                                                                                   |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Asset discovery (subdomain, URL, IP, arsip) | VirusTotal v2 domain report + Wayback CDX               | `subdomains`, `domain_siblings`, `undetected_urls` (+tanggal), passive-DNS `resolutions`      |
| Passive DNS / IP history                    | VirusTotal resolutions                                  | timeline hostname↔IP per IP; agregasi lintas-scan → temukan **origin di balik WAF**           |
| Exposure findings                           | regex atas URL string + (opsional) response body        | AWS/GCP/GitHub/Slack/Stripe key, JWT, private key, DB-URL, basic-auth URL, combo-list/stealer |
| Content analysis                            | ekstensi pathname → kategori                            | dokumen/arsip/backup/config/binary; aturan suffix yang dapat diubah analis                    |
| Deep scan (opsional)                        | fetch konten URL                                        | SSRF-guard + SOCKS proxy + rotasi; body dipindai regex; konten disimpan (size-capped)         |
| Scan comparison                             | diff antar-scan                                         | subdomain/URL/IP/arsip/finding baru                                                           |
| Infra                                       | Prisma + Postgres + **Redis/BullMQ** + rotator kunci VT | multi-key VT round-robin + backoff + kuota harian/mingguan/bulanan; export CSV/ZIP            |

Fase pipeline referensi passive-recon: `T1_APEX → T2_SUBDOMAINS → T3_WAYBACK_APEX → T4_WAYBACK_SUBDOMAINS →
T5_CONSOLIDATE → T6_ANALYSIS`.

---

## 2. Keputusan pemetaan (apa yang ditambahkan ke vacti)

Legenda: ✅ MASUK · 🔧 DIADAPTASI (agar ringan) · 🔭 ROADMAP (v-berikutnya) · ❌ TIDAK.

| #   | Fitur referensi passive-recon                                  | Modul vacti | Verdict | Catatan kebijakan                                                                         |
| --- | ---------------------------------------------- | ----------- | ------- | ----------------------------------------------------------------------------------------- |
| P1  | Passive subdomain discovery (VirusTotal)       | VA / recon  | ✅      | Sumber OSINT pasif baru; melengkapi subfinder (bukan menggantikan)                        |
| P2  | Passive archived-URL discovery (Wayback CDX)   | VA / recon  | ✅🔧    | Arsip pasif **bukan crawler** (revisi pengecualian 1.9) - 1 panggilan API, ringan         |
| P3  | Passive DNS / IP resolution history            | VA + CTI    | ✅      | Origin-behind-WAF; nyambung ke OTX passive DNS (CTI)                                      |
| P4  | Exposure findings (regex secret detection)     | VA (+CTI)   | ✅      | Pure-TS, mengisi komponen **Exposure** di Unified Risk Score                              |
| P5  | Content analysis / kategori file by-extension  | VA          | ✅      | Aturan suffix yang dapat diubah; menyorot backup/dokumen/secret files                     |
| P6  | Endpoint/parameter discovery                   | VA          | ✅🔧    | Turunan analisis URL (param, path auth-related) - subset ringan                           |
| P7  | Deep-fetch konten (opt-in) + SSRF guard        | VA          | ✅🔧    | **Wajib** SSRF-guard + opt-in + cap ukuran; proxy SOCKS opsional                          |
| P8  | Multi-key rotation + kuota + backoff           | platform    | ✅🔧    | **Di Postgres, BUKAN Redis** (kolom `next_available_at`, counter harian/mingguan/bulanan) |
| P9  | SOCKS proxy (global + per-key) untuk OSINT     | platform    | ✅      | Untuk lalu lintas API/deep-fetch yang harus lewat proxy                                   |
| P10 | Scan diff diperluas (finding + IP + arsip)     | VA          | ✅      | vacti sudah punya `diffScans`; tambah dimensi                                             |
| P11 | Export CSV/ZIP hasil scan                      | VA/UI       | ✅      | Pelengkap report PDF (data mentah untuk analis)                                           |
| P12 | Dashboard "discovery over time" + by-source    | UI          | 🔭      | Analitik tambahan; setelah model data ada                                                 |
| P13 | URLScan.io sebagai engine ketiga               | VA/CTI      | 🔭      | Enum sudah ada di referensi passive-recon; tambah setelah VT+Wayback stabil                               |
| -   | Redis/BullMQ, rotator berbasis Redis           | infra       | ❌      | Bertentangan dgn prinsip ringan → pakai pg-boss + Postgres                                |
| -   | "No auth / not for production" posture referensi passive-recon | -           | ❌      | vacti tetap RBAC + auth (prinsip Security-first)                                          |

---

## 3. Spesifikasi fitur yang MASUK

### 3.1 Engine OSINT pasif (P1-P3) - `@vacti/recon` + `@vacti/threat-intel`

Engine = **klien HTTP API**, di-`exec` bukan biner - tidak menambah footprint image.

- **VirusTotal v2 domain report** (`/vtapi/v2/domain/report`): panen
  - `subdomains` + `domain_siblings` + subdomain yang diturunkan dari `undetected_urls`,
  - `undetected_urls` (URL + tanggal) → kandidat `DiscoveredUrl`,
  - `resolutions` (ip_address + last_resolved) → passive-DNS IP history.
- **Wayback CDX** (`web.archive.org/cdx/search/cdx?url=<domain>/*&collapse=urlkey&fl=original`):
  daftar URL arsip; retry 503 dengan backoff; **timeout besar + stream** (dataset bisa besar).
- Subdomain pasif **digabung** ke pipeline aktif: hasil VT/Wayback menambah daftar host sebelum
  httpx/naabu/nuclei (atau berdiri sendiri sebagai "passive-only scan" tanpa biner).

**Mode scan baru:** `passive` (hanya OSINT, tanpa biner - cepat & aman untuk recon awal),
selain `active` (pipeline biner) dan `full` (passive → feed → active).

### 3.2 Exposure findings - regex secret detection (P4) - `@vacti/recon` (lib pure-TS)

Port langsung ruleset referensi passive-recon (`lib/regex-analysis.ts`) sebagai modul TS murni:

- **Aturan** (type → regex, dgn prefilter keyword untuk kecepatan, prioritas untuk klaim overlap):
  `aws-key`, `gcp-service-account`, `github-token`, `gitlab-token`, `google-api-key`, `openai-key`,
  `slack-bot/user-token`, `slack-webhook`, `stripe-key`, `twilio-key`, `sendgrid-key`,
  `private-key`, `jwt-token`, `db-connection`, `azure-sas-token`, `basic-auth-url`,
  `bearer-token`, `combo-list-cred` (stealer log URL:user:pass), `credit-card`, `email`,
  `credential-like`, `hex-secret`.
- **Sumber finding**: `URL_STRING` (atas URL yang ditemukan) dan `RESPONSE_BODY` (bila deep-fetch).
- **Customizable**: aturan tersimpan/aktif-nonaktif di settings (analis bisa menambah pola).
- **Anti-overlap**: aturan spesifik (priority rendah-angka) mengklaim rentang dulu; generik tak
  menimpa. Prefilter `text.includes(keyword)` agar regex berat di-skip → cepat untuk jutaan URL.
- **Snippet di-cap** (240 char), **diperlakukan rahasia** (lihat §6).

> Integrasi nilai: finding ini mengisi komponen **Exposure** pada Unified Risk Score (sudah ada
> "Exposure 12" di skema skor) dan `combo-list-cred`/email beririsan dengan **LeakCheck** (CTI) →
> di-cross-link, bukan diduplikasi.

### 3.3 Content analysis / kategori file (P5) - `@vacti/recon`

- Ekstrak ekstensi dari **pathname** (abaikan query/hash).
- `extension_category` (slug, displayName, icon) + `extension_suffix_rule` (suffix → kategori),
  di-seed default: documents, spreadsheets, archives, **backups** (`.bak/.7z/.tar.gz/.sql`),
  configs (`.env/.yml/.ini`), keys (`.pem/.key`), db-dumps, binaries, source.
- URL yang ditemukan ditandai kategorinya → halaman "Findings/Content" bisa difilter per kategori
  (mis. tampilkan semua kandidat backup/secret-file dalam attack surface).

### 3.4 Deep-fetch (P7) + SSRF guard - opsional, aman-by-default

- **Opt-in** per scan (dan opsional dibatasi ke kategori tertentu, mis. hanya config/backup).
- **Wajib** lewat `assertUrlSafeForServerFetch` (port SSRF-guard referensi passive-recon): tolak skema non-http(s),
  `localhost`/`.local`/metadata `169.254.169.254`, IPv4/IPv6 privat/reserved.
- Body di-cap ukuran, disimpan (storage key + content length), lalu dipindai regex (§3.2).
- Proxy SOCKS opsional (P9). Rate-limit + cancellation mengikuti pipeline (AbortController).

### 3.5 Rotation/kuota/backoff (P8) - **Postgres, bukan Redis**

referensi passive-recon memakai Redis untuk backoff + kuota. vacti mengadaptasi ke Postgres agar tetap 3 service:

- `api_keys` (vault) diperluas: `provider`, `usage_count_*` (daily/weekly/monthly + reset key
  tanggal/minggu/bulan), `is_disabled`, `next_available_at` (backoff), `last_used_at`.
- Rotator: pilih kunci aktif `next_available_at <= now()` (round-robin), pada 403/429/5xx set
  `next_available_at = now()+15s`. Tanpa broker eksternal.

### 3.6 Scan diff diperluas (P10) & Export (P11)

- `diffScans` (sudah ada) ditambah dimensi: **findings**, **IP resolutions**, **archived URLs**.
- Export **CSV** per resource (subdomains/urls/findings/ips) + **ZIP** bundel - pelengkap PDF.

---

## 4. Penambahan model data (gaya Drizzle vacti)

Mengikuti pola schema vacti (snake_case kolom, uuid id). Ringkas:

- `passive_sources` enum: `virustotal | wayback | urlscan` (sejajar `EngineProvider` referensi passive-recon).
- `discovered_urls` (per target): `url_text`, `url_sha256` (unik per target), `sources[]`,
  `pathname_extension`, `extension_category_id`, `external_seen_at`, deep-fetch fields
  (`deep_scan_state`, `fetched_at`, `content_storage_key`, `content_length`).
- `exposure_findings`: `discovered_url_id`, `target_id`, `scan_id?`, `source` (url|body),
  `finding_type`, `snippet` (rahasia), `sources[]`, `metadata`, `created_at`.
- `extension_categories` + `extension_suffix_rules` (seed default + editable).
- `ip_resolutions` (`target_id`, `ip_address`, `latest_resolved_at`, `hostname_count`) +
  `ip_resolution_sightings` (`hostname`, `last_resolved_at`, `scan_id?`).
- `scan_observed_*` (subdomain/url/ip) untuk snapshot per-scan + diff (mirip pola referensi passive-recon).
- `api_keys` diperluas untuk rotation/kuota (§3.5).

Semua di-cascade ke `projects`/`targets` (multi-tenant tetap dijaga).

---

## 5. Integrasi ke pipeline & skor

Pipeline `full` (urutan, semua dalam worker pg-boss yang sama):

```
passive: VT(apex) → VT(subdomains) → Wayback(apex+subs) → consolidate (dedupe URL/sub/IP)
feed:    host pasif → daftar host untuk probe aktif (opsional)
active:  httpx → naabu → nuclei (+wordfence)               [tetap sesuai kebijakan]
analysis: kategorisasi ekstensi → regex exposure (URL) → deep-fetch+regex (body, opt-in)
```

- **Risk score**: `exposure_findings` mengisi komponen Exposure (konsisten dashboard/TI/report - ±0).
- **CTI cross-link**: passive-DNS IP history melengkapi OTX; `combo-list-cred`/email beririsan
  LeakCheck → tautkan ke indikator/triage, jangan duplikasi.
- **Report**: bagian baru "Attack Surface & Exposure" (subdomain pasif, IP/origin, kandidat
  file sensitif, exposure findings yang di-redaksi) - dwibahasa, masuk VA/TI report.

---

## 6. Keamanan & PII (kebijakan)

- Exposure snippet = **rahasia** (selevel plaintext LeakCheck): disimpan apa adanya untuk triase,
  **dimask di UI** (reveal on-demand, pola `Reveal` yang sudah ada), **CONFIDENTIAL** di report,
  tidak pernah di-log.
- Deep-fetch **wajib** SSRF-guard + opt-in + cap ukuran + (opsional) proxy. Tanpa guard = tidak boleh.
- Hanya target yang **diautorisasi** (vacti tetap RBAC + auth - kebalikan posture "no-auth" referensi passive-recon).
- API key OSINT terenkripsi at-rest (vault yang sudah ada), rotation tidak membocorkan key.

---

## 7. Fase pengiriman

- **v1.1 (inti):** engine VT + Wayback (P1-P3), mode `passive`, exposure regex (P4),
  kategori file (P5), diff diperluas (P10), rotation/kuota di Postgres (P8). Pure-TS + HTTP, ringan.
- **v1.2:** deep-fetch + SSRF + proxy (P7,P9), export CSV/ZIP (P11), endpoint/param discovery (P6).
- **roadmap:** dashboard discovery-over-time (P12), engine URLScan (P13).

Semua tetap di tiga service (app + worker + Postgres). Tidak ada Redis, tidak ada biner baru.

---

## 8. Sumber data

Semua data berasal dari API publik (VirusTotal, Wayback Machine) yang diakses secara pasif, dengan
atribusi sesuai ketentuan masing-masing layanan. Semua logika (ruleset regex exposure, SSRF-guard) adalah
implementasi TypeScript murni milik vacti.
