const { cleanString } = require('./sanitize');

function normalizeMeasurements(input) {
  const sanitized = cleanString(input);
  const digits = sanitized.replace(/[^0-9x-]/g, '');
  return digits.replace(/--+/g, '-').replace(/x/g, '-').replace(/^-+|-+$/g, '');
}

function curateBio(input, firstName, lastName) {
  const plain = cleanString(input).replace(/&/g, 'and');
  const name = `${firstName} ${lastName}`.trim();
  if (!plain) {
    return `${name} is represented by ZipSite.`;
  }
  const sentence = plain.replace(/\s+/g, ' ');
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!capitalized.endsWith('.')) {
    return `${capitalized}.`;
  }
  return capitalized;
}

module.exports = {
  normalizeMeasurements,
  curateBio
};
