import { describe, expect, it } from 'vitest';
import { classifySocial, makeFingerprint, normalizeName, normalizePhone, normalizeRaw, normalizeSocial, normalizeUrl, similarity } from '../src/pipeline/normalize';

describe('phone normalisation (Sri Lanka)', () => {
  it.each([
    ['011 234 5678', '+94112345678', '011 234 5678'],
    ['0112345678', '+94112345678', '011 234 5678'],
    ['+94 77 123 4567', '+94771234567', '077 123 4567'],
    ['0094771234567', '+94771234567', '077 123 4567'],
    ['94112345678', '+94112345678', '011 234 5678'],
    ['(071) 2345678', '+94712345678', '071 234 5678'],
  ])('%s', (input, e164, display) => {
    expect(normalizePhone(input)).toEqual({ e164, display });
  });
  it('rejects garbage and never invents numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('call us')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('url normalisation', () => {
  it('adds protocol, strips tracking and trailing slash', () => {
    expect(normalizeUrl('Example.com/?utm_source=x')?.url).toBe('https://example.com');
    expect(normalizeUrl('http://www.shop.lk/books/')?.domain).toBe('shop.lk');
  });
  it('rejects unsafe or invalid values', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('localhost')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
  it('classifies social hosts and rejects share links', () => {
    expect(classifySocial('www.facebook.com')).toBe('facebook');
    expect(normalizeSocial('https://facebook.com/sharer/sharer.php?u=1')).toBeNull();
    expect(normalizeSocial('https://www.instagram.com/p/abc123/')).toBeNull();
    expect(normalizeSocial('https://www.instagram.com/malabebooks/?hl=en')).toEqual({ platform: 'instagram', url: 'https://www.instagram.com/malabebooks' });
  });
});

describe('names, fingerprints and dedupe safety', () => {
  it('normalises legal suffixes and punctuation', () => {
    expect(normalizeName('  Pearl Books (Pvt) Ltd. ').normalized).toBe('pearl books');
  });
  it('same business gives the same fingerprint', () => {
    const a = makeFingerprint({ normName: 'pearl books', phoneE164: '+94112345678', normCity: 'malabe', normAddress: 'x' });
    const b = makeFingerprint({ normName: 'pearl books', phoneE164: '+94112345678', normCity: 'malabe', normAddress: 'y' });
    expect(a).toBe(b);
  });
  it('without a phone, different addresses are never merged on name alone', () => {
    const a = makeFingerprint({ normName: 'pearl books', phoneE164: null, normCity: 'malabe', normAddress: '1 main street' });
    const b = makeFingerprint({ normName: 'pearl books', phoneE164: null, normCity: 'malabe', normAddress: '99 other road' });
    expect(a).not.toBe(b);
  });
  it('similarity is only a review signal', () => {
    expect(similarity('pearl books', 'pearl book house')).toBeGreaterThan(0.2);
    expect(similarity('pearl books', 'zzz salon')).toBe(0);
  });
});

describe('normalizeRaw', () => {
  it('keeps missing values null instead of inventing them', () => {
    const n = normalizeRaw({ sourceRecordId: '1', name: 'Reader Corner' }, { category: 'Bookshops', location: 'Malabe, Sri Lanka' }, 'osm');
    expect(n).toMatchObject({ phone: null, website: null, rating: null, category: 'Bookshop', cityArea: 'Malabe' });
    expect(n?.socials).toEqual([]);
  });
  it('moves a social page given as website into socials', () => {
    const n = normalizeRaw({ sourceRecordId: '2', name: 'X', website: 'https://www.facebook.com/xbooks' }, { category: 'bookshop', location: 'Malabe' }, 'osm');
    expect(n?.website).toBeNull();
    expect(n?.socials[0]).toMatchObject({ platform: 'facebook', url: 'https://www.facebook.com/xbooks' });
  });
  it('drops records without a name', () => {
    expect(normalizeRaw({ sourceRecordId: '3', name: '   ' }, { category: 'x', location: 'y' }, 'osm')).toBeNull();
  });
});
