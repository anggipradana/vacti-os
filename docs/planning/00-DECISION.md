# vacti - Keputusan Teknologi (FINAL)

> Opsi 2 (Go + Next.js) & semua varian berat lama sudah ditolak/dihapus. Dokumen ini hanya
> mencatat jalur yang dipilih. Cakupan fitur detail ada di [01-FEATURE-SCOPE.md](01-FEATURE-SCOPE.md).

## Stack terpilih - Full-stack TypeScript (ringan · modern · reliable)

| Lapisan         | Pilihan                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| App/UI          | **Next.js 15** (App Router, React 19) + **Tailwind** + **shadcn/ui** + Radix (dark mode, WCAG AA)                                |
| API             | **tRPC** (internal type-safe) + **Hono** untuk REST publik + **Zod** + **OpenAPI** auto                                          |
| DB/ORM          | **PostgreSQL** + **Drizzle ORM** (+ drizzle-kit migrasi)                                                                         |
| Background jobs | **pg-boss** (antrian di Postgres, TANPA Redis) + worker proses terpisah                                                          |
| Recon engine    | exec **4 binary Go**: subfinder · httpx · naabu · nuclei (WordPress = nuclei + template wordfence, kondisional). **Tanpa Ruby.** |
| AI              | **Vercel AI SDK** - provider abstraction: OpenAI (default) + Ollama                                                              |
| Reports         | route HTML/CSS (desain baru) → **Playwright** render PDF; alternatif **Typst**                                                   |
| Charts          | Recharts / Visx                                                                                                                  |
| Realtime        | SSE (progres scan)                                                                                                               |
| Auth            | session + API token; RBAC (SysAdmin / Penetration Tester / Auditor)                                                              |

## Infra (minimal)

`app (Next.js)` + `worker (Node, pg-boss)` + `PostgreSQL`. Tools recon + Chromium(Playwright)
ada di image worker. Tidak ada Celery, Redis, Ollama-wajib, Nginx berat.

## Tooling & delivery

- **Monorepo Nx** (apps: `web`, `worker`; libs bersama).
- **Docs**: model **Diátaxis** + trunk-based.
- **Git**: Conventional Commits + commitlint; Husky pre-commit (git-identity + no-`.env` + lint-staged)
  - commit-msg + pre-push (gate: typecheck+lint+test+e2e affected).
- **CI**: typecheck + lint + test + **Playwright e2e** + integration test (Postgres service
  container); gate wajib lulus.
- **Testing**: Vitest (unit/integration) + Playwright (e2e), 3-tier (quick/integration/e2e).
- **Keamanan**: hanya `.env.example`; secret-guard di git hook.

## Alternatif yang ditolak (catatan singkat)

- Go + Next.js (Opsi 2) - engine compiled super-andal tapi backend 2 bahasa; keunggulan konkurensi
  belum terpakai untuk scope yang sudah diramping.
- Mempertahankan stack berat (Django/Celery/Redis/WeasyPrint/30+ tool) - terlalu berat.
