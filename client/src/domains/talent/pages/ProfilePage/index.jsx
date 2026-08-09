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
import { NAV_LABELS_BY_ID } from '../../components/profileNavItems';
import ProfileStrengthSidebar from '../../components/ProfileStrengthSidebar';
import { calculateProfileStrength } from '../../../../shared/utils/profileScoring';
import {
  Section,
  RepresentationSection
} from '../../components/profile-index';
import { cmToFeetInches } from '../../../../shared/utils/measurementConversions';
import { formatPhoneDisplay } from '../../../../shared/lib/phone-format';
import { formatLocation } from '../../../../shared/utils/locationFormat';
import { IdentitySection } from './IdentitySection';
import { DisciplineSection } from './DisciplineSection';
import { MeasurementsSection } from './MeasurementsSection';
import { AvailabilitySection } from './AvailabilitySection';
import { SocialSection } from './SocialSection';
import { VerifiedAdultSection } from './VerifiedAdultSection';
import WritingAssistToolbar from '../../../../shared/components/writing/WritingAssistToolbar';
import PholioButton, {
  PholioIconButton,
} from '../../../../shared/components/ui/PholioButton';
import { parseApiFailure } from '../../../../shared/lib/api-error-message';
import { useReferenceLanguages } from '../../../../shared/hooks/useReferenceLanguages';
import { flushProfileFormForSave } from './flushProfileFormForSave';
import {
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
  SENSITIVE_MEASUREMENT_FIELDS,
} from '../../../../shared/utils/talentAge';
import styles from './ProfilePage.module.css';

import {
  normalizeProfileForForm,
  normalizeProfileForSave
} from '../../../../shared/utils/formNormalization';

