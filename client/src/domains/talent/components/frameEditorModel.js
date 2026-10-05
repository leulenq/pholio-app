/**
 * FrameEditor data model: option lists, row ↔ form mapping, and the
 * one-line rights summary. Pure, no React.
 */

export const LIBRARY_STATES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

/* Grouped by what the status does: the "Not usable" group is the set the
   server refuses to distribute (src/shared/lib/image-rights.js). */
export const RIGHTS_STATUS_GROUPS = [
  {
    label: 'Usable',
    options: [
      { value: 'pending', label: 'Pending review' },
      { value: 'cleared', label: 'Cleared' },
      { value: 'licensed', label: 'Licensed' },
      { value: 'owned', label: 'Owned' },
      { value: 'approved', label: 'Approved' },
    ],
  },
  {
    label: 'Not usable',
    options: [
      { value: 'restricted', label: 'Restricted' },
      { value: 'blocked', label: 'Blocked' },
      { value: 'denied', label: 'Denied' },
    ],
  },
];

export const BLOCKING_STATUSES = new Set(['restricted', 'blocked', 'denied', 'forbidden', 'unlicensed']);

const STATUS_LABELS = Object.fromEntries(
  RIGHTS_STATUS_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label])),
);

export const LICENSE_TYPES = [
  { value: 'owned', label: 'Owned by me' },
  { value: 'licensed', label: 'Licensed use' },
  { value: 'model_release', label: 'Model release' },
  { value: 'agency_permission', label: 'Agency permission' },
  { value: 'editorial_release', label: 'Editorial release' },
];

export const SIGNER_ROLES = [
  { value: 'self', label: 'Me' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'authorized_representative', label: 'Authorized representative' },
];

export const EMPTY_RIGHTS = {
  license_type: '',
  rights_status: '',
  copyright_owner: '',
  photographer_name: '',
  usage_scope: '',
  territory: '',
  start_at: '',
  expires_at: '',
  exclusive: false,
};

export const EMPTY_RELEASE = { release_url: '', signer_name: '', signer_role: '', signed_at: '' };

const text = (v) => (v == null ? '' : String(v));

export function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateInputToPayload(value) {
  if (!value || !String(value).trim()) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function readMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try { return JSON.parse(metadata); } catch { return {}; }
}

export function rightsFromRow(row = {}) {
  const r = row || {};
  return {
    license_type: text(r.license_type),
    rights_status: text(r.rights_status),
    copyright_owner: text(r.copyright_owner),
    photographer_name: text(r.photographer_name),
    usage_scope: text(r.usage_scope),
    territory: text(r.territory),
    start_at: isoToDateInput(r.start_at),
    expires_at: isoToDateInput(r.expires_at),
    exclusive: !!r.exclusive,
  };
}

export function releaseFromRow(row = {}) {
  const r = row || {};
  return {
    release_url: text(r.release_url || r.release_ref),
    signer_name: text(r.signer_name),
    signer_role: text(r.signer_role),
    signed_at: isoToDateInput(r.signed_at),
  };
}

function daysUntil(dateInput, now = new Date()) {
  const iso = dateInputToPayload(dateInput);
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000);
}

export function expiryLine(dateInput) {
  const days = daysUntil(dateInput);
  if (days == null) return null;
  if (days < 0) return { text: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, alert: true };
  if (days === 0) return { text: 'Expires today', alert: true };
  return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, alert: days <= 14 };
}

/** One quiet line describing the rights record, shown on the closed row. */
export function rightsSummary(rights, releaseOnFile) {
  const parts = [];
  if (rights.rights_status) parts.push(STATUS_LABELS[rights.rights_status] || rights.rights_status);
  const license = LICENSE_TYPES.find((l) => l.value === rights.license_type);
  if (license && license.label !== parts[0]) parts.push(license.label);
  if (releaseOnFile) parts.push('Release on file');
  const exp = expiryLine(rights.expires_at);
  if (exp) parts.push(exp.text);
  return {
    text: parts.length ? parts.join(' · ') : 'None recorded',
    alert: BLOCKING_STATUSES.has(rights.rights_status) || !!exp?.alert,
  };
}
