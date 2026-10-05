import { FAMILY } from './fonts';

/**
 * CSS for a card font spec:
 * { family, weight, style, size (pt), tracking (em), stretch (%), opsz,
 *   caps: 'upper'|'small'|null, features: [], numeric: 'tabular'|'oldstyle'|'lining' }
 */
export function textStyle(f) {
  const features = ['"kern" 1', ...(f.features || [])];
  const numeric = [];
  if (f.numeric === 'tabular') numeric.push('tabular-nums', 'lining-nums');
  if (f.numeric === 'oldstyle') numeric.push('oldstyle-nums', 'proportional-nums');
  if (f.numeric === 'lining') numeric.push('lining-nums');
  const variation = [];
  if (f.opsz) variation.push(`"opsz" ${f.opsz}`);
  for (const [axis, v] of Object.entries(f.axes || {})) variation.push(`"${axis}" ${v}`);
  return {
    fontFamily: FAMILY[f.family] || f.family,
    fontWeight: f.weight || 400,
    fontStyle: f.style || 'normal',
    fontSize: `${f.size}pt`,
    fontStretch: f.stretch ? `${f.stretch}%` : undefined,
    letterSpacing: f.tracking ? `${f.tracking}em` : undefined,
    textTransform: f.caps === 'upper' ? 'uppercase' : undefined,
    fontVariantCaps: f.caps === 'small' ? 'all-small-caps' : undefined,
    fontVariantNumeric: numeric.length ? numeric.join(' ') : undefined,
    fontFeatureSettings: features.join(', '),
    fontVariationSettings: variation.length ? variation.join(', ') : undefined,
    fontOpticalSizing: f.opsz ? undefined : 'auto',
    fontKerning: 'normal',
    WebkitFontSmoothing: 'antialiased',
  };
}
