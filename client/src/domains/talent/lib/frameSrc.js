/**
 * Where a stored photograph is actually served from.
 *
 * Images arrive from the API in three shapes depending on how they were
 * stored: an absolute URL from object storage (`public_url`), a path the app
 * already serves (`/uploads/…`), or a bare filename from the local uploader.
 * Every surface that draws a thumbnail has to resolve the same three cases,
 * and it is not a judgement call — so it lives once, here, rather than being
 * retyped beside each thumbnail.
 *
 * Returns an empty string when there is nothing to draw, so callers decide
 * what an absent photograph looks like instead of being handed a broken one.
 *
 * @param {{ public_url?: string, path?: string }|null|undefined} image
 * @returns {string}
 */
export function frameSrc(image) {
  const value = image?.public_url || image?.path || '';
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}

export default frameSrc;
