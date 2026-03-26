function toFeetInches(cm) {
  if (!cm || Number.isNaN(Number(cm))) return '';
  const inches = Math.round((Number(cm) / 2.54) * 10) / 10;
  const feet = Math.floor(inches / 12);
  const remaining = Math.round(inches - feet * 12);
  return `${feet}' ${remaining}\"`;
}

module.exports = { toFeetInches };
