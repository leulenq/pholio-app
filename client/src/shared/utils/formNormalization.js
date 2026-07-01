import {
  normalizeBookingLaneList,
  normalizeBookingLaneSlug
} from '../constants/bookingLanes';
import { normalizePhoneInput } from '../lib/phone-format';
import { SENSITIVE_MEASUREMENT_FIELDS } from './talentAge';

/**
 * Traverses an object or array recursively, converting empty strings or whitespace-only
 * strings to null (except for specified excluded keys).
 */
export function nullClear(obj, excludeKeys = ['first_name', 'last_name', 'email']) {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (item === '') return null;
      if (typeof item === 'string' && item.trim() === '') return null;
      if (typeof item === 'object') return nullClear(item, excludeKeys);
      return item;
    });
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (excludeKeys.includes(key)) {
        cleaned[key] = value;
      } else if (value === '') {
        cleaned[key] = null;
      } else if (typeof value === 'string' && value.trim() === '') {
        cleaned[key] = null;
      } else if (typeof value === 'object') {
        cleaned[key] = nullClear(value, excludeKeys);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  return obj;
}

export function parseJsonMaybeArray(value) {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function toArrayField(value) {
  const parsedValue = parseJsonMaybeArray(value);
  if (Array.isArray(parsedValue)) return parsedValue;
  if (typeof parsedValue === 'string') {
    const trimmed = parsedValue.trim();
    if (!trimmed) return [];
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function toDateInputValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
}

export function normalizeEmergencyPhone(raw) {
  if (raw == null || typeof raw !== 'string') return raw;
  const normalized = normalizePhoneInput(raw);
  return normalized === '' ? null : normalized;
}

export function toFormBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) return defaultValue;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return defaultValue;
}

export function toFormTriStateBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || value === 1 || value === 'Yes' || value === 'yes') return true;
  if (value === false || value === 0 || value === 'No' || value === 'no') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

export function deriveRepresentationStatus(profile) {
  const seeking = toFormBoolean(profile.seeking_representation, false);
  const agency =
    (Array.isArray(profile.representations) && profile.representations.length > 0) ||
    (profile.current_agency && String(profile.current_agency).trim());
  if (seeking) return 'seeking';
  if (agency) return 'represented';
  return 'not_seeking';
}

export function toPreviousRepresentationsText(value) {
  const parsedValue = parseJsonMaybeArray(value);
  if (Array.isArray(parsedValue)) {
    return parsedValue
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .filter(Boolean)
      .join('\n');
  }
  if (parsedValue && typeof parsedValue === 'object') {
    return JSON.stringify(parsedValue);
  }
  return typeof parsedValue === 'string' ? parsedValue : '';
}

export function resolveBookingLaneFields(profile = {}) {
  const legacyLanes = normalizeBookingLaneList(profile.modeling_categories);
  const primary =
    normalizeBookingLaneSlug(profile.booking_primary_lane) ||
    legacyLanes[0] ||
    null;
  const secondary = normalizeBookingLaneList(
    profile.booking_secondary_lanes || legacyLanes.slice(1),
  ).filter((laneSlug) => laneSlug !== primary);

  return {
    booking_primary_lane: primary,
    booking_secondary_lanes: secondary.slice(0, 3),
    modeling_categories: legacyLanes,
  };
}

/**
 * Normalizes backend profile data into frontend form values.
 * Fills nullable/undefined text fields with empty strings to prevent uncontrolled input warnings.
 */
