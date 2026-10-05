import { describe, expect, it } from 'vitest';
import { buildContact, buildStats, feetInches, inches, resolveTrack } from '../model/content';

describe('stats', () => {
  it('formats heights with true primes', () => {
    expect(feetInches(178)).toBe('5′10″');
    expect(feetInches(182.9)).toBe('6′0″');
    expect(feetInches(176)).toBe('5′9½″');
  });
  it('rounds circumferences to the half inch', () => {
    expect(inches(61)).toBe('24');
    expect(inches(88)).toBe('34½');
  });
  it('uses the womenswear set when the data says so, whatever gender says', () => {
    expect(resolveTrack({ gender: 'Male', dress_size: '4', hips_cm: 88 })).toBe('women');
    expect(resolveTrack({ gender: 'Female', stats_track: 'menswear' })).toBe('men');
    expect(resolveTrack({ date_of_birth: '2016-01-01' })).toBe('kids');
  });
  it('builds a menswear card with a derived suit size and dual-unit shoes', () => {
    const s = buildStats({ height_cm: 188, chest_cm: 99, waist_cm: 79, inseam_cm: 84, shoe_size: '11', shoe_region: 'US', gender: 'Male' }, { units: 'imperial' });
    expect(s.items.map((i) => i.key)).toEqual(['height', 'chest', 'waist', 'inseam', 'suit', 'shoes']);
    expect(s.items.find((i) => i.key === 'suit').value).toBe('39L');
    expect(s.items.find((i) => i.key === 'shoes').alt).toBe('EU 44');
  });
  it('never prints weight, age or an "Other" placeholder', () => {
    const s = buildStats({ height_cm: 170, weight_kg: 60, date_of_birth: '1990-01-01', eye_color: 'Other', hair_color: 'black', gender: 'Female' });
    const text = JSON.stringify(s.items);
    expect(text).not.toMatch(/weight|age|other/i);
  });
  it('kids cards drop bust, waist and hips', () => {
    const s = buildStats({ height_cm: 140, bust_cm: 70, waist_cm: 60, hips_cm: 72, date_of_birth: '2016-01-01' });
    expect(s.items.map((i) => i.key)).not.toContain('bust');
  });
});

describe('contact', () => {
  it('routes represented talent through the agency', () => {
    const c = buildContact({ profile: {}, agency: { name: 'Next', website: 'https://www.nextmanagement.com/' }, email: 'me@x.com' });
    expect(c.mode).toBe('agency');
    expect(c.lines).toContain('nextmanagement.com');
    expect(JSON.stringify(c)).not.toContain('me@x.com');
  });
  it('never prints a minor’s phone, and labels the guardian contact', () => {
    const c = buildContact({ profile: { date_of_birth: '2014-01-01', phone: '5551234567' }, email: 'parent@x.com' }, { showPhone: true });
    expect(c.label).toBe('Guardian contact');
    expect(c.lines.join(' ')).not.toMatch(/555/);
  });
});
