/** VA vulnerability triage status (see docs/planning/05-FINDING-STATUS.md). */
export const VulnStatus = {
  Open: 'open',
  InProgress: 'in_progress',
  Reopened: 'reopened',
  Resolved: 'resolved',
  RiskAccepted: 'risk_accepted',
  FalsePositive: 'false_positive',
  NoImpact: 'no_impact',
  WafHandled: 'waf_handled',
  Duplicate: 'duplicate',
  OutOfScope: 'out_of_scope',
} as const;

export type VulnStatusValue = (typeof VulnStatus)[keyof typeof VulnStatus];

export const VULN_STATUS_LABEL: Record<VulnStatusValue, string> = {
  open: 'Open',
  in_progress: 'On Progress',
  reopened: 'Reopened',
  resolved: 'Resolved',
  risk_accepted: 'Risk Accepted',
  false_positive: 'False Positive',
  no_impact: 'No Impact',
  waf_handled: 'WAF Handled',
  duplicate: 'Duplicate',
  out_of_scope: 'Out of Scope',
};

/** Statuses that count as active risk (feed the risk score). */
export const VULN_ACTIVE_STATUSES: VulnStatusValue[] = [VulnStatus.Open, VulnStatus.InProgress, VulnStatus.Reopened];

export function isVulnStatus(s: string): s is VulnStatusValue {
  return (Object.values(VulnStatus) as string[]).includes(s);
}

/** Threat-Intel leaked-credential triage status (applies ONLY to LeakCheck findings). */
export const LeakStatus = {
  New: 'new',
  Investigating: 'investigating',
  Confirmed: 'confirmed',
  Remediated: 'remediated',
  FalsePositive: 'false_positive',
  Ignored: 'ignored',
} as const;

export type LeakStatusValue = (typeof LeakStatus)[keyof typeof LeakStatus];

export const LEAK_STATUS_LABEL: Record<LeakStatusValue, string> = {
  new: 'New',
  investigating: 'Investigating',
  confirmed: 'Confirmed',
  remediated: 'Remediated',
  false_positive: 'False Positive',
  ignored: 'Ignored',
};

/** Leak statuses that still drive the credential-exposure component. */
export const LEAK_UNRESOLVED_STATUSES: LeakStatusValue[] = [
  LeakStatus.New,
  LeakStatus.Investigating,
  LeakStatus.Confirmed,
];

export function isLeakStatus(s: string): s is LeakStatusValue {
  return (Object.values(LeakStatus) as string[]).includes(s);
}

/** Sector security-news triage status (applies to threat-news headlines). */
export const NewsStatus = {
  New: 'new',
  Reviewed: 'reviewed',
  Relevant: 'relevant',
  Actioned: 'actioned',
  Dismissed: 'dismissed',
} as const;

export type NewsStatusValue = (typeof NewsStatus)[keyof typeof NewsStatus];

export const NEWS_STATUS_LABEL: Record<NewsStatusValue, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  relevant: 'Relevant',
  actioned: 'Actioned',
  // DB value stays 'dismissed' (no migration); label reads "Irrelevant" - clearer for not-relevant news.
  dismissed: 'Irrelevant',
};

export function isNewsStatus(s: string): s is NewsStatusValue {
  return (Object.values(NewsStatus) as string[]).includes(s);
}

/**
 * One-click "reviewed/triaged" toggle target per finding type. Each is a two-state switch between
 * the finding's untouched `base` status and the first analyst-triage `reviewed` status, so a single
 * click marks a finding reviewed (and clicking again reverts). The full status dropdown still covers
 * every other status. `label` is what the toggle button shows.
 */
export const REVIEW_TOGGLE = {
  vuln: { base: VulnStatus.Open, reviewed: VulnStatus.InProgress, label: VULN_STATUS_LABEL.in_progress },
  leak: { base: LeakStatus.New, reviewed: LeakStatus.Investigating, label: LEAK_STATUS_LABEL.investigating },
  news: { base: NewsStatus.New, reviewed: NewsStatus.Reviewed, label: NEWS_STATUS_LABEL.reviewed },
} as const;

export type ReviewToggleKind = keyof typeof REVIEW_TOGGLE;

/** The status a one-click review toggle should set, given the finding's current status. */
export function reviewToggleTarget(kind: ReviewToggleKind, current: string): string {
  const t = REVIEW_TOGGLE[kind];
  return current === t.reviewed ? t.base : t.reviewed;
}
