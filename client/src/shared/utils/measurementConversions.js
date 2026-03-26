/**
 * Measurement Conversion Utilities
 * Handles conversions between metric and imperial units
 */

export const cmToFeetInches = (cm) => {
  if (!cm) return { ft: '', in: '' };
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { ft: feet.toString(), in: inches.toString() };
};

export const feetInchesToCm = (ft, inch) => {
  const f = parseFloat(ft) || 0;
  const i = parseFloat(inch) || 0;
  if (f === 0 && i === 0) return '';
  return Math.round((f * 12 + i) * 2.54);
};

export const kgToLbs = (kg) => kg ? Math.round(kg * 2.20462) : '';

export const lbsToKg = (lbs) => lbs ? Math.round(lbs / 2.20462) : '';

export const cmToInches = (cm) => cm ? (cm / 2.54).toFixed(1) : '';

export const inchesToCm = (inches) => inches ? Math.round(parseFloat(inches) * 2.54) : '';

export const getShoeConversions = (size, region) => {
  if (!size) return '';
  const s = parseFloat(size);
  const conversions = {
    'US': { 'UK': s - 1, 'EU': (s * 2) + 31 },
    'UK': { 'US': s + 1, 'EU': (s * 2) + 33 },
    'EU': { 'US': (s - 31) / 2, 'UK': (s - 33) / 2 }
  };
  const converted = conversions[region];
  return `≈ ${Object.entries(converted).map(([r, val]) => `${r} ${val.toFixed(1)}`).join(', ')}`;
};

export const tryJsonJoin = (val) => {
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p.join(', ') : val;
  } catch {
    return val;
  }
};
