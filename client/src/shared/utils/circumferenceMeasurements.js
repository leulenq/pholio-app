const CM_PER_INCH = 2.54;

/**
 * Technical data-sanity bounds only. These are intentionally much broader than
 * adult fashion sample ranges so the profile never treats a body type, age, or
 * booking division as invalid.
 *
 * The endpoints are chosen to map cleanly to the imperial tape:
 * 8 in rounds to 20 cm in integer storage; 100 in is exactly 254 cm.
 */
export const CIRCUMFERENCE_RANGE_CM = Object.freeze({
  min: 20,
  max: 254,
});

const clampCircumferenceCm = (value) =>
  Math.max(CIRCUMFERENCE_RANGE_CM.min, Math.min(CIRCUMFERENCE_RANGE_CM.max, value));

const roundToHalf = (value) => Math.round(value * 2) / 2;

export const circumferenceTapeConfig = (unitSystem) =>
  unitSystem === 'imperial'
    ? { min: 8, max: 100, step: 0.5, majorStep: 2, unit: 'in' }
    : {
        min: CIRCUMFERENCE_RANGE_CM.min,
        max: CIRCUMFERENCE_RANGE_CM.max,
        step: 1,
        majorStep: 10,
        unit: 'cm',
      };

export const circumferenceToDisplay = (centimeters, unitSystem) => {
  if (centimeters === null || centimeters === undefined || centimeters === '') return null;

  const numericCentimeters = Number(centimeters);
  if (!Number.isFinite(numericCentimeters)) return null;

  return unitSystem === 'imperial'
    ? roundToHalf(numericCentimeters / CM_PER_INCH)
    : Math.round(numericCentimeters);
};

export const circumferenceToCentimeters = (value, unitSystem) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;

  const centimeters =
    unitSystem === 'imperial' ? Math.round(numericValue * CM_PER_INCH) : Math.round(numericValue);

  return clampCircumferenceCm(centimeters);
};
