import { describe, it, expect } from 'vitest';
import { isInterestingEndpoint } from './keywords';

describe('isInterestingEndpoint', () => {
  it('flags admin/login/etc in url or title (case-insensitive)', () => {
    expect(isInterestingEndpoint('https://admin.example.com', null)).toBe(true);
    expect(isInterestingEndpoint('https://example.com/wp-login.php', null)).toBe(true);
    expect(isInterestingEndpoint('https://example.com', 'cPanel Login')).toBe(true);
    expect(isInterestingEndpoint('https://example.com/home', 'Welcome')).toBe(false);
  });
  it('respects a custom keyword list', () => {
    expect(isInterestingEndpoint('https://example.com/secret', null, ['secret'])).toBe(true);
    expect(isInterestingEndpoint('https://admin.example.com', null, ['secret'])).toBe(false);
  });
  it('does not flag substrings inside unrelated words (token boundary)', () => {
    expect(isInterestingEndpoint('https://www.mydevice-store.com/', null)).toBe(false); // not "dev"
    expect(isInterestingEndpoint('https://example.com/digital-marketing', null)).toBe(false); // not "git"
    expect(isInterestingEndpoint('https://example.com/contestants', null)).toBe(false); // not "test"
    expect(isInterestingEndpoint('https://shop.example.com/grapism', null)).toBe(false); // not "api"
    expect(isInterestingEndpoint('https://example.com/dev-tools', null)).toBe(true); // real "dev" segment
    expect(isInterestingEndpoint('https://api.example.com/v1', null)).toBe(true); // "api" host label
  });
});
