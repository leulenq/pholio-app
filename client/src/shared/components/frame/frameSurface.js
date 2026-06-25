/** Map surface prop → BEM prefix for taxonomy label chips. */
export function surfacePrefix(surface) {
  if (surface === 'mw-frame') return 'mw-frame';
  if (surface === 'crs') return 'crs';
  return 'frame';
}

export function signalClass(prefix, partKey) {
  return `${prefix}-read-signal ${prefix}-read-signal--${partKey}`;
}
