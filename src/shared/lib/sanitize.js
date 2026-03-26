const validator = require('validator');

function cleanString(value) {
  if (typeof value !== 'string') return '';
  return validator.stripLow(value.trim(), true);
}

module.exports = {
  cleanString
};
