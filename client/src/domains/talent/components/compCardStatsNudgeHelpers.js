function isPresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

export function getMissingCompCardStats(profile) {
  const missing = [];
  if (!isPresent(profile?.eye_color)) missing.push('eye');
  if (!isPresent(profile?.hair_color)) missing.push('hair');
  if (!isPresent(profile?.shoe_size)) missing.push('shoe');
  return missing;
}

export function compCardStatsNudgeCopy(missing) {
  if (!missing.length) return null;

  const hasEye = missing.includes('eye');
  const hasHair = missing.includes('hair');
  const hasShoe = missing.includes('shoe');

  if (hasEye && hasHair && !hasShoe) {
    return 'Add eye and hair color so your card matches agency stats sheets.';
  }
  if (!hasEye && !hasHair && hasShoe) {
    return 'Your comp card stats block is missing shoe size.';
  }
  if (hasEye && !hasHair && !hasShoe) {
    return 'Your comp card stats block is missing eye color.';
  }
  if (!hasEye && hasHair && !hasShoe) {
    return 'Your comp card stats block is missing hair color.';
  }
  if (hasEye && hasHair && hasShoe) {
    return 'Add eye and hair color and shoe size so your card matches agency stats sheets.';
  }
  if (hasEye && !hasHair && hasShoe) {
    return 'Your comp card stats block is missing eye color and shoe size.';
  }
  if (!hasEye && hasHair && hasShoe) {
    return 'Your comp card stats block is missing hair color and shoe size.';
  }
  return 'Add appearance details so your card matches agency stats sheets.';
}
