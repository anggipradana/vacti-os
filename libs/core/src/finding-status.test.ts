import { describe, it, expect } from 'vitest';
import {
  REVIEW_TOGGLE,
  reviewToggleTarget,
  isNewsStatus,
  isLeakStatus,
  isVulnStatus,
  NEWS_STATUS_LABEL,
} from './finding-status';

describe('reviewToggleTarget', () => {
  it('toggles a base status to its reviewed status for each kind', () => {
    expect(reviewToggleTarget('news', REVIEW_TOGGLE.news.base)).toBe(REVIEW_TOGGLE.news.reviewed);
    expect(reviewToggleTarget('leak', REVIEW_TOGGLE.leak.base)).toBe(REVIEW_TOGGLE.leak.reviewed);
    expect(reviewToggleTarget('vuln', REVIEW_TOGGLE.vuln.base)).toBe(REVIEW_TOGGLE.vuln.reviewed);
  });

  it('toggles a reviewed status back to its base status', () => {
    expect(reviewToggleTarget('news', REVIEW_TOGGLE.news.reviewed)).toBe(REVIEW_TOGGLE.news.base);
    expect(reviewToggleTarget('leak', REVIEW_TOGGLE.leak.reviewed)).toBe(REVIEW_TOGGLE.leak.base);
    expect(reviewToggleTarget('vuln', REVIEW_TOGGLE.vuln.reviewed)).toBe(REVIEW_TOGGLE.vuln.base);
  });

  it('treats any other current status as "not yet reviewed" → moves to reviewed', () => {
    // e.g. a leak already at 'confirmed' that is not the toggle's reviewed state still resolves to reviewed.
    expect(reviewToggleTarget('leak', 'confirmed')).toBe(REVIEW_TOGGLE.leak.reviewed);
    expect(reviewToggleTarget('news', 'dismissed')).toBe(REVIEW_TOGGLE.news.reviewed);
  });

  it('every toggle target is a valid status for its kind', () => {
    expect(isNewsStatus(REVIEW_TOGGLE.news.reviewed)).toBe(true);
    expect(isLeakStatus(REVIEW_TOGGLE.leak.reviewed)).toBe(true);
    expect(isVulnStatus(REVIEW_TOGGLE.vuln.reviewed)).toBe(true);
    expect(NEWS_STATUS_LABEL[REVIEW_TOGGLE.news.reviewed]).toBeTruthy();
  });
});

describe('isNewsStatus', () => {
  it('accepts known statuses and rejects others', () => {
    expect(isNewsStatus('reviewed')).toBe(true);
    expect(isNewsStatus('relevant')).toBe(true);
    expect(isNewsStatus('bogus')).toBe(false);
  });
});
