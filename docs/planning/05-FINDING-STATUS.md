# vacti - Finding Status & Triage Lifecycle

> Planning spec. Every VA finding (vulnerability) carries a triage **status** through its lifecycle.
> In Threat Intelligence, a per-finding status applies **only to LeakCheck data-leak findings** -
> OTX pulses / malware / passive-DNS / URLs are enrichment context and are NOT individually triaged.

## 1. VA finding status (vulnerabilities)

`vulnerabilities.status` - enum, default `open`. Status drives whether a finding is **active risk**
(feeds the unified risk score) or **closed/mitigated** (excluded or down-weighted).

| Status           | Label          | Meaning                                                    | Active risk?                |
| ---------------- | -------------- | ---------------------------------------------------------- | --------------------------- |
| `open`           | Open           | Newly discovered, not yet triaged or fixed.                | **Yes**                     |
| `in_progress`    | On Progress    | Remediation is underway.                                   | **Yes**                     |
| `reopened`       | Reopened       | Previously closed but seen again / regressed.              | **Yes** (behaves like open) |
| `resolved`       | Resolved       | Fixed and verified (e.g. re-scan no longer detects it).    | No                          |
| `risk_accepted`  | Risk Accepted  | Business formally accepts the risk; tracked, not actioned. | No (tracked)                |
| `false_positive` | False Positive | Not a real issue.                                          | No                          |
| `no_impact`      | No Impact      | Valid finding but no security impact in this context.      | No                          |
| `waf_handled`    | WAF Handled    | Mitigated by a WAF / compensating control.                 | Down-weighted (mitigated)   |
| `duplicate`      | Duplicate      | Same root issue as another finding.                        | No                          |
| `out_of_scope`   | Out of Scope   | Outside the agreed assessment scope.                       | No                          |

"…and other relevant statuses": the set above is the v1 canon; new statuses are additive with an
explicit active-risk classification.

### Transitions (suggested, not strictly enforced)

```
open ──▶ in_progress ──▶ resolved
  │            │
  ├──▶ risk_accepted / false_positive / no_impact / waf_handled / duplicate / out_of_scope
  │
resolved ──▶ reopened ──▶ open
```

### Rules

- **Default** on import: `open`. Re-scan that re-detects a `resolved` finding flips it to `reopened`.
- **Risk score:** `computeProjectRisk` counts only **active** statuses (`open`, `in_progress`,
  `reopened`) toward VA; `waf_handled` is half-weighted; all other closed statuses are excluded.
- **Audit:** every status change writes `audit_log` (actor, finding, from→to, optional note, timestamp).
- **RBAC:** changing a finding status requires `modify_scan_results`. Auditor is read-only (cannot
  change status), per the role matrix.
- **Fields:** `status`, plus optional `status_note` (text) and `status_changed_at` / `status_changed_by`.
- **UI:** status shown as a pill on each vuln row + bulk/inline status change; filterable in the
  vulnerabilities table; dashboard severity/risk reflects only active findings.

## 2. Threat Intel - status applies to LeakCheck findings only

Per requirement, a per-finding status exists **only for leaked-credential findings** (`leakcheck_data`).
It replaces/extends the current `checked` boolean. OTX and other TI data have **no** per-item status.

`leakcheck_data.status` - enum, default `new`:

| Status           | Label          | Meaning                              | Drives exposure? |
| ---------------- | -------------- | ------------------------------------ | ---------------- |
| `new`            | New            | Freshly imported, not yet reviewed.  | **Yes**          |
| `investigating`  | Investigating  | Under review by an analyst.          | **Yes**          |
| `confirmed`      | Confirmed      | Verified valid / active exposure.    | **Yes**          |
| `remediated`     | Remediated     | Credential rotated / access revoked. | No               |
| `false_positive` | False Positive | Not valid / not ours.                | No               |
| `ignored`        | Ignored        | Accepted / irrelevant.               | No               |

### Rules

- **Risk score:** credential-exposure component counts only **unresolved** leak statuses
  (`new`, `investigating`, `confirmed`). Triaging to `remediated`/`false_positive`/`ignored` lowers
  the score - preserving the original "unchecked drives the score; reviewing reduces it" incentive.
- **Migration note:** the existing `checked` boolean maps to status - `checked=false → new`,
  `checked=true → confirmed` (analyst can refine afterwards). `checked` is removed once status lands.
- **UI:** leak rows show a status pill + a triage control (dropdown of the statuses above) instead of
  the current two-state toggle; filterable.
- **No status on OTX/other TI:** pulses, malware refs, passive DNS, URL lists, and OTX-looked-up
  manual indicators are enrichment/context, not individually triaged findings.

## 3. Where this lands

- Data model: `vulnerabilities.status` (+ note/changed-at/by); `leakcheck_data.status` (replaces
  `checked`). Recon-engine + threat-intel migrations.
- Risk score: `computeProjectRisk` filters by active status for both VA and leaks.
- API: status-change endpoints (`PATCH /vulnerabilities/:id`, `PATCH /leaks/:id`) gated by RBAC.
- UI: status pills + triage controls + table filters on the scan-detail vulns tab and the Threat
  Intel leaks table.

## 4. One-click review toggle (2026-06-05)

Every finding that carries a triage status - VA vulns, leaked credentials, and sector security-news
headlines - gets a one-click **review toggle** beside its full status dropdown, so an analyst can mark
something triaged without the two-step dropdown+Set flow. The toggle is a two-state switch between the
finding's untouched `base` status and its first analyst-triage `reviewed` status (clicking again
reverts); the dropdown still covers every other status.

- `REVIEW_TOGGLE` + `reviewToggleTarget()` in `@vacti/core` define the base⇄reviewed pair per kind:
  vuln `open ⇄ in_progress`, leak `new ⇄ investigating`, news `new ⇄ reviewed`.
- Reusable `<ReviewToggle>` server component (`apps/web/.../ui/review-toggle.tsx`) posts the existing
  status action with the toggled target; reused on the scan-detail vulns table and both Threat-Intel
  tables (leaks + news).