export function normalizeProfileForForm(profile = {}) {
  const bookingLaneFields = resolveBookingLaneFields(profile);
  return {
    ...profile,
    bio: profile.bio_raw || profile.bio || '',
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    email: profile.email || '',

    city: profile.city ? String(profile.city) : '',
    city_secondary: profile.city_secondary ? String(profile.city_secondary) : '',
    gender: profile.gender ? String(profile.gender) : '',
    pronouns: profile.pronouns ? String(profile.pronouns) : '',
    date_of_birth: toDateInputValue(profile.date_of_birth) || '',
    ethnicity: toArrayField(profile.ethnicity),
    nationality: profile.nationality ? String(profile.nationality) : '',
    place_of_birth: profile.place_of_birth ? String(profile.place_of_birth) : '',
    timezone: profile.timezone ? String(profile.timezone) : '',

    // Details
    dress_size: profile.dress_size ? String(profile.dress_size) : '',
    suit_size: profile.suit_size ? String(profile.suit_size) : '',
    hair_length: profile.hair_length ? String(profile.hair_length) : '',
    hair_color: profile.hair_color ? String(profile.hair_color) : '',
    hair_type: profile.hair_type ? String(profile.hair_type) : '',
    eye_color: profile.eye_color ? String(profile.eye_color) : '',
    skin_tone: profile.skin_tone ? String(profile.skin_tone) : '',
    body_type: profile.body_type ? String(profile.body_type) : '',

    // Professional
    work_status: profile.work_status ? String(profile.work_status) : '',
    availability_schedule: profile.availability_schedule ? String(profile.availability_schedule) : '',
    current_agency: profile.current_agency ? String(profile.current_agency) : '',
    representations: Array.isArray(profile.representations)
      ? profile.representations.map((representation) => ({
          ...representation,
          started_on: toDateInputValue(representation.started_on) || '',
        }))
      : [],
    union_membership: toArrayField(profile.union_membership),
    comfort_levels: toArrayField(profile.comfort_levels),
    ...bookingLaneFields,
    experience_details: profile.experience_details
      ? (typeof profile.experience_details === 'string'
          ? parseJsonMaybeArray(profile.experience_details)
          : profile.experience_details)
      : '',
    previous_representations: toPreviousRepresentationsText(profile.previous_representations) || '',
    emergency_contact_name: profile.emergency_contact_name ? String(profile.emergency_contact_name) : '',
    emergency_contact_phone: profile.emergency_contact_phone ? String(profile.emergency_contact_phone) : '',
    emergency_contact_relationship: profile.emergency_contact_relationship ? String(profile.emergency_contact_relationship) : '',

    representation_status: deriveRepresentationStatus(profile),

    seeking_representation: toFormBoolean(profile.seeking_representation, false),
    tattoos: toFormBoolean(profile.tattoos, false),
    piercings: toFormBoolean(profile.piercings, false),
    work_eligibility: toFormTriStateBoolean(profile.work_eligibility),
    passport_ready: toFormBoolean(profile.passport_ready, false),
    availability_travel: toFormBoolean(profile.availability_travel, false),
    drivers_license: toFormBoolean(profile.drivers_license, false),
    bust: profile.bust_cm ? Number(profile.bust_cm) : '',
    chest_cm: profile.chest_cm ? Number(profile.chest_cm) : '',
    waist: profile.waist_cm ? Number(profile.waist_cm) : '',
    hips: profile.hips_cm ? Number(profile.hips_cm) : '',

    training_summary: profile.training || '',
    experience_level: profile.experience_level ? String(profile.experience_level) : '',

    languages: toArrayField(profile.languages),
    specialties: toArrayField(profile.specialties),

    guardian_consent_recorded: Boolean(profile.guardian_consent_at),
    guardian_email: profile.guardian_email ? String(profile.guardian_email) : '',
    guardian_consent_status:
      profile.guardian_consent_status ||
      (profile.guardian_consent_at ? 'verified' : 'none'),
    work_permit_on_file: toFormBoolean(profile.work_permit_on_file, false),

    // Discipline & Stats Track (NEW)
    discipline: profile.discipline ? String(profile.discipline) : '',
    stats_track: profile.stats_track ? String(profile.stats_track) : '',
  };
}

/**
 * Normalizes frontend form values into backend-safe payloads.
 * Automatically cleans/nullifies empty fields using nullClear.
 */
