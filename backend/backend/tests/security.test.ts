import { describe, expect, it } from 'vitest';
import { safeCell } from '../src/security/spreadsheet';
import { isBlockedAddress, validatePublicUrl } from '../src/security/safe-fetch';
import { qualify, verificationStatus } from '../src/pipeline/qualify';
import { can } from '../src/lib/permissions';

describe('spreadsheet formula-injection protection', () => {
  it('neutralises formula starters', () => {
    expect(safeCell('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`);
    expect(safeCell('@SUM(1)')).toBe("'@SUM(1)");
    expect(safeCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(safeCell('-2+3+cmd')).toBe("'-2+3+cmd");
  });
  it('leaves normal values and phone numbers alone', () => {
    expect(safeCell('Pearl Books')).toBe('Pearl Books');
    expect(safeCell('+94 11 234 5678')).toBe('+94 11 234 5678');
    expect(safeCell(4.5)).toBe(4.5);
    expect(safeCell(null)).toBeNull();
  });
});

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '172.20.0.1', '::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it('allows public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });
  it('rejects bad URLs', () => {
    expect(() => validatePublicUrl('file:///etc/passwd')).toThrow();
    expect(() => validatePublicUrl('http://localhost:3000')).toThrow();
    expect(() => validatePublicUrl('http://user:pw@example.com')).toThrow();
    expect(() => validatePublicUrl('http://169.254.169.254/latest')).toThrow();
  });
});

describe('qualification is transparent', () => {
  it('explains every point of the score', () => {
    const r = qualify({ name: 'A', address: '1 St', phone: '011', website: null, facebook_url: null, instagram_url: null, rating: 4.4, review_count: 30 });
    expect(r.score).toBe(100);
    expect(r.reasons.map((x) => x.id)).toEqual(['no_website', 'no_social', 'has_phone', 'established', 'has_address']);
  });
  it('verification needs evidence', () => {
    expect(verificationStatus({ name: 'A', address: 'x', phone: '011' }, 1)).toBe('verified');
    expect(verificationStatus({ name: 'A', address: 'x', phone: null }, 1)).toBe('likely');
    expect(verificationStatus({ name: 'A', address: null, phone: null }, 1)).toBe('unresolved');
  });
});

describe('role permissions', () => {
  it('viewers cannot export or start searches', () => {
    expect(can('viewer', 'export:create')).toBe(false);
    expect(can('viewer', 'search:create')).toBe(false);
    expect(can('analyst', 'export:create')).toBe(true);
    expect(can('analyst', 'users:manage')).toBe(false);
    expect(can('owner', 'workspace:manage')).toBe(true);
  });
});
