import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { motion } from 'framer-motion';
import { Menu, X, Camera } from 'lucide-react';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { profileSchema } from '../../../../schemas/profileSchema';
import {
  PholioInput,
  PholioToggle,
  PholioTextarea
} from '../../../../shared/components/ui/forms';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import PholioMultiSelect from '../../../../shared/components/ui/forms/PholioMultiSelect';
import PholioTagInput from '../../../../shared/components/ui/forms/PholioTagInput';
import CreditsEditor from '../../../../shared/components/ui/forms/CreditsEditor';
import { Controller } from 'react-hook-form';
import ProfileNav from '../../components/ProfileNav';
import ProfileStrengthSidebar from '../../components/ProfileStrengthSidebar';
import { calculateProfileStrength } from '../../../../shared/utils/profileScoring';
import {
  Section,
  RepresentationSection
} from '../../components/profile-index';
import { cmToFeetInches } from '../../../../shared/utils/measurementConversions';
import { normalizePhoneInput } from '../../../../shared/lib/phone-format';
import { IdentitySection } from './IdentitySection';
import { MeasurementsSection } from './MeasurementsSection';
import { SocialSection } from './SocialSection';
import WritingAssistToolbar from '../../../../shared/components/writing/WritingAssistToolbar';
import { parseApiFailure } from '../../../../shared/lib/api-error-message';
import { useReferenceLanguages } from '../../../../shared/hooks/useReferenceLanguages';
import { flushProfileFormForSave } from './flushProfileFormForSave';
import {
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} from '../../../../shared/utils/talentAge';
import {
  BOOKING_LANES,
  BOOKING_LANE_BY_SLUG,
  normalizeBookingLaneList,
  normalizeBookingLaneSlug,
} from '../../../../shared/constants/bookingLanes';

import styles from './ProfilePage.module.css';