export function normalizeProfileForSave(formData, measurementsLocked = false) {
  const payload = { ...formData };
  delete payload.hero_image_path;

  const repStatus = payload.representation_status;
  delete payload.representation_status;

  const representations = Array.isArray(payload.representations)
    ? payload.representations.map((representation) => ({
        id: representation.id || undefined,
        agency_id: representation.agency_id || null,
        external_agency_name: representation.agency_id
          ? null
          : representation.external_agency_name?.trim() || null,
        relationship_type: representation.relationship_type,
        market: representation.market?.trim() || null,
        territory: representation.territory?.trim() || null,
        division: representation.division?.trim() || null,
        is_exclusive: Boolean(representation.is_exclusive),
        started_on: representation.started_on || null,
      }))
    : [];
  delete payload.representations;
  delete payload.representation_history;
  delete payload.current_agency;

  if (repStatus === 'seeking') {
    payload.seeking_representation = true;
  } else if (repStatus === 'represented') {
    payload.seeking_representation = false;
  } else if (repStatus === 'not_seeking') {
    payload.seeking_representation = false;
  }

  if (typeof payload.languages === 'string') {
    payload.languages = payload.languages.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof payload.specialties === 'string') {
    payload.specialties = payload.specialties.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof payload.training_summary === 'string') {
    payload.training = payload.training_summary;
  }

  // Handle bust vs chest mapping based on stats_track
  if (payload.stats_track === 'Menswear' || payload.stats_track === 'Ungendered') {
    // For menswear/ungendered, chest_cm is primary
    if (payload.chest_cm) {
      payload.chest_cm = Number(payload.chest_cm);
    }
    delete payload.bust; // Remove form-only field
  } else {
    // For womenswear (default), bust_cm is primary
    if (payload.bust) {
      payload.bust_cm = Number(payload.bust);
    }
    delete payload.chest_cm; // Remove for non-menswear
    delete payload.bust; // Remove form-only field
  }

  ['ethnicity', 'comfort_levels', 'modeling_categories', 'booking_secondary_lanes', 'union_membership'].forEach(field => {
    if (typeof payload[field] === 'string') {
      try {
        payload[field] = JSON.parse(payload[field]);
      } catch {
        payload[field] = payload[field]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      }
    }
  });

  payload.booking_primary_lane = normalizeBookingLaneSlug(payload.booking_primary_lane);
  payload.booking_secondary_lanes = normalizeBookingLaneList(payload.booking_secondary_lanes)
    .filter((laneSlug) => laneSlug !== payload.booking_primary_lane)
    .slice(0, 3);
  payload.modeling_categories = [
    payload.booking_primary_lane,
    ...payload.booking_secondary_lanes,
  ].filter(Boolean);

  if (typeof payload.previous_representations === 'string') {
    const trimmedRepresentations = payload.previous_representations.trim();
    if (!trimmedRepresentations) {
      payload.previous_representations = [];
    } else {
      try {
        payload.previous_representations = JSON.parse(trimmedRepresentations);
      } catch {
        payload.previous_representations = trimmedRepresentations
          .split('\n')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
  }

  if (typeof payload.experience_details === 'string') {
    const trimmedExperience = payload.experience_details.trim();
    if (!trimmedExperience) {
      payload.experience_details = [];
    } else {
      try {
        payload.experience_details = JSON.parse(trimmedExperience);
      } catch {
        payload.experience_details = trimmedExperience
          .split('\n')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
  }

  if (measurementsLocked) {
    for (const field of SENSITIVE_MEASUREMENT_FIELDS) {
      delete payload[field];
    }
    delete payload.height_cm;
    delete payload.weight_kg;
    delete payload.shoe_size;
  }

  // Finally, clear empty strings to null except for key required fields
  const finalPayload = nullClear(payload, ['first_name', 'last_name', 'email']);

  return { payload, representations, finalPayload };
}
