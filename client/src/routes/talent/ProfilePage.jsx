import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Sparkles, Check, Menu, X, PenTool, Disc, Camera, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useProfileStrength } from '../../hooks/useProfileStrength';
import { talentApi } from '../../api/talent';
import { profileSchema } from '../../schemas/profileSchema';
import {
  PholioInput,
  PholioToggle,
  PholioTextarea
} from '../../components/ui/forms';
import PholioMeasuringTape from '../../components/ui/forms/PholioMeasuringTape';
import PholioCustomSelect from '../../components/ui/forms/PholioCustomSelect';
import PholioMultiSelect from '../../components/ui/forms/PholioMultiSelect';
import PholioTagInput from '../../components/ui/forms/PholioTagInput';
import CreditsEditor from '../../components/ui/forms/CreditsEditor';
import { Controller } from 'react-hook-form';
import ProfileNav from '../../components/dashboard/ProfileNav';
import ProfileStrengthSidebar from '../../components/profile/ProfileStrengthSidebar';
import { calculateProfileStrength, getStrengthUI } from '../../utils/profileScoring';
import PhotosTab from '../../components/talent/profile/PhotosTab';
import {
  Section,
  SocialInput,
  IdentitySection,
  RepresentationSection
} from '../../components/profile';
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  getShoeConversions,
  tryJsonJoin
} from '../../utils/measurementConversions';

import styles from './ProfilePage.module.css';

// Components and utilities are now imported from separate files