function parseJsonMaybeArray(value) {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function toArrayField(value) {
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

function toDateInputValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
}

function normalizeEmergencyPhone(raw) {
  if (raw == null || typeof raw !== 'string') return raw;
  const normalized = normalizePhoneInput(raw);
  return normalized === '' ? null : normalized;
}

function deriveRepresentationStatus(profile) {
  const seeking = toFormBoolean(profile.seeking_representation, false);
  const agency = profile.current_agency && String(profile.current_agency).trim();
  if (seeking) return 'seeking';
  if (agency) return 'represented';
  return 'not_seeking';
}

function toPreviousRepresentationsText(value) {
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

function resolveBookingLaneFields(profile = {}) {
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

function toFormBoolean(value, defaultValue = false) {
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

function toFormTriStateBoolean(value) {
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

function normalizeProfileForForm(profile = {}) {
  const bookingLaneFields = resolveBookingLaneFields(profile);
  return {
    ...profile,
    // Map backend fields to frontend Zod schema
    // Explicitly clean nullable text fields to avoid validation errors
    bio: profile.bio_raw || profile.bio || '',
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    email: profile.email || '',

    city: profile.city ? String(profile.city) : null,
    city_secondary: profile.city_secondary ? String(profile.city_secondary) : null,
    gender: profile.gender ? String(profile.gender) : null,
    pronouns: profile.pronouns ? String(profile.pronouns) : null,
    date_of_birth: toDateInputValue(profile.date_of_birth),
    ethnicity: toArrayField(profile.ethnicity),
    nationality: profile.nationality ? String(profile.nationality) : null,
    place_of_birth: profile.place_of_birth ? String(profile.place_of_birth) : null,
    timezone: profile.timezone ? String(profile.timezone) : null,

    // Details
    dress_size: profile.dress_size ? String(profile.dress_size) : null,
    hair_length: profile.hair_length ? String(profile.hair_length) : null,
    hair_color: profile.hair_color ? String(profile.hair_color) : null,
    hair_type: profile.hair_type ? String(profile.hair_type) : null,
    eye_color: profile.eye_color ? String(profile.eye_color) : null,
    skin_tone: profile.skin_tone ? String(profile.skin_tone) : null,
    body_type: profile.body_type ? String(profile.body_type) : null,

    // Professional
    work_status: profile.work_status ? String(profile.work_status) : null,
    availability_schedule: profile.availability_schedule ? String(profile.availability_schedule) : null,
    current_agency: profile.current_agency ? String(profile.current_agency) : null,
    union_membership: toArrayField(profile.union_membership),
    comfort_levels: toArrayField(profile.comfort_levels),
    ...bookingLaneFields,
    // Maintain JSON array or string structure for CreditsEditor
    experience_details: profile.experience_details
      ? (typeof profile.experience_details === 'string'
          ? parseJsonMaybeArray(profile.experience_details)
          : profile.experience_details)
      : null,
    previous_representations: toPreviousRepresentationsText(profile.previous_representations),
    emergency_contact_name: profile.emergency_contact_name ? String(profile.emergency_contact_name) : null,
    emergency_contact_phone: profile.emergency_contact_phone ? String(profile.emergency_contact_phone) : null,
    emergency_contact_relationship: profile.emergency_contact_relationship ? String(profile.emergency_contact_relationship) : null,

    representation_status: deriveRepresentationStatus(profile),

    // Preserve nulls for completeness checks
    seeking_representation: toFormBoolean(profile.seeking_representation, false),
    tattoos: toFormBoolean(profile.tattoos, false),
    piercings: toFormBoolean(profile.piercings, false),
    work_eligibility: toFormTriStateBoolean(profile.work_eligibility),
    passport_ready: toFormBoolean(profile.passport_ready, false),
    availability_travel: toFormBoolean(profile.availability_travel, false),
    drivers_license: toFormBoolean(profile.drivers_license, false),
    // Ensure measurements are numbers for the inputs (backend sends numbers now)
    bust: profile.bust_cm ? Number(profile.bust_cm) : null,
    waist: profile.waist_cm ? Number(profile.waist_cm) : null,
    hips: profile.hips_cm ? Number(profile.hips_cm) : null,

    // Map backend fields to frontend names
    training_summary: profile.training || '', // Map 'training' col to 'training_summary'
    experience_level: profile.experience_level ? String(profile.experience_level) : null,

    // Keep tag/array fields for multi-select rendering
    languages: toArrayField(profile.languages),
    specialties: toArrayField(profile.specialties),

    guardian_consent_recorded: Boolean(profile.guardian_consent_at),
    work_permit_on_file: toFormBoolean(profile.work_permit_on_file, false),
  };
}

const UNION_OPTIONS = [
  { value: 'Non-Union', label: 'Non-Union' },
  { value: 'SAG-AFTRA', label: 'SAG-AFTRA' },
  { value: 'Equity (US)', label: 'Equity (US)' },
  { value: 'Equity (UK)', label: 'Equity (UK)' },
  { value: 'ACTRA', label: 'ACTRA' },
  { value: 'UAD', label: 'UAD' }
];

const COMFORT_LEVEL_OPTIONS = [
  { value: 'Swimwear', label: 'Swimwear' },
  { value: 'Lingerie', label: 'Lingerie' },
  { value: 'Implied Nudity', label: 'Implied Nudity' },
  { value: 'Artistic Nudity', label: 'Artistic Nudity' },
  { value: 'Fitness/Athletic', label: 'Fitness / Athletic' },
  { value: 'Body Paint', label: 'Body Paint' }
];

const AVAILABILITY_OPTIONS = [
  { value: 'Full-Time', label: 'Full-Time' },
  { value: 'Part-Time', label: 'Part-Time' },
  { value: 'Freelance', label: 'Freelance' },
  { value: 'Weekends Only', label: 'Weekends Only' },
  { value: 'By Appointment', label: 'By Appointment' }
];

const MEDIA_PATH = '/dashboard/talent/media';
const PROFILE_NAV_SECTION_IDS = [
  'identity',
  'heritage',
  'appearance',
  'credits',
  'training',
  'roles',
  'representation',
  'socials',
  'contact',
];

function getLaneFitSignals(profileValues = {}) {
  const signals = [
    { slug: 'runway', score: profileValues.fit_score_runway },
    { slug: 'editorial', score: profileValues.fit_score_editorial },
    { slug: 'commercial', score: profileValues.fit_score_commercial },
    { slug: 'lifestyle', score: profileValues.fit_score_lifestyle },
    { slug: 'fitness', score: profileValues.fit_score_swim_fitness },
  ]
    .map((item) => ({
      ...item,
      score: Number(item.score),
      lane: BOOKING_LANE_BY_SLUG[item.slug],
    }))
    .filter((item) => item.lane && Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return signals;
}

function BookingLanesControl({ primaryField, secondaryField, fitSignals = [] }) {
  const primaryLane = normalizeBookingLaneSlug(primaryField.value);
  const secondaryLanes = normalizeBookingLaneList(secondaryField.value)
    .filter((laneSlug) => laneSlug !== primaryLane)
    .slice(0, 3);

  const handlePrimaryChange = (laneSlug) => {
    primaryField.onChange(laneSlug);
    secondaryField.onChange(secondaryLanes.filter((current) => current !== laneSlug));
  };

  const handleSecondaryToggle = (laneSlug) => {
    if (laneSlug === primaryLane) return;
    if (secondaryLanes.includes(laneSlug)) {
      secondaryField.onChange(secondaryLanes.filter((current) => current !== laneSlug));
      return;
    }
    if (secondaryLanes.length >= 3) {
      secondaryField.onChange([...secondaryLanes.slice(1), laneSlug]);
      return;
    }
    secondaryField.onChange([...secondaryLanes, laneSlug]);
  };

  return (
    <div className={styles.bookingLanes}>
      <div className={styles.bookingLaneGroup}>
        <div className={styles.bookingLaneHead}>
          <h4>Primary lane</h4>
          <span>Choose one</span>
        </div>
        <div className={styles.bookingLaneGrid} role="radiogroup" aria-label="Primary booking lane">
          {BOOKING_LANES.map((lane) => {
            const isActive = primaryLane === lane.slug;
            return (
              <button
                key={lane.slug}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`${styles.bookingLaneOption} ${isActive ? styles.bookingLaneOptionActive : ''}`}
                onClick={() => handlePrimaryChange(lane.slug)}
              >
                <span className={styles.bookingLaneLabel}>{lane.label}</span>
                <span className={styles.bookingLaneDescription}>{lane.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.bookingLaneGroup}>
        <div className={styles.bookingLaneHead}>
          <h4>Secondary lanes</h4>
          <span>{secondaryLanes.length}/3</span>
        </div>
        <div className={styles.bookingLaneSecondaryGrid} role="group" aria-label="Secondary booking lanes">
          {BOOKING_LANES.map((lane) => {
            const isPrimary = primaryLane === lane.slug;
            const isActive = secondaryLanes.includes(lane.slug);
            return (
              <button
                key={lane.slug}
                type="button"
                aria-pressed={isActive}
                disabled={isPrimary}
                className={`${styles.bookingLaneMini} ${isActive ? styles.bookingLaneMiniActive : ''}`}
                onClick={() => handleSecondaryToggle(lane.slug)}
              >
                {lane.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.bookingLaneNote}>
        <p>
          Booking lanes are market routes. Special Skills remain separate: languages, movement,
          sports, instruments, licenses, and other capabilities.
        </p>
        {fitSignals.length > 0 ? (
          <div className={styles.bookingLaneSignal} aria-label="Pholio lane signal">
            <span>Pholio signal</span>
            <p>{fitSignals.map((item) => `${item.lane.label} ${item.score}`).join(' · ')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getScrollableAncestor(element) {
  let parent = element?.parentElement;

  while (parent && parent !== document.body) {
    const { overflowY } = window.getComputedStyle(parent);
    const canScroll = /(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight;
    if (canScroll) return parent;
    parent = parent.parentElement;
  }

  return window;
}

function getScrollMetrics(scroller) {
  if (scroller === window) {
    return {
      scrollTop: window.scrollY,
      clientHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      rectTop: 0,
      rectBottom: window.innerHeight,
    };
  }

  const rect = scroller.getBoundingClientRect();
  return {
    scrollTop: scroller.scrollTop,
    clientHeight: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
    rectTop: rect.top,
    rectBottom: rect.bottom,
  };
}

function scrollElementIntoProfileView(element, scroller, offset = 100) {
  const metrics = getScrollMetrics(scroller);
  const targetTop = metrics.scrollTop + element.getBoundingClientRect().top - metrics.rectTop - offset;

  if (scroller === window) {
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
    return;
  }

  scroller.scrollTo({ top: targetTop, behavior: 'smooth' });
}

export default function ProfilePage() {
  const { subscription, images: authImages, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [bioImproveMode, setBioImproveMode] = useState(null);
  const [bioOptions, setBioOptions] = useState({ length: 'standard', person: 'third' });
  const [previousBio, setPreviousBio] = useState(null);
  const [trainingImproveMode, setTrainingImproveMode] = useState(null);
  const [previousTraining, setPreviousTraining] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [readinessAuditOpen, setReadinessAuditOpen] = useState(false);
  const [gateItemsExpanded, setGateItemsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pageRef = useRef(null);
  const saveRequestRef = useRef(0);
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
  const [shoeRegion, setShoeRegion] = useState('US');
  const { data: referenceLanguages = [], isLoading: languagesLoading } = useReferenceLanguages();

  const languageOptions = useMemo(
    () =>
      referenceLanguages
        .map((lang) => ({
          value: lang.name,
          label: lang.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [referenceLanguages],
  );
  
  // Scroll Spy State
  const [activeSection, setActiveSection] = useState('identity');
  
  // Local state for Imperial height display
  const [, setHeightFt] = useState('');
  const [, setHeightIn] = useState('');
  
  const { 
    register, 
    handleSubmit, 
    watch, 
    setValue,
    reset,
    setError,
    control,
    getValues,
    formState: { errors, isDirty, isSubmitting } 
  } = useForm({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
    defaultValues: {
      seeking_representation: false,
      representation_status: 'not_seeking',
      tattoos: false,
      piercings: false,
      work_eligibility: null,
      passport_ready: false,
      availability_travel: false,
      drivers_license: false,
    }
  });

  // Register setValue-only fields not wired through register() or Controller
  useEffect(() => {
    const customFields = [
      'hero_image_path', 'height_cm', 'weight_kg', 'shoe_size',
      'bust', 'waist', 'hips', 'inseam_cm',
      'tattoos', 'piercings', 'availability_travel', 'drivers_license', 'passport_ready',
      'work_eligibility',
    ];
    customFields.forEach(field => register(field));
  }, [register]);

  const applyBioResult = (data, modeLabel) => {
    const nextBio = data.bio || data.refined;
    if (!nextBio) throw new Error('No bio returned');
    setValue('bio', nextBio, { shouldDirty: true });
    pholioToast.success(
      `${modeLabel} complete (${data.wordCount ?? nextBio.split(/\s+/).filter(Boolean).length} words)`,
    );
  };

  const handleBioRefine = async () => {
    const currentBio = watch('bio');
    if (!currentBio || currentBio.trim().length < 10) {
      pholioToast.error('Write at least 10 characters before refining');
      return;
    }

    setPreviousBio(currentBio);
    setBioImproveMode('refine');

    try {
      const data = await talentApi.refineBio({ bio: currentBio.trim(), ...bioOptions });
      applyBioResult(data, 'Bio refined');
    } catch (error) {
      console.error('Bio refine failed:', error);
      pholioToast.error(error.message || 'Failed to refine bio. Please try again.');
      setPreviousBio(null);
    } finally {
      setBioImproveMode(null);
    }
  };

  const handleBioGenerate = async () => {
    const currentBio = watch('bio');
    if (currentBio?.trim()) {
      setPreviousBio(currentBio);
    }
    setBioImproveMode('generate');

    try {
      const data = await talentApi.generateBio({ ...bioOptions });
      applyBioResult(data, 'Bio generated');
    } catch (error) {
      console.error('Bio generate failed:', error);
      if (error.data?.details?.code === 'INSUFFICIENT_CONTEXT') {
        pholioToast.error(
          error.message ||
            'Add experience, categories, training, or credits before generating',
        );
      } else {
        pholioToast.error(error.message || 'Failed to generate bio. Please try again.');
      }
      if (!currentBio?.trim()) setPreviousBio(null);
    } finally {
      setBioImproveMode(null);
    }
  };

  // Undo AI Changes
  const handleUndoAI = () => {
    if (previousBio) {
      setValue('bio', previousBio, { shouldDirty: true });
      setPreviousBio(null);
      pholioToast.info('Reverted to original bio');
    }
  };

  const applyTrainingSummaryResult = (data, modeLabel) => {
    const nextSummary = data.summary;
    if (!nextSummary) throw new Error('No training summary returned');
    setValue('training_summary', nextSummary, { shouldDirty: true });
    pholioToast.success(
      `${modeLabel} (${data.wordCount ?? nextSummary.split(/\s+/).filter(Boolean).length} words)`,
    );
  };

  const handleTrainingFormat = async () => {
    const currentTraining = watch('training_summary');
    if (!currentTraining || currentTraining.trim().length < 10) {
      pholioToast.error('Write at least 10 characters before formatting');
      return;
    }

    setPreviousTraining(currentTraining);
    setTrainingImproveMode('format');

    try {
      const data = await talentApi.formatTrainingSummary({ text: currentTraining.trim() });
      applyTrainingSummaryResult(data, 'Training formatted');
    } catch (error) {
      console.error('Training format failed:', error);
      pholioToast.error(error.message || 'Failed to format training summary. Please try again.');
      setPreviousTraining(null);
    } finally {
      setTrainingImproveMode(null);
    }
  };

  const handleTrainingSummarize = async () => {
    const currentTraining = watch('training_summary');
    if (!currentTraining || currentTraining.trim().length < 40) {
      pholioToast.error('Write at least 40 characters before summarizing');
      return;
    }

    setPreviousTraining(currentTraining);
    setTrainingImproveMode('summarize');

    try {
      const data = await talentApi.summarizeTrainingSummary({ text: currentTraining.trim() });
      applyTrainingSummaryResult(data, 'Training summarized');
    } catch (error) {
      console.error('Training summarize failed:', error);
      pholioToast.error(error.message || 'Failed to summarize training. Please try again.');
      setPreviousTraining(null);
    } finally {
      setTrainingImproveMode(null);
    }
  };

  const handleTrainingExpand = async () => {
    const currentTraining = watch('training_summary') || '';
    const trimmed = currentTraining.trim();

    if (trimmed) {
      setPreviousTraining(currentTraining);
    }
    setTrainingImproveMode('expand');

    try {
      const data = await talentApi.expandTrainingSummary(trimmed ? { text: trimmed } : {});
      applyTrainingSummaryResult(data, 'Training draft ready');
    } catch (error) {
      console.error('Training expand failed:', error);
      if (error.data?.details?.code === 'INSUFFICIENT_CONTEXT') {
        pholioToast.error(
          error.message || 'Add verified credits or training details before drafting',
        );
      } else {
        pholioToast.error(error.message || 'Failed to draft training summary. Please try again.');
      }
      if (!trimmed) setPreviousTraining(null);
    } finally {
      setTrainingImproveMode(null);
    }
  };

  const handleUndoTrainingAssist = () => {
    if (previousTraining === null) return;
    setValue('training_summary', previousTraining, { shouldDirty: true });
    setPreviousTraining(null);
    pholioToast.info('Reverted to original training summary');
  };

  const reloadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await talentApi.getProfile();
      if (data && data.profile) {
        reset(normalizeProfileForForm(data.profile));

        if (data.profile.height_cm) {
          const { ft, in: inch } = cmToFeetInches(data.profile.height_cm);
          setHeightFt(ft);
          setHeightIn(inch);
        }
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      const failure = parseApiFailure(error, 'Profile could not load');
      pholioToast.fromFailure(failure);
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  // Active section tracking
  useEffect(() => {
    if (isLoading) return;

    const scroller = getScrollableAncestor(pageRef.current);
    let frame = null;

    const resolveActiveSection = () => {
      const sections = PROFILE_NAV_SECTION_IDS
        .map((id) => document.getElementById(id))
        .filter(Boolean);

      if (!sections.length) return;

      const metrics = getScrollMetrics(scroller);
      const markerY = metrics.rectTop + Math.min(metrics.clientHeight * 0.35, 320);
      const visibleSections = sections
        .map((section) => ({
          id: section.id,
          rect: section.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.bottom > metrics.rectTop && rect.top < metrics.rectBottom);

      if (!visibleSections.length) return;

      const isAtPageEnd = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 12;
      if (isAtPageEnd) {
        const lastVisible = visibleSections[visibleSections.length - 1];
        setActiveSection(lastVisible.id);
        return;
      }

      const sectionAtMarker = visibleSections.find(({ rect }) => rect.top <= markerY && rect.bottom > markerY);
      if (sectionAtMarker) {
        setActiveSection(sectionAtMarker.id);
        return;
      }

      const passedSections = visibleSections.filter(({ rect }) => rect.top <= markerY);
      if (passedSections.length) {
        setActiveSection(passedSections[passedSections.length - 1].id);
        return;
      }

      setActiveSection(visibleSections[0].id);
    };

    const scheduleResolve = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        resolveActiveSection();
      });
    };

    resolveActiveSection();
    scroller.addEventListener('scroll', scheduleResolve, { passive: true });
    window.addEventListener('resize', scheduleResolve);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', scheduleResolve);
      window.removeEventListener('resize', scheduleResolve);
    };
  }, [isLoading]);

  // Handle Deep Linking / Query Params
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab || isLoading) return;

    if (tab === 'photos') {
      navigate(MEDIA_PATH, { replace: true });
      return;
    }

    const sectionMap = {
      details: 'identity',
      identity: 'identity',
      heritage: 'heritage',
      physical: 'appearance',
      appearance: 'appearance',
      credits: 'credits',
      training: 'training',
      roles: 'roles',
      representation: 'representation',
      socials: 'socials',
      contact: 'contact',
      about: 'identity',
    };

    const targetId = sectionMap[tab];
    if (targetId) {
      // Small timeout to ensure rendering
      setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          scrollElementIntoProfileView(element, getScrollableAncestor(pageRef.current));
        }
      }, 500);
    }
  }, [searchParams, isLoading, navigate]);

  const values = watch();
  const trainingSummaryValue = values.training_summary || '';
  const measurementsLocked =
    isMinorProfile({ date_of_birth: values.date_of_birth }) &&
    !minorSensitiveFieldsUnlocked({
      date_of_birth: values.date_of_birth,
      guardian_consent_at: values.guardian_consent_recorded
        ? profile?.guardian_consent_at || 'draft'
        : null,
    });
  const readinessProfile = useMemo(
    () => ({
      date_of_birth: values.date_of_birth,
      guardian_consent_at: values.guardian_consent_recorded
        ? profile?.guardian_consent_at || 'draft'
        : null,
      work_permit_on_file: values.work_permit_on_file,
    }),
    [
      values.date_of_birth,
      values.guardian_consent_recorded,
      values.work_permit_on_file,
      profile?.guardian_consent_at,
    ],
  );
  const strengthValues = useMemo(
    () => ({
      ...values,
      email: values.email || profile?.email || '',
      phone: profile?.phone || '',
      images: Array.isArray(authImages) ? authImages : [],
      guardian_consent_at: values.guardian_consent_recorded
        ? profile?.guardian_consent_at || 'draft'
        : null,
      work_permit_on_file: values.work_permit_on_file,
    }),
    [values, authImages, profile?.email, profile?.phone, profile?.guardian_consent_at],
  );

  const profileStrength = useMemo(
    () => calculateProfileStrength(strengthValues),
    [strengthValues],
  );
  const { isCoreReady, missingCoreItems } = profileStrength;

  const scrollToProfileSection = (sectionId) => {
    if (sectionId === 'media' || sectionId === 'photos-tab' || sectionId === 'hero-section') {
      navigate(MEDIA_PATH);
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      scrollElementIntoProfileView(element, getScrollableAncestor(pageRef.current));
    }
  };

  const authUserPredicate = (q) =>
    Array.isArray(q.queryKey) && q.queryKey[0] === 'auth-user';

  const onInvalid = useCallback((fieldErrors) => {
    const firstField = Object.keys(fieldErrors)[0];
    const firstError = firstField ? fieldErrors[firstField] : null;
    const message = firstError?.message || 'Review the highlighted fields, then save again.';
    pholioToast.error('Check a few details', {
      description: message,
    });
  }, []);

  const onSubmit = async (data) => {
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;

    try {
      // 1. Transform Frontend Strings -> Backend Arrays/JSON
      const payload = { ...data };
      delete payload.hero_image_path;

      const repStatus = payload.representation_status;
      delete payload.representation_status;
      if (repStatus === 'seeking') {
        payload.seeking_representation = true;
        payload.current_agency = null;
      } else if (repStatus === 'represented') {
        payload.seeking_representation = false;
      } else if (repStatus === 'not_seeking') {
        payload.seeking_representation = false;
        payload.current_agency = null;
      }
      
      if (typeof payload.languages === 'string') {
        payload.languages = payload.languages.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof payload.specialties === 'string') {
        payload.specialties = payload.specialties.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (typeof payload.training_summary === 'string') {
         payload.training = payload.training_summary; // Map back to DB column
      }
      // Ensure specific JSON fields are arrays if they are strings (e.g. from backend raw or manual input)
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
      // Previous representation is edited as plaintext in textarea; normalize to string list for backend JSON column.
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
      // Handle experience_details (Key Credits) - split by newlines for JSON array
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

      const res = await talentApi.updateProfile(payload);
      if (saveRequestRef.current !== requestId) return;

      if (!res?.profile) {
        const failure = parseApiFailure(
          { message: 'Profile save did not return updated data.' },
          'Profile could not be saved',
        );
        pholioToast.fromFailure(failure);
        return;
      }

      reset(normalizeProfileForForm(res.profile));

      await queryClient.invalidateQueries({ predicate: authUserPredicate });
      await queryClient.invalidateQueries({ queryKey: ['talent-activity'] });
      await queryClient.invalidateQueries({ queryKey: ['talent-analytics'] });

      if (saveRequestRef.current !== requestId) return;

      try {
        await queryClient.refetchQueries({
          predicate: authUserPredicate,
          throwOnError: true,
        });
      } catch (syncError) {
        if (saveRequestRef.current !== requestId) return;
        console.error('Profile saved but dashboard sync failed:', syncError);
        const failure = parseApiFailure(syncError, 'Dashboard sync incomplete');
        pholioToast.fromFailure({
          ...failure,
          toastMessage: 'Profile saved — dashboard sync incomplete',
          body: 'Your changes were saved, but the rest of the dashboard could not refresh. Reload the page or try again.',
        });
        return;
      }

      if (saveRequestRef.current !== requestId) return;

      pholioToast.success('Profile saved successfully');
    } catch (error) {
      if (saveRequestRef.current !== requestId) return;
      console.error('Submission Error:', error);

      const topLevelErrors = error?.data?.errors;
      const nestedErrors = error?.data?.error?.errors;
      const validationErrors = topLevelErrors || nestedErrors;

      if ((error.status === 400 || error.status === 422) && validationErrors) {
        pholioToast.error('Check a few details', {
          description: 'Review the highlighted fields, then save again.',
        });

        Object.keys(validationErrors).forEach((field) => {
          const messages = validationErrors[field];
          if (Array.isArray(messages) && messages.length > 0) {
            const formField = field === 'date_of_birth' ? 'date_of_birth' : field;
            setError(formField, {
              type: 'manual',
              message: messages[0],
            });
          }
        });
        return;
      }

      const failure = parseApiFailure(error, 'Profile could not be saved');
      pholioToast.fromFailure(failure);
    }
  };

  const handleSaveProfile = async () => {
    if (isSubmitting) return;

    const wasDirty = isDirty;
    const { normalized, pendingCommit } = await flushProfileFormForSave(setValue, getValues);

    if (!wasDirty && !normalized && !pendingCommit) {
      pholioToast.info('No changes to save');
      return;
    }

    handleSubmit(onSubmit, onInvalid)();
  };

  // Get hero display data from form values
  const firstName = values.first_name || 'Your';
  const lastName = values.last_name || 'Name';

  // Hero image sourced from form state (updated by API or upload)
  const heroImage = watch('hero_image_path'); // Now watching the actual field

  // Loading Skeleton
  if (isLoading) {
    return (
      <div ref={pageRef} className={styles.pageContainer} aria-busy="true" aria-label="Loading profile...">
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonText}`} style={{ marginBottom: '48px' }} />
        
        <div className={styles.layoutGrid}>
          <aside className={styles.leftSidebar}>
            <div className={`${styles.skeleton}`} style={{ height: '300px' }} />
          </aside>
          <main className={styles.centerContent}>
            <div className={styles.formGrid2}>
              <div className={`${styles.skeleton} ${styles.skeletonInput}`} />
              <div className={`${styles.skeleton} ${styles.skeletonInput}`} />
            </div>
            <div className={styles.formGrid2} style={{ marginTop: '24px' }}>
              <div className={`${styles.skeleton} ${styles.skeletonInput}`} />
              <div className={`${styles.skeleton} ${styles.skeletonInput}`} />
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonTextarea}`} style={{ marginTop: '24px' }} />
          </main>
          <aside className={styles.rightSidebar}>
            <div className={`${styles.skeleton}`} style={{ height: '200px' }} />
          </aside>
        </div>
      </div>
    );
  }

  const isGateEntry = searchParams.get('gate') === 'true';

  const bookingStatus = values.current_agency
    ? `Represented by ${values.current_agency}`
    : values.seeking_representation || values.representation_status === 'seeking'
      ? 'Seeking representation'
      : null;

  const showReadinessGate = isGateEntry && !isCoreReady;

  return (
    <div ref={pageRef} className={styles.pageContainer}>
      {/* Mobile Nav Toggle */}
      <button 
        className={styles.navToggle} 
        onClick={() => setNavOpen(!navOpen)}
        aria-label="Toggle navigation"
        type="button"
      >
        {navOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      
      {/* Mobile Nav Overlay */}
      <div 
        className={`${styles.navOverlay} ${navOpen ? styles.navOverlayVisible : ''}`}
        onClick={() => setNavOpen(false)}
      />

      {/* Identity hero — person first, form below */}
      <header id="hero-section" className={styles.heroSection} aria-label="Profile identity">
        <motion.div
          className={styles.heroInner}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.heroPortraitWrap}>
          {heroImage ? (
            <img
              src={heroImage}
              alt={`${firstName} ${lastName}`}
              className={styles.heroImage}
            />
          ) : (
            <>
              <div className={styles.heroNoPhotoBg} aria-hidden="true" />
              <Link to={MEDIA_PATH} className={styles.addPhotoPrompt}>
                <Camera size={20} strokeWidth={1.5} />
                <span>Add primary photo</span>
                <span className={styles.addPhotoHint}>Opens your book</span>
              </Link>
            </>
          )}
        </div>

          <div className={styles.heroIdentity}>
            <div className={styles.heroEyebrow}>
              {values.city ? (
                <p className={styles.heroTagline}>{String(values.city).toUpperCase()}</p>
              ) : (
                <p className={styles.heroTaglineMuted}>LOCATION</p>
              )}
              {subscription?.isPro ? (
                <span className={styles.studioBadge}>Studio+</span>
              ) : null}
            </div>

            <h1 className={styles.heroName}>
              <span>{firstName}</span>
              {' '}
              <em>{lastName}</em>
            </h1>

            <motion.div
              className={styles.heroSweep}
              aria-hidden="true"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.85, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'left' }}
            />

            {bookingStatus ? (
              <p className={styles.heroRole}>{bookingStatus}</p>
            ) : null}

            {showReadinessGate ? (
              <div className={styles.heroReadiness} role="status" aria-live="polite">
                <p className={styles.heroReadinessLine}>
                  <span className={styles.heroReadinessDot} aria-hidden="true" />
                  Agency visibility{' '}
                  <span className={styles.heroReadinessEm}>pending</span>
                  {' '}
                  — complete essentials to appear in search.
                  {missingCoreItems.length > 0 ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className={styles.heroReadinessToggle}
                        onClick={() => setGateItemsExpanded((open) => !open)}
                        aria-expanded={gateItemsExpanded}
                      >
                        {gateItemsExpanded
                          ? 'Hide items'
                          : `${missingCoreItems.length} item${missingCoreItems.length === 1 ? '' : 's'} remaining`}
                      </button>
                    </>
                  ) : null}
                </p>
                {gateItemsExpanded && missingCoreItems.length > 0 ? (
                  <p className={styles.heroReadinessItems}>{missingCoreItems.join(', ')}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.div>
      </header>

      {/* Page Header - Removed as requested */}

      {/* 3-Column Layout */}
      <div className={styles.layoutGrid}>
        
        {/* Left Sidebar - Navigation */}
        <aside className={`${styles.leftSidebar} ${navOpen ? styles.leftSidebarOpen : ''}`}>
          <ProfileNav
            onNavClick={() => setNavOpen(false)}
            activeSection={activeSection}
          />
        </aside>

        {/* Center - Form Fields */}
        <main className={styles.centerContent}>
          <form
            id="profile-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveProfile();
            }}
            className={`${styles.profileForms} ${isSubmitting ? styles.formSaving : ''}`}
            aria-busy={isSubmitting}
          >
            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>I — Identity</p>
                <h2 className={styles.movementTitle}>
                  Who you <em>are</em>
                </h2>
                <p className={styles.movementLede}>
                  Core information agencies review first — name, heritage, and how you describe your work.
                </p>
              </header>
              <div className={styles.movementCard}>
            <IdentitySection
              register={register}
              control={control}
              errors={errors}
              bioValue={watch('bio')}
              isImproving={!!bioImproveMode}
              improveMode={bioImproveMode}
              previousBio={previousBio}
              bioOptions={bioOptions}
              onBioOptionsChange={setBioOptions}
              onBioRefine={handleBioRefine}
              onBioGenerate={handleBioGenerate}
              handleUndoAI={handleUndoAI}
              watchDob={watch('date_of_birth')}
            />
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>II — Measurements</p>
                <h2 className={styles.movementTitle}>
                  Physical <em>proof</em>
                </h2>
                <p className={styles.movementLede}>
                  Vital statistics casting teams filter on — precise, current, and honest.
                </p>
              </header>
              <div className={styles.movementCard}>
            <MeasurementsSection
              control={control}
              errors={errors}
              register={register}
              watch={watch}
              setValue={setValue}
              unitSystem={unitSystem}
              setUnitSystem={setUnitSystem}
              shoeRegion={shoeRegion}
              setShoeRegion={setShoeRegion}
              measurementsLocked={measurementsLocked}
            />
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>III — Proof</p>
                <h2 className={styles.movementTitle}>
                  Credits & <em>craft</em>
                </h2>
                <p className={styles.movementLede}>
                  Experience, training, and the roles you are cast for.
                </p>
              </header>
              <div className={styles.movementCard}>
        <Section
          id="credits"
          title="Credits & Experience"
          titleEmphasis="Experience"
          description="Your experience and past work."
          showDivider={false}
        >
          <div className={styles.formStack}>
            <Controller
              name="experience_level"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Experience Level"
                  id="experience_level"
                  options={['Emerging', 'Professional', 'Established'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.experience_level}
                  placeholder="Select level"
                />
              )}
            />
            
            <Controller
              name="experience_details"
              control={control}
              render={({ field }) => (
                <CreditsEditor
                  label="Key Credits"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.experience_details}
                />
              )}
            />
          </div>
        </Section>

        <Section
          id="training"
          title="Training & Skills"
          titleEmphasis="Skills"
          description="Your professional background and skills."
        >
          <div className={styles.formStack}>
            <WritingAssistToolbar
              className={styles.trainingAssistToolbar}
              actions={[
                {
                  id: 'format-training',
                  label: 'Format list',
                  onClick: () => {
                    void handleTrainingFormat();
                  },
                  disabled: trainingSummaryValue.trim().length < 10,
                },
                {
                  id: 'summarize-training',
                  label: 'Summarize',
                  onClick: () => {
                    void handleTrainingSummarize();
                  },
                  disabled: trainingSummaryValue.trim().length < 40,
                },
                {
                  id: 'expand-training',
                  label: 'Draft from profile',
                  onClick: () => {
                    void handleTrainingExpand();
                  },
                },
              ]}
              busy={Boolean(trainingImproveMode)}
              busyLabel={
                trainingImproveMode === 'format'
                  ? 'Formatting…'
                  : trainingImproveMode === 'summarize'
                    ? 'Summarizing…'
                    : 'Drafting…'
              }
              showUndo={previousTraining !== null}
              onUndo={handleUndoTrainingAssist}
            />
            <PholioTextarea
              label="Training Summary"
              placeholder="List schools, workshops, and coaches..."
              rows={4}
              {...register('training_summary')}
            />
            
            <div className={styles.formGrid2}>
              <Controller
                name="specialties"
                control={control}
                render={({ field }) => (
                  <PholioTagInput
                    label="Special Skills (Tags)"
                    id="specialties"
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.specialties}
                    placeholder="Type skill and press Enter..."
                  />
                )}
              />

              <Controller
                name="languages"
                control={control}
                render={({ field }) => (
                  <PholioMultiSelect
                    label="Languages"
                    id="languages"
                    options={languageOptions}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.languages}
                    placeholder={
                      languagesLoading ? 'Loading languages…' : 'Search and select languages'
                    }
                    searchable
                    searchPlaceholder="Search languages…"
                    emptyMessage="No languages match your search"
                    disabled={languagesLoading}
                  />
                )}
              />
            </div>
          </div>
        </Section>

        <Section
          id="roles"
          title="Roles & Style"
          titleEmphasis="Style"
          description="What kind of work you specialize in."
        >
          <div className={styles.formGrid2}>
            <Controller
              name="work_status"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Primary Role"
                  id="work_status"
                  options={['Model', 'Actor', 'Dancer', 'Voiceover', 'Influencer'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.work_status}
                  placeholder="Select role"
                />
              )}
            />
            <Controller
              name="union_membership"
              control={control}
              render={({ field }) => (
                <PholioMultiSelect
                  label="Union Status"
                  id="union_membership"
                  options={UNION_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.union_membership}
                  placeholder="Select unions"
                />
              )}
            />
          </div>

          <div className={styles.formGrid2} style={{ marginTop: '24px' }}>
             <PholioInput
                label="Playing Age Min"
                type="number"
                placeholder="18"
                {...register('playing_age_min', { valueAsNumber: true })}
                error={errors.playing_age_min}
             />
             <PholioInput
                label="Playing Age Max"
                type="number"
                placeholder="25"
                {...register('playing_age_max', { valueAsNumber: true })}
                error={errors.playing_age_max}
             />
          </div>

          {/* Comfort Levels */}
          <div className={styles.formRow}>
            <Controller
              name="comfort_levels"
              control={control}
              render={({ field }) => (
                <PholioMultiSelect
                  label="Comfort Levels"
                  id="comfort_levels"
                  options={COMFORT_LEVEL_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.comfort_levels}
                  placeholder="Select what you're comfortable with"
                />
              )}
            />
          </div>



          {/* Administrative Details */}
          <div className={`${styles.formGrid3} ${styles.formRow}`}>
            <Controller
              name="availability_schedule"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Availability"
                  id="availability_schedule"
                  options={AVAILABILITY_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.availability_schedule}
                  placeholder="Select schedule"
                />
              )}
            />
            <Controller
              name="work_eligibility"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Work Eligibility"
                  id="work_eligibility"
                  options={[
                    { value: 'yes', label: 'Authorized' },
                    { value: 'no', label: 'Requires Sponsorship' },
                    { value: 'unset', label: 'Prefer not to say' }
                  ]}
                  value={field.value === true ? 'yes' : field.value === false ? 'no' : 'unset'}
                  onChange={(val) => {
                    const next = val === 'yes' ? true : val === 'no' ? false : null;
                    field.onChange(next);
                  }}
                  error={errors.work_eligibility}
                  placeholder="Select status"
                />
              )}
            />
            <Controller
              name="availability_travel"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Open to Travel"
                  id="availability_travel"
                  options={[
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' }
                  ]}
                  value={field.value ? 'true' : 'false'}
                  onChange={(val) => field.onChange(val === 'true')}
                  error={errors.availability_travel}
                  placeholder="Select"
                />
              )}
            />
            <Controller
              name="passport_ready"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Passport Ready"
                  id="passport_ready"
                  options={[
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' }
                  ]}
                  value={field.value ? 'true' : 'false'}
                  onChange={(val) => field.onChange(val === 'true')}
                  error={errors.passport_ready}
                  placeholder="Select"
                />
              )}
            />
            <Controller
              name="drivers_license"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Driver's License"
                  id="drivers_license"
                  options={[
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' }
                  ]}
                  value={field.value ? 'true' : 'false'}
                  onChange={(val) => field.onChange(val === 'true')}
                  error={errors.drivers_license}
                  placeholder="Select"
                />
              )}
            />
          </div>
        </Section>

        <Section
          id="market"
          title="Booking Lanes"
          titleEmphasis="Lanes"
          description="The briefs your profile should be routed toward."
          showDivider={false}
          className={styles.bookingLaneSection}
        >
          <Controller
            name="booking_primary_lane"
            control={control}
            render={({ field: primaryField }) => (
              <Controller
                name="booking_secondary_lanes"
                control={control}
                render={({ field: secondaryField }) => (
                  <BookingLanesControl
                    primaryField={primaryField}
                    secondaryField={secondaryField}
                    fitSignals={getLaneFitSignals(values)}
                  />
                )}
              />
            )}
          />
        </Section>
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>IV — Reach</p>
                <h2 className={styles.movementTitle}>
                  Representation & <em>contact</em>
                </h2>
                <p className={styles.movementLede}>
                  Agency status, social presence, and emergency details kept private until needed.
                </p>
              </header>
              <div className={styles.movementCard}>
        <RepresentationSection
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          watch={watch}
        />

        <SocialSection control={control} setValue={setValue} errors={errors} />

        <Section
          id="contact"
          title="Contact & Emergency"
          titleEmphasis="Emergency"
          description="Emergency contact information."
        >
          <div className={`${styles.formGrid3} ${styles.formRow}`}>
            <PholioInput label="Emergency Contact" placeholder="Name" error={errors.emergency_contact_name} {...register('emergency_contact_name')} />
            <Controller
              name="emergency_contact_phone"
              control={control}
              render={({ field }) => (
                <PholioInput
                  label="Phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 (555) 000-0000"
                  error={errors.emergency_contact_phone}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={(e) => {
                    field.onBlur();
                    const next = normalizeEmergencyPhone(e.target.value);
                    if (next !== field.value) {
                      setValue('emergency_contact_phone', next, { shouldDirty: true, shouldValidate: true });
                    }
                  }}
                  name={field.name}
                />
              )}
            />
            <PholioInput label="Relationship" placeholder="e.g. Mother" error={errors.emergency_contact_relationship} {...register('emergency_contact_relationship')} />
          </div>
        </Section>
              </div>
            </article>

          </form>
        </main>

        {/* Right Sidebar - Profile Strength */}
        <ProfileStrengthSidebar
          strength={profileStrength}
          profile={readinessProfile}
          images={Array.isArray(authImages) ? authImages : []}
          isSaving={isSubmitting}
          hasChanges={isDirty}
          auditOpen={readinessAuditOpen}
          onToggleAudit={() => setReadinessAuditOpen((open) => !open)}
          onSaveClick={() => {
            void handleSaveProfile();
          }}
          onItemClick={scrollToProfileSection}
        />

      </div>{/* End layoutGrid */}
    </div>
  );
}
