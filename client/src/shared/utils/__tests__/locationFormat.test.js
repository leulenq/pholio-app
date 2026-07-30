import { normalizeLocation, formatLocation } from '../locationFormat';

describe('locationFormat utilities', () => {
  describe('normalizeLocation', () => {
    it('returns empty structure for empty input', () => {
      expect(normalizeLocation('')).toEqual({ city: '', region: '', regionCode: '', country: '', countryCode: '' });
      expect(normalizeLocation(null)).toEqual({ city: '', region: '', regionCode: '', country: '', countryCode: '' });
    });

    it('normalizes U.S. city with state name', () => {
      const result = normalizeLocation('Los Angeles, California, United States');
      expect(result.city).toBe('Los Angeles');
      expect(result.regionCode).toBe('CA');
      expect(result.countryCode).toBe('US');
    });

    it('normalizes U.S. city with state abbreviation', () => {
      const result = normalizeLocation('New York, NY');
      expect(result.city).toBe('New York');
      expect(result.regionCode).toBe('NY');
      expect(result.countryCode).toBe('US');
    });

    it('normalizes International city with country', () => {
      const result = normalizeLocation('Paris, France');
      expect(result.city).toBe('Paris');
      expect(result.country).toBe('France');
    });

    it('normalizes object input', () => {
      const result = normalizeLocation({ city: 'Miami', region: 'Florida', country: 'United States' });
      expect(result.city).toBe('Miami');
      expect(result.regionCode).toBe('FL');
      expect(result.countryCode).toBe('US');
    });
  });

  describe('formatLocation', () => {
    it('formats U.S. city with state as City, ST', () => {
      expect(formatLocation('New York, NY')).toBe('New York, NY');
      expect(formatLocation('Los Angeles, California, United States')).toBe('Los Angeles, CA');
      expect(formatLocation({ city: 'Miami', region: 'Florida', country: 'United States' })).toBe('Miami, FL');
    });

    it('does not invent state data if only City, United States is known and state cannot be resolved', () => {
      expect(formatLocation({ city: 'UnknownCity', country: 'United States' })).toBe('UnknownCity, United States');
    });

    it('formats International city as City, Country', () => {
      expect(formatLocation('Paris, France')).toBe('Paris, France');
      expect(formatLocation('Milan, Italy')).toBe('Milan, Italy');
      expect(formatLocation({ city: 'Tokyo', country: 'Japan' })).toBe('Tokyo, Japan');
    });
  });
});
