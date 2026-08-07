# Security Policy

## Reporting a vulnerability

Please report security issues privately to the maintainer rather than opening a public issue.
Include reproduction steps and impact. We aim to acknowledge within a few days.

## Handling secrets

- The **only** committable env file is `.env.example`. All `.env*` are git-ignored and blocked by a
  pre-commit guard.
- API keys (OTX, LeakCheck, AI providers) are stored **encrypted at rest** (AES-256-GCM) in the
  vault, decrypted only at point of use. Plaintext is never logged or returned by the API.
- Sessions are httpOnly cookies; passwords hashed with argon2id; API tokens stored as hashes.

## Scope & authorization

vacti performs active reconnaissance (port scanning, vulnerability scanning). **Only scan assets you
are authorized to test.** RBAC restricts who can initiate scans (`initiate_scans` permission);
Auditors are read-only (plus report generation).