const ETHNICITY_OPTIONS = [
  { value: 'Black/African Descent', label: 'Black / African Descent' },
  { value: 'East Asian', label: 'East Asian' },
  { value: 'South Asian', label: 'South Asian' },
  { value: 'Southeast Asian', label: 'Southeast Asian' },
  { value: 'Hispanic/Latino', label: 'Hispanic / Latino' },
  { value: 'Middle Eastern', label: 'Middle Eastern' },
  { value: 'Native American/First Nations', label: 'Native American / First Nations' },
  { value: 'Pacific Islander', label: 'Pacific Islander' },
  { value: 'White/Caucasian', label: 'White / Caucasian' },
  { value: 'Mixed Heritage', label: 'Mixed Heritage' }
];

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
  const { user, subscription } = useAuth(); 
  const { score: officialScore } = useProfileStrength();
  const queryClient = useQueryClient();
  const [isImproving, setIsImproving] = useState(false);
  const [previousBio, setPreviousBio] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
  const [shoeRegion, setShoeRegion] = useState('US');
  
  // Scroll Spy State
  const [activeSection, setActiveSection] = useState('identity');
  
  // Local state for Imperial height display
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  
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
      tattoos: false,
      piercings: false,
      work_eligibility: false,
      availability_travel: false,
      drivers_license: false,
    }
  });

  // DEBUG: Test schema validation manually on mount
  useEffect(() => {
    const testData = { date_of_birth: null, experience_level: null };
    const result = profileSchema.safeParse(testData);
    console.log('[Schema Debug] Testing null values:', { 
      input: testData, 
      success: result.success, 
      errors: result.error?.format() 
    });
  }, []);

  // Explicitly register custom fields that use setValue instead of standard inputs
  useEffect(() => {
    const customFields = [
      'hero_image_path', 'height_cm', 'weight_kg', 'shoe_size', 
      'bust', 'waist', 'hips', 'inseam_cm', 
      'tattoos', 'piercings', 'availability_travel', 'drivers_license', 'passport_ready',
      'languages', 'specialties', 'comfort_levels', 'modeling_categories', 
      'union_membership', 'previous_representations', 'experience_details',
      'work_eligibility'
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
      const response = await fetch('/api/talent/bio/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bio: currentBio,
          firstName: watch('first_name') || 'Talent',
          lastName: watch('last_name') || ''
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refine bio');
      }

      const data = await response.json();
      
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
          const cleanData = {
            ...data.profile,
            // Map backend fields to frontend Zod schema
            // Explicitly clean nullable text fields to avoid validation errors
            bio: data.profile.bio_raw || data.profile.bio || '', 
            first_name: data.profile.first_name || '',
            last_name: data.profile.last_name || '',
            email: data.profile.email || '',
            
            city: data.profile.city ? String(data.profile.city) : null,
            city_secondary: data.profile.city_secondary ? String(data.profile.city_secondary) : null,
            gender: data.profile.gender ? String(data.profile.gender) : null,
            pronouns: data.profile.pronouns ? String(data.profile.pronouns) : null,
            date_of_birth: data.profile.date_of_birth ? new Date(data.profile.date_of_birth).toISOString().split('T')[0] : null,
            ethnicity: data.profile.ethnicity || null, // Array or string handled by component
            nationality: data.profile.nationality ? String(data.profile.nationality) : null,
            place_of_birth: data.profile.place_of_birth ? String(data.profile.place_of_birth) : null,
            timezone: data.profile.timezone ? String(data.profile.timezone) : null,

            // Details
            dress_size: data.profile.dress_size ? String(data.profile.dress_size) : null,
            hair_length: data.profile.hair_length ? String(data.profile.hair_length) : null,
            hair_color: data.profile.hair_color ? String(data.profile.hair_color) : null,
            hair_type: data.profile.hair_type ? String(data.profile.hair_type) : null,
            eye_color: data.profile.eye_color ? String(data.profile.eye_color) : null,
            skin_tone: data.profile.skin_tone ? String(data.profile.skin_tone) : null,
            body_type: data.profile.body_type ? String(data.profile.body_type) : null,

            // Professional
            work_status: data.profile.work_status ? String(data.profile.work_status) : null,
            availability_schedule: data.profile.availability_schedule ? String(data.profile.availability_schedule) : null,
            current_agency: data.profile.current_agency ? String(data.profile.current_agency) : null,
            // Maintain JSON array or string structure for CreditsEditor
            experience_details: data.profile.experience_details 
              ? (typeof data.profile.experience_details === 'string' 
                   ? (data.profile.experience_details.startsWith('[') ? JSON.parse(data.profile.experience_details) : data.profile.experience_details)
                   : data.profile.experience_details)
              : null,
            emergency_contact_name: data.profile.emergency_contact_name ? String(data.profile.emergency_contact_name) : null,
            emergency_contact_phone: data.profile.emergency_contact_phone ? String(data.profile.emergency_contact_phone) : null,
            emergency_contact_relationship: data.profile.emergency_contact_relationship ? String(data.profile.emergency_contact_relationship) : null,

            // Preserve nulls for completeness checks
            seeking_representation: !!data.profile.seeking_representation,
            tattoos: !!data.profile.tattoos,
            piercings: !!data.profile.piercings,
            // Convert 'Yes'/'No' strings or booleans to strict boolean for the frontend schema
            work_eligibility: data.profile.work_eligibility === 'Yes' ? true : 
                              data.profile.work_eligibility === 'No' ? false : 
                              !!data.profile.work_eligibility,
            // Ensure measurements are numbers for the inputs (backend sends numbers now)
            bust: data.profile.bust_cm ? Number(data.profile.bust_cm) : null,
            waist: data.profile.waist_cm ? Number(data.profile.waist_cm) : null,
            hips: data.profile.hips_cm ? Number(data.profile.hips_cm) : null,
            
            // Map backend fields to frontend names
            training_summary: data.profile.training || '', // Map 'training' col to 'training_summary'
            experience_level: data.profile.experience_level ? String(data.profile.experience_level) : null,
            
            // Map JSON arrays to comma-separated strings for Textareas
            languages: Array.isArray(data.profile.languages) 
              ? data.profile.languages.join(', ') 
              : (typeof data.profile.languages === 'string' ? JSON.parse(data.profile.languages).join(', ') : data.profile.languages || ''),
              
            specialties: Array.isArray(data.profile.specialties)
              ? data.profile.specialties.join(', ')
              : (typeof data.profile.specialties === 'string' ? JSON.parse(data.profile.specialties).join(', ') : data.profile.specialties || ''),
          };
          reset(cleanData);

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
      'details': 'identity',
      'identity': 'identity',
      'heritage': 'heritage',
      'physical': 'appearance',
      'appearance': 'appearance',
      'credits': 'credits',
      'training': 'training',
      'roles': 'roles',
      'representation': 'representation',
      'socials': 'socials',
      'contact': 'contact',
      'photos': 'hero-section',
      'about': 'identity',
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

  // Calculate Profile Strength (Live Preview)
  const liveStrength = calculateProfileStrength(values);
  const { score: strength, isCoreReady, missingCoreItems, nextSteps: calculatedNextSteps } = liveStrength;
  const strengthUI = getStrengthUI(strength);

  const getNextSteps = () => {
    // Use the unified nextSteps from calculator
    if (calculatedNextSteps && calculatedNextSteps.length > 0) {
        return calculatedNextSteps.map(step => ({
            label: step.title,
            points: step.impact // Mapping 'impact' to 'points' for UI display
        }));
    }
    return [];
  };

  const nextSteps = getNextSteps();

  const onSubmit = async (data) => {
    try {
      // 1. Transform Frontend Strings -> Backend Arrays/JSON
      const payload = { ...data };
      
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
      ['ethnicity', 'comfort_levels', 'modeling_categories', 'union_membership', 'previous_representations'].forEach(field => {
        if (typeof payload[field] === 'string') {
          try {
             payload[field] = JSON.parse(payload[field]);
          } catch(e) {
             payload[field] = payload[field] ? [payload[field]] : [];
          }
        }
      });
      // Handle experience_details (Key Credits) - split by newlines for JSON array
      if (typeof payload.experience_details === 'string') {
        payload.experience_details = payload.experience_details
          .split(/\n|,\s*/) // Split by newline OR comma
          .map(s => s.trim())
          .filter(Boolean);
      }

      const res = await talentApi.updateProfile(payload);
      // Response structure: { profile, completeness } (unwrapped by apiClient)
      if (res && res.profile) {
        // Sync local state with authoritative server response
        const serverProfile = {
           ...res.profile,
           bio: res.profile.bio_raw || res.profile.bio || '',
           seeking_representation: !!res.profile.seeking_representation,
           tattoos: !!res.profile.tattoos,
           piercings: !!res.profile.piercings,
           work_eligibility: res.profile.work_eligibility === 'Yes' ? true : 
                             res.profile.work_eligibility === 'No' ? false : 
                             !!res.profile.work_eligibility,
           date_of_birth: res.profile.date_of_birth ? new Date(res.profile.date_of_birth).toISOString().split('T')[0] : null,
           bust: res.profile.bust_cm ? Number(res.profile.bust_cm) : null,
           waist: res.profile.waist_cm ? Number(res.profile.waist_cm) : null,
           hips: res.profile.hips_cm ? Number(res.profile.hips_cm) : null,
           
           training_summary: res.profile.training || '',
           
           languages: Array.isArray(res.profile.languages) 
             ? res.profile.languages.join(', ') 
             : (typeof res.profile.languages === 'string' ? tryJsonJoin(res.profile.languages) : res.profile.languages || ''),

           specialties: Array.isArray(res.profile.specialties)
             ? res.profile.specialties.join(', ')
             : (typeof res.profile.specialties === 'string' ? tryJsonJoin(res.profile.specialties) : res.profile.specialties || ''),
        };
        reset(serverProfile);

        // Invalidate and refetch ALL queries to sync entire dashboard
        // This ensures Header, Sidebar, Overview, and all components show fresh data
        await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
        await queryClient.invalidateQueries({ queryKey: ['talent-activities'] });
        await queryClient.invalidateQueries({ queryKey: ['talent-analytics'] });

        // Force immediate refetch of auth data to update Header/Sidebar
        await queryClient.refetchQueries({ queryKey: ['auth-user'] });

        toast.success('Profile saved successfully');
      }
    } catch (error) {
      console.error("Submission Error:", error);
      
      // Handle Validation Errors from API
      if (error.status === 400 && error.data?.errors) {
        const validationErrors = error.data.errors;
        
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
        toast.error(error.message || 'Failed to save profile');
      }
    }
  };
  // Get hero display data from form values
  const firstName = values.first_name || 'Your';
  const lastName = values.last_name || 'Name';
  const city = values.city || 'Location';
  const talentType = values.work_status || 'Talent';
  
  // Hero image sourced from form state (updated by API or upload)
  const heroImage = watch('hero_image_path'); // Now watching the actual field

  // Dynamic strength message
  const getStrengthMessage = (pct) => {
    if (pct === 100) return "Perfect! You're ready.";
    if (pct >= 70) return "Almost there! Keep going.";
    if (pct >= 35) return "Great start! Add more details.";
    return "Let's build your profile.";
  };

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

  return (
    <div className={styles.pageContainer}>
      {isGateEntry && !isCoreReady && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900 mb-1">
            Complete your profile to become visible to agencies
          </p>
          <p className="text-xs text-amber-700 mb-3">
            The following sections are required before you appear in agency searches:
          </p>
          <ul className="space-y-1">
            {missingCoreItems.map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Background Ambiance */}
      <div className={styles.ambianceContainer}>
        <div className={`${styles.particle} ${styles.particle1}`} />
        <div className={`${styles.particle} ${styles.particle2}`} />
        <div className={`${styles.particle} ${styles.particle3}`} />
        <div className={`${styles.particle} ${styles.particle4}`} />
        <div className={`${styles.particle} ${styles.particle5}`} />
        <div className={`${styles.particle} ${styles.particle6}`} />
      </div>

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

      {/* Hero Section */}
      <div id="hero-section" className={styles.heroSection}>
        {heroImage ? (
          <>
            <img 
              src={heroImage} 
              alt={`${firstName} ${lastName}`} 
              className={`${styles.heroImage} border-4 border-[#C9A55A]`} 
            />
            <div className={styles.heroOverlay} />
          </>
        ) : (
          <>
            <div className={styles.heroNoPhotoBg} />
            <div 
              className={styles.addPhotoPrompt}
              onClick={() => {
                setSearchParams({ tab: 'photos' });
                // Optional: Scroll down slightly if needed, but switching tabs usually keeps scroll position or resets it based on logic.
                // The useEffect for 'tab' change will handle scrolling if configured to do so.
              }}
            >
              <Camera size={20} />
              <span>Add your best shot to get started</span>
            </div>
          </>
        )}
        
        <div className={styles.heroContent}>
          <h1 className={styles.heroName}>
            <span className={styles.shimmerText}>{firstName} {lastName}</span>
            {subscription?.isPro && <span className={styles.studioBadge}>Studio+</span>}
          </h1>
          
          <p className={styles.heroTagline}>
            {[
              values.height_cm ? `${values.height_cm} CM` : null,
              values.city
            ].filter(Boolean).join(' • ') || 'LOS ANGELES'}
          </p>
        </div>
      </div>

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
            onSubmit={handleSubmit(onSubmit)}
            className={isSubmitting ? styles.formSaving : ''}
            aria-busy={isSubmitting}
          >

        {searchParams.get('tab') === 'photos' ? (
           <Section id="photos-tab" title="" description="" showDivider={false}>
              <PhotosTab onPhotoUploaded={(url) => {
                 // Optimistically update hero if empty
                 if (!watch('hero_image_path')) {
                   setValue('hero_image_path', url);
                 }
              }} />
           </Section>
        ) : (
          <>
        {/* IDENTITY - First section, no divider */}
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

        {/* IDENTITY EXTRA: Ethnicity, Nationality, Place of Birth */}
        <Section id="heritage" title="Heritage & Background" description="Helps match you with diverse casting calls.">
          <div className={styles.formRow}>
            <Controller
              name="ethnicity"
              control={control}
              render={({ field }) => (
                <PholioMultiSelect
                  label="Ethnicity / Heritage"
                  id="ethnicity"
                  options={ETHNICITY_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.ethnicity}
                  placeholder="Select ethnicity (multi-select)"
                />
              )}
            />
          </div>
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <PholioInput
              label="Nationality"
              placeholder="e.g. American"
              {...register('nationality')}
              error={errors.nationality}
            />
            <PholioInput
              label="Place of Birth"
              placeholder="e.g. Los Angeles, CA"
              {...register('place_of_birth')}
              error={errors.place_of_birth}
            />
          </div>
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <PholioInput
              label="Secondary City"
              placeholder="Also based in..."
              {...register('city_secondary')}
              error={errors.city_secondary}
            />
          </div>
        </Section>

        {/* APPEARANCE (PHYSICAL ATTRIBUTES) REDESIGN */}
        <Section 
          id="appearance" 
          title="Physical Attributes" 
          description="Vital statistics for casting searches."
          headerAction={
            <div className={styles.unitToggle}>
              <button 
                type="button"
                className={`${styles.toggleBtn} ${unitSystem === 'metric' ? styles.toggleBtnActive : ''}`}
                onClick={() => setUnitSystem('metric')}
              >
                Metric
              </button>
              <button 
                type="button"
                className={`${styles.toggleBtn} ${unitSystem === 'imperial' ? styles.toggleBtnActive : ''}`}
                onClick={() => setUnitSystem('imperial')}
              >
                Imperial
              </button>
            </div>
          }
        >
          {/* Height & Weight */}
          <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ marginBottom: '32px' }}>
            <div className={styles.measurementField} style={{ gridColumn: 'span 2' }}>
              <label className={styles.measurementLabel}>Height</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('height_cm')
                  : watch('height_cm') ? Math.round(watch('height_cm') / 2.54) : null
                }
                unit={unitSystem === 'metric' ? 'cm' : 'in'}
                min={unitSystem === 'metric' ? 130 : 50}
                max={unitSystem === 'metric' ? 230 : 90}
                formatter={unitSystem === 'imperial' ? (val) => {
                  const ft = Math.floor(val / 12);
                  const inRemainder = Math.round(val % 12);
                  return `${ft}'${inRemainder}"`;
                } : null}
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
                  setValue('height_cm', metricVal, { shouldDirty: true });
                }}
              />
              <span className={styles.conversionHint} style={{ textAlign: 'center', width: '100%', top: '100%', marginTop: '4px' }}>
                {unitSystem === 'metric' 
                  ? cmToFeetInches(watch('height_cm')).ft + "'" + cmToFeetInches(watch('height_cm')).in + '"' 
                  : `${watch('height_cm')} cm`
                }
              </span>
            </div>

            <div className={styles.measurementField}>
              <label className={styles.measurementLabel}>Weight</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('weight_kg')
                  : watch('weight_kg') ? Math.round(watch('weight_kg') * 2.20462) : null
                }
                unit={unitSystem === 'metric' ? 'kg' : 'lbs'}
                min={unitSystem === 'metric' ? 30 : 70}
                max={unitSystem === 'metric' ? 150 : 330}
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val / 2.20462);
                  setValue('weight_kg', metricVal, { shouldDirty: true });
                }}
              />
              <span className={styles.conversionHint} style={{ textAlign: 'center', width: '100%', top: '100%', marginTop: '4px' }}>
                {unitSystem === 'metric' 
                  ? `${kgToLbs(watch('weight_kg'))} lbs`
                  : `${watch('weight_kg')} kg`
                }
              </span>
            </div>
          </div>

          {/* Shoe Size - Redesigned UI */}
          <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ margin: '32px 0' }}>
            <div className={styles.measurementField} style={{ gridColumn: 'span 3' }}>
              <div className={styles.shoeContainer}>
                <div className={styles.shoeHeader}>
                  <label className={styles.measurementLabel}>Shoe Size</label>
                  <div className={styles.shoeRegionToggle}>
                    {['US', 'UK', 'EU'].map((reg) => (
                      <button
                        key={reg}
                        type="button"
                        className={`${styles.regionBtn} ${shoeRegion === reg ? styles.regionBtnActive : ''}`}
                        onClick={() => setShoeRegion(reg)}
                      >
                        {reg}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className={styles.shoeSelector}>
                  <div className={styles.shoeValueGroup}>
                    <PholioInput 
                      type="number" 
                      step="0.5"
                      placeholder="9.5" 
                      className={styles.shoeMainInput}
                      value={watch('shoe_size') || ''}
                      onChange={(e) => setValue('shoe_size', e.target.value ? parseFloat(e.target.value) : null, { shouldDirty: true })}
                    />
                    <span className={styles.shoeRegionLabel}>{shoeRegion}</span>
                  </div>
                  
                  {watch('shoe_size') && (
                    <div className={styles.shoeConversions}>
                      <div className={styles.shoeConvItem}>
                        <span className={styles.shoeConvValue}>
                          {getShoeConversions(watch('shoe_size'), shoeRegion)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Body Measurements */}
          <div className={`${styles.measurementRow} ${styles.formRow}`} style={{ gap: '16px' }}>
            <div className={styles.measurementField}>
              <label className={styles.measurementLabel}>{watch('gender') === 'Female' ? 'Bust' : 'Chest'}</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('bust')
                  : watch('bust') ? Math.round(watch('bust') / 2.54) : null
                }
                unit={unitSystem === 'metric' ? 'cm' : 'in'}
                min={unitSystem === 'metric' ? 70 : 28}
                max={unitSystem === 'metric' ? 130 : 52}
                size="small"
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
                  setValue('bust', metricVal, { shouldDirty: true });
                }}
              />
            </div>

            <div className={styles.measurementField}>
              <label className={styles.measurementLabel}>Waist</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('waist')
                  : watch('waist') ? Math.round(watch('waist') / 2.54) : null
                }
                unit={unitSystem === 'metric' ? 'cm' : 'in'}
                min={unitSystem === 'metric' ? 50 : 20}
                max={unitSystem === 'metric' ? 120 : 48}
                size="small"
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
                  setValue('waist', metricVal, { shouldDirty: true });
                }}
              />
            </div>

            <div className={styles.measurementField}>
              <label className={styles.measurementLabel}>Hips</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('hips')
                  : watch('hips') ? Math.round(watch('hips') / 2.54) : null
                }
                unit={unitSystem === 'metric' ? 'cm' : 'in'}
                min={unitSystem === 'metric' ? 70 : 28}
                max={unitSystem === 'metric' ? 130 : 52}
                size="small"
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
                  setValue('hips', metricVal, { shouldDirty: true });
                }}
              />
            </div>
          </div>

          {/* Dress Size & Inseam */}
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <PholioInput
              label="Dress / Suit Size"
              placeholder="e.g. 6, M, 38"
              error={errors.dress_size}
              {...register('dress_size')}
            />
            <div className={styles.measurementField}>
              <label className={styles.measurementLabel}>Inseam</label>
              <PholioMeasuringTape 
                value={unitSystem === 'metric' 
                  ? watch('inseam_cm')
                  : watch('inseam_cm') ? Math.round(watch('inseam_cm') / 2.54) : null
                }
                unit={unitSystem === 'metric' ? 'cm' : 'in'}
                min={unitSystem === 'metric' ? 50 : 20}
                max={unitSystem === 'metric' ? 110 : 44}
                size="small"
                onChange={(val) => {
                  const metricVal = unitSystem === 'metric' ? val : Math.round(val * 2.54);
                  setValue('inseam_cm', metricVal, { shouldDirty: true });
                }}
              />
            </div>
          </div>

          {/* Selection Fields */}
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <Controller
              name="eye_color"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Eye Color"
                  id="eye_color"
                  options={[
                    { value: 'Brown', label: 'Brown' },
                    { value: 'Blue', label: 'Blue' },
                    { value: 'Green', label: 'Green' },
                    { value: 'Hazel', label: 'Hazel' },
                    { value: 'Gray', label: 'Gray' },
                    { value: 'Amber', label: 'Amber' },
                    { value: 'Other', label: 'Other' }
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.eye_color}
                  placeholder="Select eye color"
                />
              )}
            />
            <Controller
              name="hair_color"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Hair Color"
                  id="hair_color"
                  options={['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Other'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.hair_color}
                  placeholder="Select hair color"
                />
              )}
            />
          </div>

          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <Controller
              name="hair_length"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Hair Length"
                  id="hair_length"
                  options={['Bald', 'Short', 'Medium', 'Long', 'Very Long'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.hair_length}
                  placeholder="Select length"
                />
              )}
            />
            <PholioInput label="Skin Tone" placeholder="e.g. Fair, Olive, Dark" error={errors.skin_tone} {...register('skin_tone')} />
          </div>

          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <Controller
              name="hair_type"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Hair Type / Texture"
                  id="hair_type"
                  options={['Straight', 'Wavy', 'Curly', 'Coily', 'Locs', 'Shaved'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.hair_type}
                  placeholder="Select texture"
                />
              )}
            />
            <Controller
              name="body_type"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Body Type / Build"
                  id="body_type"
                  options={['Slim', 'Athletic', 'Average', 'Curvy', 'Plus-size', 'Muscular'].map(c => ({value: c, label: c}))}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.body_type}
                  placeholder="Select build"
                />
              )}
            />
          </div>

          {/* Toggles */}
          <div className={styles.attributeToggles}>
            <div className={styles.toggleField}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleIcon}>
                  <PenTool size={22} />
                </div>
                <div className={styles.toggleContent}>
                  <span className={styles.toggleName}>Visible Tattoos</span>
                  <p className={styles.toggleDescription}>Tattoos visible in standard clothing</p>
                </div>
              </div>
              <PholioToggle 
                checked={watch('tattoos') || false}
                onChange={(e) => setValue('tattoos', e.target.checked, { shouldDirty: true })}
              />
            </div>

            <div className={styles.toggleField}>
              <div className={styles.toggleInfo}>
                <div className={styles.toggleIcon}>
                  <Disc size={22} />
                </div>
                <div className={styles.toggleContent}>
                  <span className={styles.toggleName}>Piercings</span>
                  <p className={styles.toggleDescription}>Any visible body piercings</p>
                </div>
              </div>
              <PholioToggle 
                checked={watch('piercings') || false}
                onChange={(e) => setValue('piercings', e.target.checked, { shouldDirty: true })}
              />
            </div>
          </div>
        </Section>

        {/* CREDITS (moved before Training) */}
        <Section id="credits" title="Credits & Experience" description="Your experience and past work.">
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

        {/* TRAINING (after Credits) */}
        <Section id="training" title="Training & Skills" description="Your professional background and skills.">
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

        {/* ROLES & STYLE */}
        <Section id="roles" title="Roles & Style" description="What kind of work you specialize in.">
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
          </div>
        </Section>

        {/* REPRESENTATION */}
        <RepresentationSection
          register={register}
          control={control}
          errors={errors}
          values={values}
        />

        {/* SOCIALS & MEDIA */}
        <Section id="socials" title="Socials & Media" description="Link your profiles and portfolio.">
          <div className={styles.socialGrid}>
            <SocialInput 
              label="Instagram" 
              name="instagram_handle" 
              placeholder="e.g. https://instagram.com/username"
              base="https://instagram.com/"
              prefix="@"
              control={control}
              setValue={setValue}
              error={errors.instagram_handle}
            />
            <SocialInput 
              label="TikTok" 
              name="tiktok_handle" 
              placeholder="e.g. https://tiktok.com/@username"
              base="https://tiktok.com/@"
              prefix="@"
              control={control}
              setValue={setValue}
              error={errors.tiktok_handle}
            />
          </div>
          <div className={`${styles.socialGrid} ${styles.formRow}`}>
            <SocialInput 
              label="Twitter / X" 
              name="twitter_handle" 
              placeholder="e.g. https://x.com/username"
              base="https://x.com/"
              prefix="@"
              control={control}
              setValue={setValue}
              error={errors.twitter_handle}
            />
            <SocialInput 
              label="YouTube Channel" 
              name="youtube_handle" 
              placeholder="e.g. https://youtube.com/channel/..."
              base="https://youtube.com/"
              control={control}
              setValue={setValue}
              error={errors.youtube_handle}
            />
          </div>
          <div className={`${styles.formGrid2} ${styles.formRow}`}>
            <SocialInput 
              label="Website / Portfolio" 
              name="portfolio_url" 
              placeholder="https://yourwebsite.com"
              control={control}
              setValue={setValue}
              error={errors.portfolio_url}
            />
            <PholioInput
              label="Video Reel URL"
              placeholder="https://vimeo.com/... or YouTube link"
              error={errors.video_reel_url}
              {...register('video_reel_url')}
            />
          </div>
        </Section>

        {/* CONTACT */}
        <Section id="contact" title="Contact & Emergency" description="Emergency contact information.">
          <div className={`${styles.formGrid3} ${styles.formRow}`}>
            <PholioInput label="Emergency Contact" placeholder="Name" error={errors.emergency_contact_name} {...register('emergency_contact_name')} />
            <PholioInput label="Phone" placeholder="+1..." error={errors.emergency_contact_phone} {...register('emergency_contact_phone')} />
            <PholioInput label="Relationship" placeholder="e.g. Mother" error={errors.emergency_contact_relationship} {...register('emergency_contact_relationship')} />
          </div>
        </Section>

        </>
      )}
          </form>
        </main>

        {/* Right Sidebar - Profile Strength */}
        <ProfileStrengthSidebar 
          values={values}
          isSaving={isSubmitting}
          isDisabled={!isDirty || isSubmitting}
          onSaveClick={(e) => {
             if (Object.keys(errors).length > 0) {
                 toast.error('Please fix validation errors before saving');
                 const firstErrorField = Object.keys(errors)[0];
                 if (firstErrorField) {
                     console.log('Validation Error:', firstErrorField, errors[firstErrorField].message);
                 }
             }
          }}
          onItemClick={(sectionId) => {
            const element = document.getElementById(sectionId);
            if (element) {
              const offset = 100;
              const elementPosition = element.getBoundingClientRect().top + window.scrollY;
              const offsetPosition = elementPosition - offset;
              window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
          }}
        />

      </div>{/* End layoutGrid */}
    </div>
  );
}
