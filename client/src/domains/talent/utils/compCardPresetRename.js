export function buildCompCardPresetRenamePayload(preset, nextName) {
  const name = String(nextName || '').trim();
  if (!name) {
    throw new Error('Enter a name for this saved card.');
  }

  return {
    ...(preset?.payload || {}),
    name,
  };
}
