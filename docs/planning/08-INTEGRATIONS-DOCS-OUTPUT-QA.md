# vacti - Integrations, Docs & Output-QA Plan (2026-06-05)

> Five tracks requested: (1) strengthen Google Chat notifications, (2) complete the public API docs,
> (3) a proper GitHub README, (4) a real end-to-end scan → report → **PDF pagination QA** against an
> authorized live target, (5) reflect all of it in the planning docs. Each track lands on `main`
> behind a green gate.

## A. Google Chat integration

- Current: `format.ts` sends `{ text }` only - functional but plain.
- Improve to a **cardsV2** message (header with severity colour dot, key/value fields, a "View" link),
  on par with the Discord rich embed. Keep a text fallback. Unit-test the formatter shape.

## B. Public API documentation (OpenAPI)

- Current: `openapi.ts` lists ~15 paths, minimal. Make it **comprehensive**:
  - `securitySchemes: bearerAuth` (API token) + global `security`.
  - Every endpoint incl. the newer ones: `POST /scans/{id}/cancel`, `GET /scans/{id}/diff`,
    `GET/POST/DELETE /schedules`, `GET /search`, `POST /leaks/{id}/toggle`, `DELETE /webhooks/{id}`,
    `DELETE /indicators/{id}`, pagination params on `GET /scans`.
  - Request/response schemas, tags, 401/403/404 responses, server URL.
- Verify Redoc renders at `/api/docs`; an integration test asserts the spec lists the key paths +
  the security scheme.

## C. GitHub README

- Expand to a full README: badges, what/why, feature list, architecture diagram (text), **quickstart**
  (prereqs, env, `db:migrate`/`db:seed`, run app+worker), running a scan, **API usage** (token + curl),
  reports, testing (3-tier + e2e UI), deploy (Cloudflare Tunnel), project layout, security note, license.

## D. Output QA - real scan → report → PDF pagination

Target: **testfire.net** (IBM/HCL AltoroMutual - a deliberately vulnerable, publicly authorized test
site). Steps:

1. Seed admin/project/target; run the **real worker** to scan testfire.net end-to-end (subfinder →
   httpx → naabu → nuclei). Use a profile that finds real findings (so the report has finding cards).
2. Confirm scan reaches `completed` with endpoints/ports/vulns persisted.
3. Generate the VA report (recon + vuln + full) and the TI report; render each PDF.
4. **Pagination QA**: render every page to PNG (`pdftoppm`) and inspect for: no blank/orphan pages,
   finding cards not split mid-card across a page break, section heads not stranded at page bottom,
   running header/footer + page numbers correct, cover full-bleed, tables not clipped. Fix any defect
   in `libs/reports` CSS (`break-inside`, `@page`, etc.) and re-render until clean.
5. Drive the flow in the browser with Playwright (open the report route, assert `application/pdf`),
   and attach rendered page images for human review.

## E. Planning update

- This doc; update `02-FEATURE-PARITY-CHECKLIST.md` (Google Chat rich, OpenAPI completeness) and the
  integrations notes; note the output-QA result + any pagination fixes.

## Out of scope

Other chat platforms' rich formats (Slack blocks/Lark cards stay text), multi-target scan campaigns.
