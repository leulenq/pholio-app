function toFeetInches(cm) {
  if (!cm || Number.isNaN(Number(cm))) return '';
  // Round total inches once, then split, so 11.9" carries into the next
  // foot instead of rendering as N' 12".
  const totalInches = Math.round(Number(cm) / 2.54);
  const feet = Math.floor(totalInches / 12);
  const remaining = totalInches - feet * 12;
  return `${feet}' ${remaining}\"`;
}

module.exports = { toFeetInches };
