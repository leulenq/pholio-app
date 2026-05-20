import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import ProfileReadinessAudit from '../../components/ProfileReadinessAudit';
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

    // Keep tag fields as arrays for PholioTagInput rendering
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
  const [isImproving, setIsImproving] = useState(false);
  const [previousBio, setPreviousBio] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [readinessAuditOpen, setReadinessAuditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
  const [shoeRegion, setShoeRegion] = useState('US');
  
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
    formState: { errors, isDirty, isSubmitting } 
  } = useForm({
    resolver: zodResolver(profileSchema),
    mode: 'onBlur',
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

  // Explicitly register custom fields that use setValue instead of standard inputs
  useEffect(() => {
    const customFields = [
      'hero_image_path', 'height_cm', 'weight_kg', 'shoe_size', 
      'bust', 'waist', 'hips', 'inseam_cm', 
      'tattoos', 'piercings', 'availability_travel', 'drivers_license', 'passport_ready',
      'languages', 'specialties', 'comfort_levels', 'modeling_categories', 
      'union_membership', 'previous_representations', 'experience_details',
      'work_eligibility',
      'representation_status'
    ];
    customFields.forEach(field => register(field));
  }, [register]);

  // AI Bio Improvement Handler
  const handleAIImprove = async () => {
    const currentBio = watch('bio');
    if (!currentBio || currentBio.trim().length < 10) {
      toast.error('Please write a brief bio first (at least 10 characters)');
      return;
    }
    
    setPreviousBio(currentBio);
    setIsImproving(true);
    
    try {
      const data = await talentApi.refineBio({
        bio: currentBio,
        firstName: watch('first_name') || 'Talent',
        lastName: watch('last_name') || '',
      });

      setValue('bio', data.refined, { shouldDirty: true });
      toast.success(`Bio refined! (${data.wordCount} words)`);
    } catch (error) {
      console.error('AI improvement failed:', error);
      toast.error(error.message || 'Failed to improve bio. Please try again.');
      setPreviousBio(null); // Reset on error
    } finally {
      setIsImproving(false);
    }
  };

  // Undo AI Changes
  const handleUndoAI = () => {
    if (previousBio) {
      setValue('bio', previousBio, { shouldDirty: true });
      setPreviousBio(null);
      toast.info('Reverted to original bio');
    }
  };

  // Fetch real profile data on mount
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const data = await talentApi.getProfile();
        if (data && data.profile) {
          reset(normalizeProfileForForm(data.profile));

          // Sync imperial height state if needed
          if (data.profile.height_cm) {
            const { ft, in: inch } = cmToFeetInches(data.profile.height_cm);
            setHeightFt(ft);
            setHeightIn(inch);
          }
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error('Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    };
    loadProfile();
  }, [reset]);

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
  const { isCoreReady, missingCoreItems, fieldCompletion, scrollTargetByKey } = profileStrength;

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

  const onSubmit = async (data) => {
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
      // Response structure: { profile, completeness } (unwrapped by apiClient)
      if (res && res.profile) {
        // Sync local state with authoritative server response using the same normalizer as initial load.
        reset(normalizeProfileForForm(res.profile));

        // Invalidate and refetch ALL queries to sync entire dashboard
        // This ensures Header, Sidebar, Overview, and all components show fresh data
        await queryClient.invalidateQueries({ predicate: authUserPredicate });
        await queryClient.invalidateQueries({ queryKey: ['talent-activity'] });
        await queryClient.invalidateQueries({ queryKey: ['talent-analytics'] });

        await queryClient.refetchQueries({ predicate: authUserPredicate });

        toast.success('Profile saved successfully');
      }
    } catch (error) {
      console.error("Submission Error:", error);

      const topLevelErrors = error?.data?.errors;
      const nestedErrors = error?.data?.error?.errors;
      const validationErrors = topLevelErrors || nestedErrors;

      // Handle validation errors from API (both legacy and standardized shapes)
      if ((error.status === 400 || error.status === 422) && validationErrors) {
        // 1. Show a general warning toast
        toast.error('Validation failed. Please check the form.');

        // 2. Map errors back to form fields for inline display
        Object.keys(validationErrors).forEach(field => {
          const messages = validationErrors[field];
          if (Array.isArray(messages) && messages.length > 0) {
            // Map dob -> date_of_birth if needed, though they should match schema
            const formField = field === 'date_of_birth' ? 'date_of_birth' : field;
            
            setError(formField, {
              type: 'manual',
              message: messages[0] // Show the first error message for this field
            });

            // If it's a specific critical error, show it in a toast too
            if (field === 'date_of_birth') {
              toast.error(`Birth Date: ${messages[0]}`);
            }
          }
        });
      } else {
        const fallbackMessage =
          (typeof error?.data?.error?.message === 'string' && error.data.error.message) ||
          (typeof error?.data?.message === 'string' && error.data.message) ||
          error.message ||
          'Failed to save profile';
        toast.error(fallbackMessage);
      }
    }
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

  const heightDisplay = values.height_cm
    ? unitSystem === 'imperial'
      ? (() => {
          const { ft, in: inches } = cmToFeetInches(values.height_cm);
          return `${ft}'${inches}"`;
        })()
      : `${values.height_cm} cm`
    : null;

  const heroStatsLine = [heightDisplay, values.hair_color, values.eye_color, values.city]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.pageContainer}>
      {isGateEntry && !isCoreReady && (
        <div className={styles.gateBanner}>
          <p className={styles.gateBannerTitle}>
            Complete your profile to become visible to agencies
          </p>
          <p className={styles.gateBannerBody}>
            The following are required before you appear in agency searches:
          </p>
          <ul className={styles.gateBannerList}>
            {missingCoreItems.map((item) => (
              <li key={item} className={styles.gateBannerItem}>
                <span className={styles.gateBannerDot} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

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

            {values.work_status ? (
              <p className={styles.heroRole}>{String(values.work_status)}</p>
            ) : null}

            {heroStatsLine ? (
              <p className={styles.heroStats}>{heroStatsLine}</p>
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
            fieldCompletion={fieldCompletion}
          />
        </aside>

        {/* Center - Form Fields */}
        <main className={styles.centerContent}>
          {readinessAuditOpen && (
            <ProfileReadinessAudit
              fieldCompletion={fieldCompletion}
              scrollTargetByKey={scrollTargetByKey}
              isRequiredComplete={profileStrength.isRequiredComplete}
              onItemClick={(sectionId) => {
                scrollToProfileSection(sectionId);
                setReadinessAuditOpen(false);
              }}
              onClose={() => setReadinessAuditOpen(false)}
            />
          )}

          <form
            id="profile-form"
            onSubmit={handleSubmit(onSubmit)}
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
              isImproving={isImproving}
              previousBio={previousBio}
              handleAIImprove={handleAIImprove}
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
          kicker="Experience"
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
          kicker="Training"
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
                  <PholioTagInput
                    label="Languages (Tags)"
                    id="languages"
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.languages}
                    placeholder="Type language and press Enter..."
                  />
                )}
              />
            </div>
          </div>
        </Section>

        <Section
          id="roles"
          kicker="Roles"
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

          {/* Modeling Categories */}
          <div className={styles.formRow}>
            <Controller
              name="modeling_categories"
              control={control}
              render={({ field }) => (
                <PholioMultiSelect
                  label="Modeling Categories"
                  id="modeling_categories"
                  options={MODELING_CATEGORIES_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.modeling_categories}
                  placeholder="Select the categories you work in"
                />
              )}
            />
          </div>

          {/* Availability */}
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
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
            <div className={styles.toggleField} style={{ alignSelf: 'end' }}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleContent}>
                  <span className={styles.toggleName}>Open to Travel</span>
                  <p className={styles.toggleDescription}>Willing to travel for jobs</p>
                </div>
              </div>
              <PholioToggle 
                checked={watch('availability_travel') || false}
                onChange={(e) => setValue('availability_travel', e.target.checked, { shouldDirty: true })}
              />
            </div>
            <div className={styles.toggleField} style={{ alignSelf: 'end' }}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleContent}>
                  <span className={styles.toggleName}>Driver's License</span>
                  <p className={styles.toggleDescription}>Valid driver's license</p>
                </div>
              </div>
              <PholioToggle 
                checked={watch('drivers_license') || false}
                onChange={(e) => setValue('drivers_license', e.target.checked, { shouldDirty: true })}
              />
            </div>
            <Controller
              name="work_eligibility"
              control={control}
              render={({ field }) => {
                const current =
                  field.value === true ? 'yes' : field.value === false ? 'no' : 'unset';
                return (
                  <fieldset className={styles.workEligibilityFieldset}>
                    <legend className={styles.workEligibilityLegend}>Work eligibility</legend>
                    <p className={styles.workEligibilityHint}>
                      Authorized to work in your primary market (employment / right-to-work).
                    </p>
                    <div className={styles.workEligibilityOptions} role="radiogroup" aria-label="Work eligibility">
                      {[
                        { id: 'we-yes', val: 'yes', label: 'Yes, authorized' },
                        { id: 'we-no', val: 'no', label: 'No, not yet' },
                        { id: 'we-unset', val: 'unset', label: 'Prefer not to say' }
                      ].map((opt) => (
                        <label
                          key={opt.val}
                          htmlFor={opt.id}
                          className={`${styles.workEligibilityOption} ${
                            current === opt.val ? styles.workEligibilityOptionActive : ''
                          }`}
                        >
                          <input
                            id={opt.id}
                            type="radio"
                            name={field.name}
                            checked={current === opt.val}
                            onChange={() => {
                              const next =
                                opt.val === 'yes' ? true : opt.val === 'no' ? false : null;
                              field.onChange(next);
                            }}
                            onBlur={field.onBlur}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }}
            />
            <div className={styles.toggleField} style={{ alignSelf: 'end' }}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleContent}>
                  <span className={styles.toggleName}>Passport Ready</span>
                  <p className={styles.toggleDescription}>Available for international travel jobs</p>
                </div>
              </div>
              <PholioToggle
                checked={watch('passport_ready') || false}
                onChange={(e) => setValue('passport_ready', e.target.checked, { shouldDirty: true })}
              />
            </div>
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
          kicker="Emergency"
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

        </>
      )}
          </form>
        </main>

        {/* Right Sidebar - Profile Strength */}
        <ProfileStrengthSidebar
          strength={profileStrength}
          isSaving={isSubmitting}
          isDisabled={!isDirty || isSubmitting}
          auditOpen={readinessAuditOpen}
          onToggleAudit={() => {
            setReadinessAuditOpen((open) => {
              const next = !open;
              if (next) {
                window.setTimeout(() => {
                  document.getElementById('readiness-audit-title')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }, 50);
              }
              return next;
            });
          }}
          onSaveClick={() => {
            if (Object.keys(errors).length > 0) {
              toast.error('Please fix validation errors before saving');
            }
          }}
          onItemClick={scrollToProfileSection}
        />

      </div>{/* End layoutGrid */}
    </div>
  );
}
