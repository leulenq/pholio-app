import { formatPhoneDisplay, normalizePhoneInput } from '../phone-format';

describe('Phone Number Auto-Formatting & Normalization', () => {
  describe('US Phone Numbers', () => {
    test('formats 10-digit US number without country code', () => {
      expect(formatPhoneDisplay('2125550199')).toBe('(212) 555-0199');
    });

    test('formats progressive US number typing', () => {
      expect(formatPhoneDisplay('2')).toBe('(2');
      expect(formatPhoneDisplay('212')).toBe('(212');
      expect(formatPhoneDisplay('212555')).toBe('(212) 555');
      expect(formatPhoneDisplay('2125550')).toBe('(212) 555-0');
      expect(formatPhoneDisplay('2125550199')).toBe('(212) 555-0199');
    });

    test('formats 11-digit US number starting with 1', () => {
      expect(formatPhoneDisplay('12125550199')).toBe('+1 (212) 555-0199');
    });

    test('formats US number with explicit +1', () => {
      expect(formatPhoneDisplay('+12125550199')).toBe('+1 (212) 555-0199');
      expect(formatPhoneDisplay('+1 (212) 555-0199')).toBe('+1 (212) 555-0199');
    });
  });

  describe('International Phone Numbers', () => {
    test('formats UK phone number (+44)', () => {
      expect(formatPhoneDisplay('+447911123456')).toBe('+44 7911 123456');
    });

    test('formats France phone number (+33)', () => {
      expect(formatPhoneDisplay('+33142685300')).toBe('+33 1 42 68 53 00');
    });

    test('formats Australia phone number (+61)', () => {
      expect(formatPhoneDisplay('+61412345678')).toBe('+61 412 345 678');
    });

    test('formats India phone number (+91)', () => {
      expect(formatPhoneDisplay('+919876543210')).toBe('+91 98765 43210');
    });

    test('formats Japan phone number (+81)', () => {
      expect(formatPhoneDisplay('+819012345678')).toBe('+81 90 1234 5678');
    });

    test('formats Germany phone number (+49)', () => {
      expect(formatPhoneDisplay('+493012345678')).toBe('+49 30 12345678');
    });
  });

  describe('Phone Normalization', () => {
    test('normalizes formatted US number to dialable digits', () => {
      expect(normalizePhoneInput('(212) 555-0199')).toBe('2125550199');
    });

    test('preserves leading + on international normalization', () => {
      expect(normalizePhoneInput('+1 (212) 555-0199')).toBe('+12125550199');
      expect(normalizePhoneInput('+44 7911 123456')).toBe('+447911123456');
    });

    test('handles empty / null values', () => {
      expect(normalizePhoneInput('')).toBe('');
      expect(normalizePhoneInput(null)).toBe('');
      expect(formatPhoneDisplay('')).toBe('');
      expect(formatPhoneDisplay(null)).toBe('');
    });
  });
});
