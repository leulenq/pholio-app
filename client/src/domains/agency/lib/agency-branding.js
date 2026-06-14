/** Default agency workspace accent (matches Pholio gold when unset). */
export const DEFAULT_AGENCY_BRAND = '#C9A55A';

/** Pholio platform gold — never overridden by agency branding. */
export const PHOLIO_PLATFORM_GOLD = '#C9A55A';

export function normalizeBrandHex(color) {
  const raw = String(color || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) return null;
  return raw.toUpperCase();
}

export function isCustomBrandColor(color) {
  const hex = normalizeBrandHex(color);
  return hex != null && hex !== DEFAULT_AGENCY_BRAND.toUpperCase();
}

export function resolveAgencyLogoUrl(profile) {
  const raw = profile?.agency_logo_path || profile?.logo_path;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Bind agency accent to the workspace shell only — never touches Pholio platform tokens.
 * Sets --agency-primary on .ag-shell (sidebar background tint, primary buttons, etc.).
 */
export function applyAgencyBrandTheme(brandColor, shellEl) {
  const shell = shellEl || document.querySelector('.ag-shell');
  if (!shell) return;

  if (!isCustomBrandColor(brandColor)) {
    shell.style.removeProperty('--agency-primary');
    shell.removeAttribute('data-agency-branded');
    return;
  }

  shell.style.setProperty('--agency-primary', normalizeBrandHex(brandColor));
  shell.setAttribute('data-agency-branded', 'true');
}

const AGENCY_LOGO_MIMES = new Set(['image/png', 'image/svg+xml']);
const AGENCY_LOGO_EXTS = ['.png', '.svg'];

export function validateAgencyLogoFile(file) {
  if (!file) return 'No file selected';
  const name = file.name?.toLowerCase() || '';
  const ext = AGENCY_LOGO_EXTS.find((suffix) => name.endsWith(suffix));
  if (!ext || !AGENCY_LOGO_MIMES.has(file.type)) {
    return 'Logo must be a PNG or SVG file (transparent backgrounds supported).';
  }
  return null;
}
