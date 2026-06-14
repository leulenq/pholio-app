import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { pholioToast } from '../../../../shared/lib/pholio-toast';
import { motion } from 'framer-motion';
import { Menu, X, Camera, Eye, Activity, MousePointerClick } from 'lucide-react';
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
import { PhotosSection } from './PhotosSection';
import { SocialSection } from './SocialSection';
import { useAnalytics } from '../../hooks/useAnalytics';
import { parseApiFailure } from '../../../../shared/lib/api-error-message';
import { useReferenceLanguages } from '../../../../shared/hooks/useReferenceLanguages';
import { flushProfileFormForSave } from './flushProfileFormForSave';

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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deriveRepresentationStatus(profile) {
  const seeking = !!profile.seeking_representation;
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

function normalizeProfileForForm(profile = {}) {
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
    modeling_categories: toArrayField(profile.modeling_categories),
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
    seeking_representation: !!profile.seeking_representation,
    tattoos: !!profile.tattoos,
    piercings: !!profile.piercings,
    /** true / false / null — null means “not specified” for the UI (backend nullable boolean). */
    work_eligibility:
      profile.work_eligibility === true || profile.work_eligibility === 'Yes'
        ? true
        : profile.work_eligibility === false || profile.work_eligibility === 'No'
          ? false
          : null,
    passport_ready: !!profile.passport_ready,
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

const MODELING_CATEGORIES_OPTIONS = [
  { value: 'Runway', label: 'Runway / Fashion Week' },
  { value: 'Editorial', label: 'Editorial / Print' },
  { value: 'Commercial', label: 'Commercial / Catalog' },
  { value: 'Lifestyle', label: 'Lifestyle / E-commerce' },
  { value: 'Swim/Fitness', label: 'Swim / Fitness' },
  { value: 'Beauty', label: 'Beauty / Cosmetics' },
  { value: 'Parts', label: 'Parts (Hands / Feet)' },
  { value: 'Promotional', label: 'Promotional / Events' },
  { value: 'Plus-size', label: 'Plus-Size / Curve' },
  { value: 'Petite', label: 'Petite' }
];

const AVAILABILITY_OPTIONS = [
  { value: 'Full-Time', label: 'Full-Time' },
  { value: 'Part-Time', label: 'Part-Time' },
  { value: 'Freelance', label: 'Freelance' },
  { value: 'Weekends Only', label: 'Weekends Only' },
  { value: 'By Appointment', label: 'By Appointment' }
];

export default function ProfilePage() {
  const { subscription, images: authImages } = useAuth();
  const queryClient = useQueryClient();
  const [bioImproveMode, setBioImproveMode] = useState(null);
  const [previousBio, setPreviousBio] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [readinessAuditOpen, setReadinessAuditOpen] = useState(false);
  const [gateItemsExpanded, setGateItemsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const saveRequestRef = useRef(0);
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
  const [shoeRegion, setShoeRegion] = useState('US');
  const { summary, isLoading: analyticsLoading, summaryError } = useAnalytics();
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
      const data = await talentApi.refineBio({ bio: currentBio.trim() });
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
      const data = await talentApi.generateBio();
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

  // Scroll Spy Observer
  useEffect(() => {
    // Only run if not loading
    if (isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Priority given to recently intersected element
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        root: null,
        rootMargin: '-20% 0px -60% 0px', // Trigger when section hits top-middle part of screen
        threshold: 0
      }
    );

    const sections = document.querySelectorAll('section[id]');
    sections.forEach((section) => observer.observe(section));
    
    // Also observe the hero
    const hero = document.getElementById('hero-section');
    if (hero) observer.observe(hero);

    return () => {
      sections.forEach((section) => observer.unobserve(section));
      if (hero) observer.unobserve(hero);
    };
  }, [isLoading]);

  // Handle Deep Linking / Query Params
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab || isLoading) return;

    const sectionMap = {
      details: 'identity',
      identity: 'identity',
      heritage: 'heritage',
      photos: 'photos-tab',
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
          const offset = 100; 
          const elementPosition = element.getBoundingClientRect().top + window.scrollY;
          const offsetPosition = elementPosition - offset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
      }, 500);
    }
  }, [searchParams, isLoading]);

  const values = watch();
  const strengthValues = useMemo(
    () => ({ ...values, images: Array.isArray(authImages) ? authImages : [] }),
    [values, authImages],
  );

  const profileStrength = useMemo(
    () => calculateProfileStrength(strengthValues),
    [strengthValues],
  );
  const { isCoreReady, missingCoreItems, fieldCompletion } = profileStrength;

  const scrollToProfileSection = (sectionId) => {
    const goPhotos = sectionId === 'photos-tab' || sectionId === 'hero-section';
    if (goPhotos) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'photos');
        return next;
      });
      window.setTimeout(() => {
        const el = document.getElementById('photos-tab');
        if (el) {
          const offset = 100;
          const top = el.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }, 400);
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
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
      ['ethnicity', 'comfort_levels', 'modeling_categories', 'union_membership'].forEach(field => {
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
      <div className={styles.pageContainer} aria-busy="true" aria-label="Loading profile...">
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
  const isStudioPlus = !!subscription?.isPro;
  const websiteViews = toNumber(summary?.views?.total);
  const websiteViewDelta = toNumber(
    summary?.views?.changePct ?? summary?.views?.changePercent ?? summary?.views?.deltaPct
  );
  const engagementEvents = toNumber(
    summary?.engagement?.total ?? summary?.clicks?.total ?? summary?.profileClicks?.total
  );

  return (
    <div className={styles.pageContainer}>
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
              <button
                type="button"
                className={styles.addPhotoPrompt}
                onClick={() => {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('tab', 'photos');
                    return next;
                  });
                }}
              >
                <Camera size={20} strokeWidth={1.5} />
                <span>Add primary photo</span>
                <span className={styles.addPhotoHint}>Opens your book</span>
              </button>
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
        {searchParams.get('tab') === 'photos' ? (
          <PhotosSection
            onPhotoUploaded={(url) => {
              setValue('hero_image_path', url, { shouldDirty: true });
            }}
          />
        ) : (
          <>
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
          title="Market Positioning"
          titleEmphasis="Positioning"
          description="Your core modeling categories and market lanes."
          showDivider={false}
        >
          <div className={styles.formStack}>
            <Controller
              name="modeling_categories"
              control={control}
              render={({ field }) => (
                <fieldset className={styles.repFieldset}>
                  <legend className={styles.repLegend}>Categories</legend>
                  <div className={styles.repOptions} role="group" aria-label="Market Positioning">
                    {MODELING_CATEGORIES_OPTIONS.map((opt, index) => {
                      const numStr = String(index + 1).padStart(2, '0');
                      const currentValues = field.value || [];
                      const isActive = currentValues.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`${styles.repOption} ${isActive ? styles.repOptionActive : ''}`}
                        >
                          <input
                            type="checkbox"
                            value={opt.value}
                            checked={isActive}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...currentValues, opt.value]);
                              } else {
                                field.onChange(currentValues.filter(v => v !== opt.value));
                              }
                            }}
                            className={styles.repCheckboxHidden}
                          />
                          <span className={styles.repNum}>{numStr}</span>
                          <span className={styles.repLabel}>
                            {isActive ? <em>{opt.label}</em> : opt.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            />
          </div>
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

            {isStudioPlus ? (
              <article className={styles.movement}>
                <header className={styles.movementHead}>
                  <p className={styles.movementKicker}>V — Studio+</p>
                  <h2 className={styles.movementTitle}>
                    Website <em>analytics</em>
                  </h2>
                  <p className={styles.movementLede}>
                    Monitor how agencies discover and engage with your profile.
                  </p>
                </header>
                <div className={styles.movementCard}>
                  <section className={styles.studioAnalyticsSection} aria-label="Website analytics">
                    {analyticsLoading ? (
                      <p className={styles.studioAnalyticsMuted}>Loading analytics...</p>
                    ) : summaryError ? (
                      <p className={styles.studioAnalyticsMuted}>
                        Analytics are temporarily unavailable.
                      </p>
                    ) : (
                      <>
                        <div className={styles.studioAnalyticsGrid}>
                          <article className={styles.studioAnalyticsStat}>
                            <span className={styles.studioAnalyticsLabel}>
                              <Eye size={14} aria-hidden />
                              Profile Views
                            </span>
                            <p className={styles.studioAnalyticsValue}>{websiteViews.toLocaleString()}</p>
                            <span className={styles.studioAnalyticsMeta}>
                              {websiteViewDelta >= 0 ? '+' : ''}
                              {websiteViewDelta}% vs last period
                            </span>
                          </article>

                          <article className={styles.studioAnalyticsStat}>
                            <span className={styles.studioAnalyticsLabel}>
                              <MousePointerClick size={14} aria-hidden />
                              Engagement Events
                            </span>
                            <p className={styles.studioAnalyticsValue}>{engagementEvents.toLocaleString()}</p>
                            <span className={styles.studioAnalyticsMeta}>
                              Combined interactions from your public profile
                            </span>
                          </article>
                        </div>

                        <Link to="/dashboard/talent/analytics" className={styles.studioAnalyticsLink}>
                          <Activity size={14} aria-hidden />
                          Open detailed analytics
                        </Link>
                      </>
                    )}
                  </section>
                </div>
              </article>
            ) : null}

        </>
      )}
          </form>
        </main>

        {/* Right Sidebar - Profile Strength */}
        <ProfileStrengthSidebar
          strength={profileStrength}
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
