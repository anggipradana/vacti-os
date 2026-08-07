# Getting Started - Using vacti

A practical walkthrough of the main features. vacti is a Vulnerability Assessment + Cyber Threat
Intelligence platform. For install/deploy see the [README](../../README.md) and
[deploy guide](../how-to/deploy.md); for the REST API see **Settings → API Tokens → Open API docs**
(served live at `/api/docs`, schema at `/api/openapi.json`).

## 1. First login

- On first run the app asks you to create the **first admin**. After that, sign in at `/login`.
- Change your own password any time at **Settings → Account**. A SysAdmin can add users, change
  roles, and reset a user's password at **Settings → Users**.

## 2. Projects (workspaces)

Everything is scoped to a **Project**. At **Settings -> Projects** you can create, rename (Edit), delete
(cascades all its data), and mark one as **Default** (the workspace shown on login). The active project
is shown in the top-bar switcher on most pages.

## 3. Targets

Under **Targets**, add a domain to a project (optionally predefined subdomains + custom request
headers). Use **Edit** to change the domain/headers later, or delete it.

## 4. Scans

From **Vulnerability Assessment** (or a target) start a scan. Profiles (**Settings → Scan Profiles**) control the tool
set (subfinder / httpx / naabu / nuclei + wordfence), ports, severities and per-tool options - create
and **Edit** them. A scan detail page streams live progress; you can cancel, re-scan (sub-scans),
compare against an earlier scan (diff), and delete it.

## 5. Findings & triage

On a scan's **Vulnerabilities** tab: search by text, filter by status, select rows (checkboxes) to
**bulk-change status**, change a single finding's status instantly, enrich a finding with **AI**
(needs an AI key, see below), or delete it. The same search + multi-select + bulk pattern is on the
Leaked-credentials, Security-news, Brand-news and Exposure tables.

## 6. Attack Surface (passive recon)

Run a **passive** or **full** scan to populate **Attack Surface**: archived URLs (Wayback, covering
the domain **and all subdomains**), exposure findings (masked, confidential), and IP resolutions.
Filter/search, triage exposure findings, and export to CSV/ZIP.

## 7. Cyber Threat Intelligence

The **Threat** page shows a unified risk score, OTX/leak data, KEV/EPSS/ransomware landscape, sector
**Security news** and **Brand monitoring** (max 15 latest each; auto-refreshed daily 09:00 WIB, or on
demand). Use **AI: filter irrelevant** to let the model down-rank off-topic headlines (it learns from
what you mark Irrelevant). Generate a bilingual **TI report**.

## 8. Reports

Generate bilingual (EN/ID) PDF reports for VA (per scan) and TI (per project). Branding and
signatories are configured at **Settings → Reports**.

## 9. Integrations

**Settings → Integrations**: webhooks (Discord/Slack/Telegram/Google Chat/generic - add, **Edit**,
test, remove), the AI provider for enrichment (OpenAI or Ollama, with an
optional **Base URL** for a compatible gateway, plus a system-default provider + key), and the
per-project encrypted **key vault** (OTX, LeakCheck, VirusTotal, URLScan, AI keys).

## 10. Schedules & automation

**Settings -> Schedules** runs recurring scans via a lightweight cron tick (create/Edit/pause/delete).
News is refreshed automatically every day at 09:00 WIB.

## 11. API

Everything above is scriptable. Create a Bearer token at **Settings → API Tokens**, then explore the
interactive docs at `/api/docs` (Redoc) or the machine-readable `/api/openapi.json`.

## 12. Audit

**Settings → Audit log** records mutating actions (who/what/when), newest first.
