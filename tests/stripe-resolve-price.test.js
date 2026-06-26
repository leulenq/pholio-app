// tests/stripe-resolve-price.test.js
const config = require('../src/config');
const { resolvePriceId } = require('../src/shared/lib/stripe');

describe('resolvePriceId', () => {
  const original = { ...config.stripe };
  afterEach(() => { Object.assign(config.stripe, original); });

  test('annual interval resolves to the annual price', () => {
    config.stripe.priceIdAnnual = 'price_annual_x';
    config.stripe.priceIdMonthly = 'price_monthly_x';
    expect(resolvePriceId('annual')).toBe('price_annual_x');
  });

  test('monthly interval resolves to the monthly price', () => {
    config.stripe.priceIdMonthly = 'price_monthly_x';
    expect(resolvePriceId('monthly')).toBe('price_monthly_x');
  });

  test('missing interval defaults to monthly', () => {
    config.stripe.priceIdMonthly = 'price_monthly_x';
    expect(resolvePriceId(undefined)).toBe('price_monthly_x');
  });

  test('unsupported intervals default to monthly', () => {
    config.stripe.priceIdMonthly = 'price_monthly_x';
    expect(resolvePriceId('weekly')).toBe('price_monthly_x');
  });

  test('monthly falls back to legacy priceId when priceIdMonthly unset', () => {
    config.stripe.priceIdMonthly = undefined;
    config.stripe.priceId = 'price_legacy';
    expect(resolvePriceId('monthly')).toBe('price_legacy');
  });

  test('throws a clear error when the resolved price is missing', () => {
    config.stripe.priceIdMonthly = undefined;
    config.stripe.priceId = undefined;
    expect(() => resolvePriceId('monthly')).toThrow(/monthly price/i);
  });

  test('throws a clear error when annual price is missing', () => {
    config.stripe.priceIdAnnual = undefined;
    expect(() => resolvePriceId('annual')).toThrow(/annual price/i);
  });
});