const UNION_OPTIONS = [
  { value: 'Non-Union', label: 'Non-Union' },
  { value: 'SAG-AFTRA', label: 'SAG-AFTRA' },
  { value: 'Equity (US)', label: 'Actors\' Equity Association (AEA)' },
  { value: 'Equity (UK)', label: 'Equity (UK)' },
  { value: 'ACTRA', label: 'ACTRA' },
  { value: 'UAD', label: 'Union des artistes (UDA)' }
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
  'discipline',
  'appearance',
  'credits',
  'training',
  'representation',
  'socials',
  'private',
  'contact',
];

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
  const [guardianSending, setGuardianSending] = useState(false);
  const [guardianLinkSent, setGuardianLinkSent] = useState(false);
  const [guardianSentTo, setGuardianSentTo] = useState('');
  const [readinessAuditOpen, setReadinessAuditOpen] = useState(false);
  const [gateItemsExpanded, setGateItemsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pageRef = useRef(null);
  const saveRequestRef = useRef(0);
  const saveDirtyFieldNamesRef = useRef([]);
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'
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
    formState: { errors, dirtyFields, isSubmitting }
  } = useForm({
    resolver: zodResolver(profileSchema),
    mode: 'onTouched',
    defaultValues: {
      seeking_representation: false,
      representation_status: 'not_seeking',
      representations: [],
      tattoos: false,
      piercings: false,
      work_eligibility: null,
      passport_ready: false,
      availability_travel: false,
      drivers_license: false,
    }
  });
  const hasChanges = Object.keys(dirtyFields).length > 0;

  // Register setValue-only fields not wired through register() or Controller
  useEffect(() => {
    const customFields = [
      'hero_image_path', 'height_cm', 'weight_kg', 'shoe_size', 'shoe_region',
      'bust_cm', 'waist_cm', 'hips_cm', 'inseam_cm',
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

  const handleSendGuardianLink = async () => {
    // Firefox auto-fill can bypass React onChange. Fallback to reading the DOM input directly.
    const rhfEmail = getValues('guardian_email') || '';
    const domEmail = document.querySelector('input[name="guardian_email"]')?.value || '';
    const email = (rhfEmail || domEmail).trim();
    const dateOfBirth = getValues('date_of_birth') || '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('guardian_email', {
        type: 'manual',
        message: 'Enter a valid guardian email first',
      });
      pholioToast.error('Enter a valid guardian email first');
      return;
    }

    if (!dateOfBirth) {
      setError('date_of_birth', {
        type: 'manual',
        message: 'Add your date of birth before requesting guardian consent',
      });
      pholioToast.error('Add your date of birth first');
      return;
    }

    if (!isMinorProfile({ date_of_birth: dateOfBirth })) {
      pholioToast.error('Guardian consent is only required for talent under 18');
      return;
    }

    setGuardianSending(true);
    setGuardianLinkSent(false);
    setGuardianSentTo('');

    try {
      const result = await talentApi.requestGuardianConsent(email, { dateOfBirth });
      setValue('guardian_consent_status', 'pending', { shouldDirty: false });
      setValue('guardian_email', email, { shouldDirty: false });
      const sentTo = result?.guardian_email || email;
      setGuardianSentTo(sentTo);
      setGuardianLinkSent(true);
      pholioToast.success(`Verification link sent to ${sentTo}`);
    } catch (error) {
      console.error('Guardian consent request failed:', error);
      const code =
        error?.data?.details?.code ||
        error?.data?.error?.code ||
        error?.data?.code;
      if (code === 'DOB_REQUIRED') {
        setError('date_of_birth', {
          type: 'manual',
          message: 'Add your date of birth before requesting guardian consent',
        });
      } else if (code === 'NOT_A_MINOR') {
        pholioToast.error('Guardian consent is only required for talent under 18');
        return;
      } else if (code === 'EMAIL_DELIVERY_FAILED') {
        pholioToast.error(
          error.message || 'We could not deliver the verification email. Check the address and try again.',
        );
        return;
      }
      pholioToast.error(error.message || 'Could not send the verification link');
    } finally {
      setGuardianSending(false);
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
  const isMinor = isMinorProfile({ date_of_birth: values.date_of_birth });
  const minorLocked =
    isMinor &&
    !minorSensitiveFieldsUnlocked({
      date_of_birth: values.date_of_birth,
      guardian_consent_at: values.guardian_consent_recorded
        ? profile?.guardian_consent_at || 'draft'
        : null,
    });
  const measurementsLocked = minorLocked;
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
      const isBioOnlySave =
        saveDirtyFieldNamesRef.current.length === 1 &&
        saveDirtyFieldNamesRef.current[0] === 'bio';
      let res;

      if (isBioOnlySave) {
        const submittedBio = String(getValues('bio') ?? data.bio ?? '').trim();
        const saveResult = await talentApi.updateProfile({ bio: submittedBio });
        if (!saveResult?.profile) {
          res = saveResult;
        } else {
          const reloaded = await talentApi.getProfile();
          const persistedBio = String(reloaded?.profile?.bio_raw ?? '');
          if (persistedBio !== submittedBio) {
            throw new Error(
              'Your bio could not be verified after saving. Please try again.',
            );
          }
          res = reloaded;
        }
      } else {
        const { representations, finalPayload } = normalizeProfileForSave(
          data,
          measurementsLocked,
        );
        await talentApi.replaceRepresentations(representations);
        res = await talentApi.updateProfile(finalPayload);
      }

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

    const wasDirty = hasChanges;
    saveDirtyFieldNamesRef.current = Object.keys(dirtyFields);
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
      ? 'Seeking Representation'
      : null;

  const showReadinessGate = isGateEntry && !isCoreReady;

  return (
    <div ref={pageRef} className={styles.pageContainer}>
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
              <PholioButton to={MEDIA_PATH} variant="secondary" className={styles.addPhotoPrompt}>
                <Camera size={20} strokeWidth={1.5} />
                <span>Add primary photo</span>
                <span className={styles.addPhotoHint}>Opens your book</span>
              </PholioButton>
            </>
          )}
        </div>

          <div className={styles.heroIdentity}>
            <div className={styles.heroEyebrow}>
              {values.city ? (
                <p className={styles.heroTagline}>{formatLocation(values.city).toUpperCase()}</p>
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
                      <PholioButton
                        variant="meta"
                        className={styles.heroReadinessToggle}
                        onClick={() => setGateItemsExpanded((open) => !open)}
                        aria-expanded={gateItemsExpanded}
                      >
                        {gateItemsExpanded
                          ? 'Hide items'
                          : `${missingCoreItems.length} item${missingCoreItems.length === 1 ? '' : 's'} remaining`}
                      </PholioButton>
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

      {/* Profile Strength — docked right under the hero so it reads as page
          context, not an appendage after the whole form (mobile stacks this
          here via DOM order; desktop/tablet still pin it to the grid's third
          column via explicit grid-column on .sidebar). */}
      <ProfileStrengthSidebar
        strength={profileStrength}
        profile={readinessProfile}
        images={Array.isArray(authImages) ? authImages : []}
        isSaving={isSubmitting}
        hasChanges={hasChanges}
        auditOpen={readinessAuditOpen}
        onToggleAudit={() => setReadinessAuditOpen((open) => !open)}
        onSaveClick={() => {
          void handleSaveProfile();
        }}
        onItemClick={scrollToProfileSection}
      />

      {/* Mobile section index — sits after the masthead (hero + readiness),
          where navigation for the form belongs, and sticks to the top of the
          scroller once you're actually in the form. */}
      <div className={styles.mobileIndexBar}>
        <PholioIconButton
          label="Toggle section index"
          className={styles.navToggle}
          onClick={() => setNavOpen(!navOpen)}
        >
          {navOpen ? <X size={17} /> : <Menu size={17} />}
        </PholioIconButton>
        <span className={styles.mobileIndexBarLabel}>Sections</span>
        <span className={styles.mobileIndexBarCurrent}>
          {NAV_LABELS_BY_ID[activeSection] || 'Personal Details'}
        </span>
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
                  The basics agencies verify first — who you are, where you’re based, and the bio they’ll actually read.
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
              guardianStatus={watch('guardian_consent_status')}
              onSendGuardianLink={handleSendGuardianLink}
              guardianSending={guardianSending}
              guardianLinkSent={guardianLinkSent}
              guardianSentTo={guardianSentTo}
            />
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>II — Discipline</p>
                <h2 className={styles.movementTitle}>
                  Focus & <em>interests</em>
                </h2>
                <p className={styles.movementLede}>
                  Sets your primary lane and which track you’re evaluated in when agencies filter and shortlist.
                </p>
              </header>
              <div className={styles.movementCard}>
            <DisciplineSection
              control={control}
              errors={errors}
              watch={watch}
            />
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>III — Measurements</p>
                <h2 className={styles.movementTitle}>
                  Physical <em>proof</em>
                </h2>
                <p className={styles.movementLede}>
                  The numbers casting filters on — accurate, current stats save time and prevent mismatch on set.
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
              measurementsLocked={measurementsLocked}
            />
            <AvailabilitySection measurementsLocked={measurementsLocked} />
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>IV — Proof</p>
                <h2 className={styles.movementTitle}>
                  Credits & <em>craft</em>
                </h2>
                <p className={styles.movementLede}>
                  Your receipts — credits, training, and skills that communicate readiness at a glance.
                </p>
              </header>
              <div className={styles.movementCard}>
        <Section
          id="credits"
          title="Credits & Experience"
          titleEmphasis="Experience"
          description="Your experience level and key credits — the quickest way for agencies to gauge where you’re at professionally."
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
          description="Classes, coaches, workshops, and standout skills. Use tags for quick scanning and search-friendly phrasing."
        >
          <div className={styles.formStack}>
            <WritingAssistToolbar
              className={styles.trainingAssistToolbar}
              variant="architectural"
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
                  emphasis: 'primary',
                  onClick: () => {
                    void handleTrainingExpand();
                  },
                },
              ]}
              busy={Boolean(trainingImproveMode)}
              busyActionId={
                trainingImproveMode === 'format'
                  ? 'format-training'
                  : trainingImproveMode === 'summarize'
                    ? 'summarize-training'
                    : trainingImproveMode === 'expand'
                      ? 'expand-training'
                      : null
              }
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
          title="Casting Preferences"
          titleEmphasis="Preferences"
          description="Add the union, playing-age, comfort, and availability details that shape which briefs fit."
          showDivider={false}
        >
          <div className={styles.formRow}>
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
                {...register('playing_age_min')}
                error={errors.playing_age_min}
             />
             <PholioInput
                label="Playing Age Max"
                type="number"
                placeholder="25"
                {...register('playing_age_max')}
                error={errors.playing_age_max}
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
              </div>
            </article>

            <article className={styles.movement}>
              <header className={styles.movementHead}>
                <p className={styles.movementKicker}>V — Reach</p>
                <h2 className={styles.movementTitle}>
                  Representation & <em>contact</em>
                </h2>
                <p className={styles.movementLede}>
                  Representation context, socials, and safety details — shared appropriately, only when it matters.
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

        <SocialSection
          control={control}
          setValue={setValue}
          errors={errors}
          watch={watch}
        />

        {/* Private & Compliance — always present, conditional blocks for minors */}
        <Section
          id="private"
          title="Private & Compliance"
          titleEmphasis="Private"
          description="Sensitive info agencies may require (eligibility, nationality, legal/compliance). This stays private and isn’t shown publicly."
          showDivider={false}
        >
          <div className={styles.formGrid2}>
            <Controller
              name="nationality"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Nationality"
                  id="nationality"
                  options={[
                    { value: 'United States', label: 'United States' },
                    { value: 'Canada', label: 'Canada' },
                    { value: 'United Kingdom', label: 'United Kingdom' },
                    { value: 'Other', label: 'Other' }
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.nationality}
                  placeholder="Select nationality"
                />
              )}
            />
            <PholioInput
              label="Place of Birth"
              placeholder="City, Country"
              error={errors.place_of_birth}
              {...register('place_of_birth')}
            />
          </div>

          <div className={`${styles.formGrid3} ${styles.formRow}`} style={{ marginTop: '24px' }}>
            <Controller
              name="work_eligibility"
              control={control}
              render={({ field }) => (
                <PholioCustomSelect
                  label="Work Authorization"
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

          <div className={`${styles.formGrid2} ${styles.formRow}`} style={{ marginTop: '24px' }}>
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
          </div>

          {/* Minor guardian/permit block — shown only if minor without consent */}
          {isMinor && !minorLocked && (
            <div className={styles.formRow} style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--ag-text-2, #ddd)' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', fontWeight: '500' }}>
                  Work Permit on File
                </label>
                <Controller
                  name="work_permit_on_file"
                  control={control}
                  render={({ field }) => (
                    <PholioToggle
                      id="work_permit_on_file"
                      checked={field.value}
                      onChange={field.onChange}
                      label="Minor work permit / employment certificate on file"
                    />
                  )}
                />
              </div>
            </div>
          )}
        </Section>

        <VerifiedAdultSection dateOfBirth={values.date_of_birth} />

        <Section
          id="contact"
          title="On-set Safety"
          titleEmphasis="Safety"
          description="Emergency contact & on‑set safety details. Hidden until you’re booked, then shared only with the team coordinating the job."
          showDivider={false}
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
                  value={field.value ? formatPhoneDisplay(field.value) : ''}
                  onChange={(e) => {
                    const formatted = formatPhoneDisplay(e.target.value);
                    field.onChange(formatted);
                  }}
                  onBlur={(e) => {
                    field.onBlur();
                    const formatted = formatPhoneDisplay(e.target.value);
                    if (formatted !== field.value) {
                      setValue('emergency_contact_phone', formatted, { shouldDirty: true, shouldValidate: true });
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

      </div>{/* End layoutGrid */}
    </div>
  );
}
