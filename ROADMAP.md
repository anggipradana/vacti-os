# Roadmap

Product direction for vacti, summarized from
[docs/planning/01-FEATURE-SCOPE.md](docs/planning/01-FEATURE-SCOPE.md) (the original scope study,
in Indonesian) and
[docs/planning/02-FEATURE-PARITY-CHECKLIST.md](docs/planning/02-FEATURE-PARITY-CHECKLIST.md) (the
living epic-by-epic decision record, in Indonesian). Those two documents are the authoritative,
line-by-line source; this page is an English-language summary for orientation, not a replacement.

## Shipped

The feature set described in [README.md](README.md) is implemented and in active use: the
`subfinder -> httpx -> naabu -> nuclei` (+ conditional wordfence templates) recon pipeline; passive
OSINT discovery via VirusTotal and Wayback Machine with the 23-rule exposure detector; threat
intelligence (OTX, LeakCheck, manual indicators, sector news, the unified risk score); breached-
credential lookups (Leaks); bilingual PDF reports; project/target/scan management with scheduling,
sub-scans, and scan diffing; webhook integrations and AI enrichment; and the full typed REST API
with OpenAPI docs. See README.md's "What it does" section for the complete, current list.

## Deliberately Out of Scope (v1)

Recorded in [docs/planning/02-FEATURE-PARITY-CHECKLIST.md](docs/planning/02-FEATURE-PARITY-CHECKLIST.md)
(rows marked dibuang, "dropped"). These are not omissions - each was considered and rejected for a
stated reason:

- **Extra subdomain enumeration tools** (amass, sublist3r, oneforall, ctfr, tlsx, netlas, chaos) -
  `subfinder` alone covers the need.
- **Active crawlers** (gospider, hakrawler, katana) and their URL-fetch cousins - passive URL
  discovery (Wayback Machine, VirusTotal undetected-URLs) covers the same need without sending
  traffic to the target. See
  [11-PASSIVE-RECON-AND-EXPOSURE.md](docs/planning/11-PASSIVE-RECON-AND-EXPOSURE.md).
- **Directory/file fuzzing** (ffuf) and **extra scanners** (dalfox, crlfuzz, s3scanner, nmap+NSE).
- **Screenshot capture** (EyeWitness/Selenium) - heavy runtime dependency for a feature outside VA +
  TI's core value.
- **Heavy OSINT tooling** (theHarvester, dorking/GooFuzz, h8mail, metafinder), **WAF/CMS
  fingerprinting** (wafw00f, CMSeeK), and **complex WHOIS/domain-info** lookups.
- **Bug-bounty program sync** (HackerOne import/submit).
- **Redis, Celery, Ruby, WeasyPrint** as runtime dependencies, at any layer - the queue is
  Postgres-backed (`pg-boss`), WordPress scanning runs through `nuclei` + wordfence templates (not
  the Ruby `wpscan`), and report rendering uses Playwright-driven HTML/CSS, not WeasyPrint.
- **Multi-org tenancy** and **outbound proxying as a first-class feature** beyond the existing
  `PROXY_URL` escape hatch.

## Direction

Near-term product-facing work is tracked epic-by-epic in
[02-FEATURE-PARITY-CHECKLIST.md](docs/planning/02-FEATURE-PARITY-CHECKLIST.md)'s addenda, not
duplicated here - that document is updated as each epic closes, and duplicating its content would
immediately drift. Broad themes on the horizon:

- Deeper passive-recon coverage (discovery-over-time views, URLScan.io as a third passive source).
- Richer threat-intel feeds and sector-specific news sources.
- Continued reporting and dashboard polish.

## Related

- [README.md](README.md) - the current, shipped feature set and how to run it.
- [docs/planning/01-FEATURE-SCOPE.md](docs/planning/01-FEATURE-SCOPE.md) - the original scope study
  and technology verdict.
- [docs/planning/02-FEATURE-PARITY-CHECKLIST.md](docs/planning/02-FEATURE-PARITY-CHECKLIST.md) - the
  living, epic-by-epic decision record; the authoritative source this page summarizes.
- [SECURITY.md](SECURITY.md) - scope and reporting for security-relevant findings.
</content>
