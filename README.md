# Vacti

**Vacti is an AI-driven autonomous penetration-testing platform.** This repository contains the
Vacti web application: the self-hosted control plane where you manage engagements, review proven
findings, and produce client-ready reports.

It is for security teams and consultancies that run assessments continuously and need one place to
see what is exposed, what has been proven, and what to fix first. You do not need this repository to
*use* Vacti — installable images and the hosted option are described at
[vacti.org](https://vacti.org).

## What it covers

- **Assessments** — run and schedule scans, watch progress live, compare one run against the last,
  and re-test a subset without starting over.
- **Findings and triage** — every finding arrives with severity, references and evidence, plus a
  triage workflow (new, in review, confirmed, false positive) that survives across engagements.
- **Attack surface and exposure** — passively discover what you have exposed to the internet and
  flag leaked credentials and keys before someone else finds them.
- **Threat intelligence** — ransomware activity, known-exploited vulnerabilities and sector news,
  folded together with your own findings into a single risk score.
- **Reports** — bilingual, branded PDF reports with an executive summary, approval sheet and
  evidence appendix.
- **Access control** — multi-tenant workspaces with role-based permissions enforced on the server,
  plus a full audit log.

## Running it

The application is a TypeScript service backed by PostgreSQL, packaged for Docker. Setup,
configuration and the first-run walkthrough live in [`INSTALL.md`](INSTALL.md).

Design documentation — architecture, deployment and decision records — is in [`docs/`](docs/).

## Security

Vacti is for authorised security testing only. Findings, credentials and target data stay in your
database; secrets are held in an encrypted vault and never logged. Please report vulnerabilities in
Vacti itself according to [`SECURITY.md`](SECURITY.md).

## Licence

MIT. See [LICENSE](LICENSE) and [LICENSING-NOTICE.md](LICENSING-NOTICE.md).
