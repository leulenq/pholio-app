import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleDashed,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../../shared/components/NotificationCenter/NotificationCenter';
import { useAuth } from '../../../auth/hooks/useAuth';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import WritingAssistToolbar from '../../../../shared/components/writing/WritingAssistToolbar';
import ProfileGateBanner from '../../../../shared/components/gating/ProfileGateBanner';
import { checkGatingStatus, getProfileGateFeature } from '../../../../shared/utils/profileGating';
import { sendBlockerLabel } from '../../../../shared/utils/sendReadiness';
import {
  analyzeDigitalsReadiness,
  isHeadshotImage,
  isFullBodyImage,
  isDigitalSlot,
} from '../../../../shared/utils/profileReadinessImages';
import {
  auditSubmissionPackage,
  analyzePackageIntelligence,
  getImageAgeDays,
} from '../../../../shared/utils/packageIntelligence';
import FrameReadCaption from '../../../../shared/components/frame/FrameReadCaption';
import { isMinorProfile, hasGuardianConsent } from '../../../../shared/utils/talentAge';
import { resolveTalentDivision, PROFILE_DIVISIONS } from '../../../../shared/constants/profileDivision';
import { DIGITALS_ADVISORY_ITEMS, normalizeShotSlug, labelForStyle } from '../../../../shared/constants/frameTaxonomy';
import { BOOK_MIN_FRAME_COUNT } from '../../../../shared/constants/packageIntelligence';
import { cmToFeetInches, cmToInches } from '../../../../shared/utils/measurementConversions';
import { talentApi } from '../../api/talent';
import '../../components/ApplicationsView.css';
import './ApplyExperience.css';
import SubmissionThreshold from './SubmissionThreshold';
import { draftFingerprint, getDraftClientId } from './applicationDraftStorage';

/* The submission is one composed dossier, addressed to the house in the left
   rail and turned page by page. Same ledger language as the /applications
   market — full screen. Each page holds one subject, with room to breathe.
   The marker is the dossier position (01 / 07), never a repeat of the title. */

const PAGES = [
  {
    id: 'board',
    // Title + standfirst are resolved dynamically — they depend on whether the
    // agency actually exposes open boards (see boardPageCopy below).
    title: 'Submitting to',
    standfirst: '',
  },
  {
    id: 'digitals',
    title: 'Digitals',
    standfirst: 'Your raw set — the truth check agencies assess first. Current, unretouched, head to toe.',
  },
  {
    id: 'stats',
    title: 'Stats',
    standfirst: 'Your measurements, exactly as the agency reads them.',
  },
  {
    id: 'book',
    title: 'Book',
    standfirst: 'Your best work — supporting your digitals, never replacing them. Hold back anything that doesn’t earn its place.',
  },
  {
    id: 'compcard',
    title: 'Comp card',
    standfirst: 'The leave-behind that travels with your package.',
  },
  {
    id: 'message',
    title: 'The message',
    standfirst: 'A few honest lines, in your own voice.',
  },
  {
    id: 'review',
    title: 'Review & send',
    standfirst: 'A last look at everything enclosed, then it’s on its way.',
  },
];

const pageMarker = (index) =>
  `${String(index + 1).padStart(2, '0')} / ${String(PAGES.length).padStart(2, '0')}`;

const AUTOSAVE_DELAY_MS = 1500;

function formatSavedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  // Intentionally omit `timeZone`: Intl formats in the user's browser-local
  // timezone rather than the server timezone or a fixed product timezone.
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  ).format(date);
}

// Pages that take over the full workspace (rail steps aside) for an immersive,
// breathing review of the visual work.
const FULLSCREEN_PAGES = new Set(['digitals', 'stats', 'book', 'compcard']);

/* Page 01 is agency-primary. A submission goes TO the agency (which decides
   placement); a board is optional context shown ONLY when the agency actually
   exposes open boards. Reflect that in the copy. */
function boardPageCopy(agency, openBoards) {
  const name = agency?.name || 'the agency';
  if (openBoards.length > 0) {
    return {
      title: 'Which board fits?',
      standfirst: `${name} is scouting these boards. Point to the one that fits you — optional, and ${name} makes the final placement.`,
    };
  }
  return {
    title: `Submitting to ${name}`,
    standfirst: `Your package goes to ${name} for representation review. They decide which board you’re placed on.`,
  };
}

// A talent has ONE composed comp card (the engine designs it from their book in
// /media) — not a library of variants. The submission sends that card; its
// design is changed in /media, not invented here.
const COMP_CARD_NAME = 'Your comp card';

/* The five-frame digitals set agencies expect, in reading order. A slot is
   filled ONLY by a true digital (image_type:'digital') — a styled book frame
   never stands in (see digitalSet resolver + isDigitalSlot). */
const DIGITAL_SLOTS = [
  { key: 'headshot', label: 'Headshot', hint: 'Close-up, neutral', match: ['headshot', 'beauty'] },
  { key: 'three_quarter', label: '¾ length', hint: 'Knee or thigh up', match: ['three_quarter', 'half_body'] },
  { key: 'full_length', label: 'Full length', hint: 'Head to toe', match: ['full_length'] },
  { key: 'profile', label: 'Profile / side', hint: 'Side view', match: ['profile', 'profile_left', 'profile_right'] },
  { key: 'back', label: 'Back', hint: 'From behind', match: ['back'] },
];

const DIGITALS_ADVISORY = DIGITALS_ADVISORY_ITEMS;

/* The book is curated styled work — the opposite of digitals. A book frame is
   any non-digital, non-comp-card image (portfolio · campaign · test · editorial),
   so the Book page never shows the raw digital set. */
function isBookFrame(img) {
  const t = normalizeToken(img?.image_type);
  return t !== 'digital' && t !== 'comp_card';
}

/* What a booker reads in a book: range across registers, a strong opening, and
   no redundancy or over-indexing. Computed over the frames actually being sent. */
function buildBookReview(frames, boards = []) {
  const list = Array.isArray(frames) ? frames : [];
  const total = list.length;

  const counts = {};
  for (const img of list) {
    const slug = normalizeToken(img.style_type) || 'unplaced';
    counts[slug] = (counts[slug] || 0) + 1;
  }
  const registers = Object.entries(counts)
    .map(([slug, count]) => ({ slug, label: slug === 'unplaced' ? 'Unplaced' : labelForStyle(slug), count }))
    .sort((a, b) => b.count - a.count);
  const placed = registers.filter((r) => r.slug !== 'unplaced');
  const dominant = placed[0] || null;
  const distinct = placed.length;

  let verdict;
  if (total === 0) verdict = 'No book frames yet';
  else if (total < BOOK_MIN_FRAME_COUNT) verdict = 'Build the range';
  else if (distinct >= 3) verdict = 'A book with range';
  else if (dominant && dominant.count / total >= 0.6) verdict = `Leans ${dominant.label.toLowerCase()}`;
  else verdict = 'A focused book';

  const notes = [];
  if (total > 0 && total < BOOK_MIN_FRAME_COUNT) {
    notes.push(`Only ${total} book frame${total === 1 ? '' : 's'} — a fuller book (${BOOK_MIN_FRAME_COUNT}+) gives agencies more to read.`);
  }
  if (total >= 4 && dominant && dominant.count / total >= 0.6 && distinct <= 1) {
    notes.push(`Every frame reads ${dominant.label.toLowerCase()} — add another register so the book shows range.`);
  }
  const combos = {};
  for (const img of list) {
    const shot = normalizeShotSlug(img.shot_type);
    const style = normalizeToken(img.style_type);
    if (!shot && !style) continue;
    const key = `${shot}|${style}`;
    combos[key] = (combos[key] || 0) + 1;
  }
  if (Object.values(combos).some((c) => c >= 3)) {
    notes.push('A few frames repeat the same look — agencies want range, not near-duplicates.');
  }
  const boardText = (Array.isArray(boards) ? boards : []).join(' ').toLowerCase();
  const hasCommercial = placed.some((r) => ['commercial', 'lifestyle', 'ecommerce', 'beauty'].includes(r.slug));
  const hasEditorial = placed.some((r) => ['editorial', 'couture'].includes(r.slug));
  if (total > 0 && /commercial|lifestyle|e-?comm/.test(boardText) && !hasCommercial) {
    notes.push('This house scouts commercial — your book has no commercial or lifestyle frames yet.');
  }
  if (total > 0 && /editorial|fashion|runway/.test(boardText) && !hasEditorial) {
    notes.push('This house leans editorial — add an editorial or fashion frame.');
  }

  return { total, registers, placed, dominant, distinct, verdict, notes };
}

/* ── helpers ─────────────────────────────────────────────── */

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function asMediaSets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.sets)) return payload.sets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function dateLabel(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthYearLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function websiteUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function agencyInitial(name) {
  return String(name || 'Agency').trim().charAt(0).toUpperCase() || 'A';
}

function agencyDomain(value) {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function agencyEstablishedLabel(agency) {
  const explicit =
    agency?.established_at ||
    agency?.established_date ||
    agency?.established_year ||
    agency?.founded_at ||
    agency?.founded_year ||
    agency?.founded;

  if (explicit) {
    const value = String(explicit).trim();
    const year = value.match(/\b(18|19|20)\d{2}\b/)?.[0];
    return year || value;
  }

  const description = agency?.agency_description || '';
  const inferred = description.match(/\b(?:founded|established)\b[^.]*?\b((?:18|19|20)\d{2})\b/i);
  return inferred?.[1] || null;
}

function imageUrl(image) {
  return image?.public_url || image?.url || image?.path || null;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function measurementValue(profile, keys) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

/* Dual-unit measurement rows, exactly as a booker reads a stats card. */
function normalizeGender(value) {
  const s = normalizeToken(value);
  if (['female', 'woman', 'women', 'f'].includes(s)) return 'female';
  if (['male', 'man', 'men', 'm'].includes(s)) return 'male';
  return 'neutral';
}

/* The measurements an agency reads — gendered/division-specific, dual-unit, and
   perishable. Fields and their order follow what a booker on the talent's board
   actually casts from (standards §4); recency comes from a real measured date. */
// Shoe + dress rendered US/EU, matching the comp-card engine (women EU ≈ US+31,
// men EU ≈ US+33; dress EU ≈ US+32). A bare numeric ≥32 is assumed already EU.
function formatShoe(raw, gender) {
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!m) return String(raw);
  const n = parseFloat(m[1]);
  const isEu = /eu/i.test(String(raw)) || n >= 32;
  const off = gender === 'male' ? 33 : 31;
  const us = isEu ? n - off : n;
  const eu = isEu ? n : n + off;
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  if (us <= 0) return `EU ${fmt(eu)}`;
  return `US ${fmt(us)} / EU ${fmt(eu)}`;
}

function formatDress(raw, gender) {
  if (gender === 'male') return String(raw); // suit sizing isn't a simple US→EU offset
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!m) return String(raw);
  const us = parseFloat(m[1]);
  return `US ${Number.isInteger(us) ? us : us.toFixed(1)} / EU ${us + 32}`;
}

function buildStats(profile) {
  const isPerformance = resolveTalentDivision(profile) === PROFILE_DIVISIONS.TALENT_PERFORMANCE;
  const g = normalizeGender(profile?.gender);
  const part = (keys, label) => {
    const cm = measurementValue(profile, keys);
    return cm ? { label, cm: Number(cm), in: cmToInches(cm) } : null;
  };

  const heightCm = measurementValue(profile, ['height_cm']);
  const height = heightCm
    ? (() => {
        const { ft, in: inch } = cmToFeetInches(heightCm);
        return { cm: heightCm, sub: `${ft}′${inch}″` };
      })()
    : null;

  // The vitals triplet — the model's defining line. Women: Bust·Waist·Hips;
  // men: Chest·Waist·Inseam. Performance boards don't lead on body stats.
  const bustChest = part(['bust', 'bust_cm', 'chest', 'chest_cm'], g === 'male' ? 'Chest' : 'Bust');
  const waist = part(['waist', 'waist_cm'], 'Waist');
  const hips = part(['hips', 'hips_cm'], 'Hips');
  const inseam = part(['inseam_cm', 'inseam'], 'Inseam');
  const vitalParts = isPerformance
    ? []
    : (g === 'male' ? [bustChest, waist, inseam] : [bustChest, waist, hips]).filter(Boolean);
  const vitals = vitalParts.length ? vitalParts : null;

  const shoeVal = measurementValue(profile, ['shoe_size']);
  const dressVal = measurementValue(profile, ['dress_size']);
  const hair = measurementValue(profile, ['hair_color', 'hair']);
  const eyes = measurementValue(profile, ['eye_color', 'eyes']);
  const secondary = [
    shoeVal && { label: 'Shoe', value: formatShoe(shoeVal, g) },
    dressVal && { label: g === 'male' ? 'Suit' : 'Dress', value: formatDress(dressVal, g) },
    hair && { label: 'Hair', value: hair },
    eyes && { label: 'Eyes', value: eyes },
  ].filter(Boolean);

  const measuredRaw = profile?.measurements_updated_at || null;
  const measuredDate = measuredRaw ? new Date(measuredRaw) : null;
  const measuredAt = measuredDate && !Number.isNaN(measuredDate.getTime()) ? measuredDate : null;
  const ageDays = measuredAt ? Math.floor((Date.now() - measuredAt.getTime()) / 86400000) : null;

  return {
    height,
    vitals,
    secondary,
    isPerformance,
    measuredAt,
    ageDays,
    isStale: ageDays != null && ageDays > 90,
    hasAny: !!(height || vitals || secondary.length),
  };
}

/* ════════════════════════════════════════════════════════════
   Orchestrator
   ════════════════════════════════════════════════════════════ */

export default function ApplyExperience() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    profile,
    subscription,
    images: authImages = [],
    isLoading: authLoading,
  } = useAuth();

  const startNew = searchParams.get('new') === '1';
  const agencyFromUrl = searchParams.get('agency');
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedAgencyId, setSelectedAgencyId] = useState(
    startNew ? null : agencyFromUrl,
  );
  // Boards the talent indicates fit for — sourced from the agency's own open
  // boards, never the talent's self-classification. Empty until chosen.
  const [selectedBoards, setSelectedBoards] = useState([]);
  const [selectedMediaSetId, setSelectedMediaSetId] = useState('current');
  // The saved comp-card variant chosen on Page 05 (when the talent keeps more
  // than one). Null = the live default composed card. Recorded on submit so the
  // agency receives that exact rendering.
  const [selectedCompCardPreset, setSelectedCompCardPreset] = useState(null);
  // Submission-scoped: which qualifying digital represents each slot (swap).
  const [digitalSlotPicks, setDigitalSlotPicks] = useState({});
  const [excludedImageIds, setExcludedImageIds] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  // Cleared the moment the one-time submission-program threshold is acknowledged.
  const [programDismissed, setProgramDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [draftClientId] = useState(getDraftClientId);
  // 'loading' | 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'
  const [draftStatus, setDraftStatus] = useState('loading');
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  // "Compose" arrives with ?agency= and locks to that house; "Apply New" opens the chooser.
  const deepLinked = !!agencyFromUrl && !startNew;
  const draftVersionRef = useRef(0);
  const draftGenerationRef = useRef(0);
  const lastSavedFingerprintRef = useRef('');
  const currentDraftRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const persistDraftRef = useRef(null);

  const applicationsQuery = useQuery({
    queryKey: ['applications'],
    queryFn: talentApi.getApplications,
    staleTime: 1000 * 60,
    retry: 1,
  });
  const agenciesQuery = useQuery({
    queryKey: ['talent-agencies', 'apply-content-v2'],
    queryFn: talentApi.getAgencies,
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });
  const mediaSetsQuery = useQuery({
    queryKey: ['talent-media-sets'],
    queryFn: talentApi.getMediaSets,
    staleTime: 1000 * 60 * 3,
    retry: 1,
  });
  // Resume an in-progress dossier for the chosen house, if one was saved.
  const draftQuery = useQuery({
    queryKey: ['application-draft', selectedAgencyId],
    queryFn: () => talentApi.getDraft(selectedAgencyId),
    enabled: !!selectedAgencyId,
    staleTime: 1000 * 30,
    retry: 0,
  });

  // The one-time submission-program acknowledgment. Resolved as the dossier
  // opens (the threshold), not buried inside a page.
  const submissionProgramQuery = useQuery({
    queryKey: ['submission-program-status'],
    queryFn: () => talentApi.getSubmissionProgramStatus(),
    enabled: !!selectedAgencyId,
    staleTime: 1000 * 60,
    retry: 1,
  });

  const needsProgramAck = submissionProgramQuery.data?.needsAcknowledgment === true;

  const acknowledgeProgramMutation = useMutation({
    mutationFn: talentApi.acknowledgeSubmissionProgram,
    onSuccess: () => {
      setProgramDismissed(true);
      queryClient.invalidateQueries({ queryKey: ['submission-program-status'] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: talentApi.createApplication,
    onSuccess: (_data, variables) => {
      lastSavedFingerprintRef.current = '';
      setDraftStatus('submitted');
      setSubmitted({
        agency: { name: variables?.submissionPackage?.agencyName },
        submittedAt: new Date().toISOString(),
        mediaSetName: variables?.submissionPackage?.mediaSetName,
        compCardName: variables?.submissionPackage?.compCardName,
        frameCount: variables?.submissionPackage?.imageIds?.length || 0,
      });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['talent-agencies'] });
      queryClient.invalidateQueries({ queryKey: ['application-draft', selectedAgencyId] });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
    onError: (err) => {
      if (err?.data?.upgradeRequired) {
        toast.error('Monthly application limit reached.');
        return;
      }
      toast.error(err?.message || 'Failed to submit application');
    },
  });

  const applications = useMemo(
    () =>
      asArray(applicationsQuery.data).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      ),
    [applicationsQuery.data],
  );
  const agencies = useMemo(() => asArray(agenciesQuery.data), [agenciesQuery.data]);
  const mediaSets = useMemo(() => asMediaSets(mediaSetsQuery.data), [mediaSetsQuery.data]);
  const gating = useMemo(() => checkGatingStatus(profile, authImages), [profile, authImages]);
  const applicationGate = getProfileGateFeature('/dashboard/talent/applications');

  const appliedAgencyIds = useMemo(
    () =>
      new Set(
        applications
          .filter((app) => app.status !== 'withdrawn')
          .map((app) => app.agency_id)
          .filter(Boolean),
      ),
    [applications],
  );
  const openAgencies = useMemo(
    () => agencies.filter((agency) => !appliedAgencyIds.has(agency.id)),
    [agencies, appliedAgencyIds],
  );

  const selectedAgency = openAgencies.find((agency) => agency.id === selectedAgencyId) || null;
  const site = websiteUrl(selectedAgency?.agency_website);

  const draftDocument = useMemo(() => ({
    currentStepId: PAGES[pageIndex]?.id || PAGES[0].id,
    payload: {
      schemaVersion: 1,
      boards: selectedBoards,
      mediaSetId: selectedMediaSetId,
      excludedImageIds: [...excludedImageIds],
      digitalSlotPicks,
      compCardPreset: selectedCompCardPreset
        ? {
            id: selectedCompCardPreset.id,
            name: selectedCompCardPreset.name,
            seed: selectedCompCardPreset.seed || null,
          }
        : null,
      note,
      consent,
    },
  }), [
    consent,
    digitalSlotPicks,
    excludedImageIds,
    note,
    pageIndex,
    selectedBoards,
    selectedCompCardPreset,
    selectedMediaSetId,
  ]);

  // Restore the form from a saved draft, dropping any reference (board, media
  // set, image) that is no longer available. Consent is never auto-restored —
  // the talent re-confirms sharing on the review step.
  const applyDraftDocument = useCallback((document, { restoreConsent = false } = {}) => {
    const payload = document?.payload && typeof document.payload === 'object'
      ? document.payload
      : {};
    const page = PAGES.findIndex((candidate) => candidate.id === document?.currentStepId);
    const availableBoards = new Set(
      Array.isArray(selectedAgency?.open_boards) ? selectedAgency.open_boards : [],
    );
    const availableImageIds = new Set(authImages.map((image) => image.id));
    const validDigitalPicks = {};
    if (payload.digitalSlotPicks && typeof payload.digitalSlotPicks === 'object') {
      for (const [slot, imageId] of Object.entries(payload.digitalSlotPicks)) {
        if (availableImageIds.has(imageId)) validDigitalPicks[slot] = imageId;
      }
    }
    const requestedBoards = Array.isArray(payload.boards) ? payload.boards : [];
    const validBoards = requestedBoards.filter((board) => availableBoards.has(board));
    const validExcludedIds = Array.isArray(payload.excludedImageIds)
      ? payload.excludedImageIds.filter((id) => availableImageIds.has(id))
      : [];
    // Only restore a BOOK set — never a digitals set (those scope the submission
    // to raw frames only and strand the Book step on empty).
    const mediaSetValid =
      payload.mediaSetId === 'current' ||
      mediaSets.some(
        (set) => set.id === payload.mediaSetId && normalizeToken(set.kind) !== 'digitals',
      );

    setPageIndex(page >= 0 ? page : 0);
    setSelectedBoards(validBoards);
    setSelectedMediaSetId(mediaSetValid ? payload.mediaSetId : 'current');
    setExcludedImageIds(new Set(validExcludedIds));
    setDigitalSlotPicks(validDigitalPicks);
    setSelectedCompCardPreset(payload.compCardPreset || null);
    setNote(typeof payload.note === 'string' ? payload.note.slice(0, 1200) : '');
    setConsent(restoreConsent && payload.consent === true);
  }, [authImages, mediaSets, selectedAgency]);

  // Hydrate the dossier from the saved draft once the agency's draft has loaded.
  // A draft is a convenience — any error simply means "no resume" and never
  // blocks the flow.
  const hydratedFor = useRef(null);
  useEffect(() => {
    if (!selectedAgencyId || hydratedFor.current === selectedAgencyId) return;
    if (draftQuery.isLoading || mediaSetsQuery.isLoading || authLoading) return;
    hydratedFor.current = selectedAgencyId;

    const server = draftQuery.data || null;
    if (server && server.payload) {
      const serverDocument = { currentStepId: server.currentStepId, payload: server.payload };
      applyDraftDocument(serverDocument);
      draftVersionRef.current = Number(server.version) || 0;
      draftGenerationRef.current = Number(server.generation) || 0;
      currentDraftRef.current = serverDocument;
      lastSavedFingerprintRef.current = draftFingerprint(serverDocument);
      setDraftUpdatedAt(server.updatedAt || null);
      setDraftStatus('saved');
    } else {
      setDraftStatus('idle');
    }
    setDraftHydrated(true);
  }, [
    applyDraftDocument,
    authLoading,
    draftQuery.data,
    draftQuery.isLoading,
    mediaSetsQuery.isLoading,
    selectedAgencyId,
  ]);

  // Save the draft to the server. Fire-and-forget and tolerant: a conflict
  // (the draft moved on another device) just re-syncs the version; any other
  // failure is surfaced quietly. A draft never blocks the submission.
  const persistDraftDocument = useCallback(async (document = currentDraftRef.current) => {
    if (!selectedAgencyId || !draftHydrated || !document) return false;
    const fingerprint = draftFingerprint(document);
    if (fingerprint === lastSavedFingerprintRef.current) {
      setDraftStatus(draftVersionRef.current > 0 ? 'saved' : 'idle');
      return true;
    }
    currentDraftRef.current = document;
    setDraftStatus('saving');
    try {
      const result = await talentApi.saveDraft(selectedAgencyId, {
        payload: document.payload,
        currentStepId: document.currentStepId,
        expectedVersion: draftVersionRef.current,
        expectedGeneration: draftGenerationRef.current,
        clientId: draftClientId,
        clientUpdatedAt: new Date().toISOString(),
      });
      draftVersionRef.current = Number(result?.version) || draftVersionRef.current + 1;
      draftGenerationRef.current = Number(result?.generation) || draftGenerationRef.current;
      lastSavedFingerprintRef.current = fingerprint;
      setDraftUpdatedAt(result?.updatedAt || new Date().toISOString());
      setDraftStatus('saved');
      return true;
    } catch (err) {
      // Re-sync the version on a conflict so the next save succeeds; don't block.
      if (err?.status === 409) {
        try {
          const fresh = await talentApi.getDraft(selectedAgencyId);
          const data = fresh?.data || fresh;
          if (data) {
            draftVersionRef.current = Number(data.version) || draftVersionRef.current;
            draftGenerationRef.current = Number(data.generation) || draftGenerationRef.current;
          }
        } catch { /* ignore */ }
        setDraftStatus('saved');
        return false;
      }
      setDraftStatus('error');
      return false;
    }
  }, [draftClientId, draftHydrated, selectedAgencyId]);

  persistDraftRef.current = persistDraftDocument;

  // The server write follows after a short idle window.
  useEffect(() => {
    currentDraftRef.current = draftDocument;
    if (!selectedAgencyId || !draftHydrated) return undefined;
    if (draftFingerprint(draftDocument) === lastSavedFingerprintRef.current) return undefined;
    setDraftStatus((current) => (current === 'saving' ? current : 'unsaved'));
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      persistDraftDocument(draftDocument);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [draftDocument, draftHydrated, persistDraftDocument, selectedAgencyId]);

  const selectMediaSet = (id) => {
    setSelectedMediaSetId(id);
    setExcludedImageIds(new Set());
  };

  const toggleBoard = (slug) =>
    setSelectedBoards((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );

  /* ── derived submission state ── */

  const monthCount = applications.filter((app) => {
    if (!app.created_at) return false;
    const created = new Date(app.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const monthlyLimitLabel = subscription?.isPro
    ? 'Unlimited submissions this month'
    : `${monthCount}/5 submissions this month`;

  const visibleImages = useMemo(
    () => authImages.filter((image) => !image.exclude_from_agency && imageUrl(image)),
    [authImages],
  );
  // A digitals-kind (or unknown) set is never a valid submission scope — fall
  // back to the full book so packageImages/bookSetImages stay correct.
  const setImages = useMemo(() => {
    const selSet = mediaSets.find((s) => s.id === selectedMediaSetId);
    const useAll =
      selectedMediaSetId === 'current' ||
      !selSet ||
      normalizeToken(selSet.kind) === 'digitals';
    return useAll
      ? visibleImages
      : visibleImages.filter((image) => image.set_id === selectedMediaSetId);
  }, [visibleImages, selectedMediaSetId, mediaSets]);
  const packageImages = useMemo(
    () => setImages.filter((image) => !excludedImageIds.has(image.id)),
    [setImages, excludedImageIds],
  );

  // Book = styled work only (digitals live on their own page). Display all of
  // them in sequence; the range read analyses the ones actually being sent.
  const bookSetImages = useMemo(() => setImages.filter(isBookFrame), [setImages]);
  const bookReview = useMemo(
    () => buildBookReview(bookSetImages.filter((img) => !excludedImageIds.has(img.id)), selectedBoards),
    [bookSetImages, excludedImageIds, selectedBoards],
  );

  const packageAudit = useMemo(
    () => auditSubmissionPackage({ images: packageImages, profile }),
    [packageImages, profile],
  );

  // Package-level PITS over the whole digital set — recency, advisories,
  // submission-readiness — the same intelligence the /media tab runs.
  // Passing profile keeps minor body-frame suppression consistent with /media.
  const digitalsIntel = useMemo(
    () => analyzePackageIntelligence({ images: visibleImages, profile }),
    [visibleImages, profile],
  );

  /* The five-slot digitals set. A slot is filled ONLY by a true digital
     (image_type:'digital') — a styled book frame never satisfies it. We keep
     every qualifying candidate per slot so the talent can swap the
     representative (the one in-page submission edit; everything else lives in
     /media). When only a book frame matches, the slot stays open with a reason. */
  const digitalSet = useMemo(() => {
    return DIGITAL_SLOTS.map((slot) => {
      const matches = (img) => slot.match.includes(normalizeShotSlug(img.shot_type));
      const candidates = visibleImages.filter((img) => isDigitalSlot(img) && matches(img));
      const pickedId = digitalSlotPicks[slot.key];
      const image =
        candidates.find((img) => img.id === pickedId) || candidates[0] || null;
      // A book frame at this framing that can't stand in as a raw digital.
      const bookFallback = !image && visibleImages.some((img) => !isDigitalSlot(img) && matches(img));
      return { ...slot, image, candidates, bookFallback };
    });
  }, [visibleImages, digitalSlotPicks]);
  const filledSlots = digitalSet.filter((slot) => slot.image).length;

  const swapSlot = (slotKey) => {
    const slot = digitalSet.find((s) => s.key === slotKey);
    if (!slot || slot.candidates.length < 2) return;
    const currentIdx = slot.candidates.findIndex((img) => img.id === slot.image?.id);
    const next = slot.candidates[(currentIdx + 1) % slot.candidates.length];
    setDigitalSlotPicks((prev) => ({ ...prev, [slotKey]: next.id }));
  };

  const checks = useMemo(() => {
    const hasHeadshot = packageImages.some(isHeadshotImage);
    const hasFullBody = packageImages.some(isFullBodyImage);
    const hasMeasurements =
      !!measurementValue(profile, ['height_cm']) &&
      !!measurementValue(profile, ['bust', 'bust_cm', 'chest', 'chest_cm']) &&
      !!measurementValue(profile, ['waist', 'waist_cm']) &&
      !!measurementValue(profile, ['hips', 'hips_cm']);
    const hasContact = !!profile?.email && !!profile?.phone;
    return [
      {
        key: 'photo_headshot',
        label: 'Digital headshot',
        complete: hasHeadshot,
        note: 'Tag a digital headshot in your package',
      },
      {
        key: 'photo_full_body',
        label: 'Full-length digital',
        complete: hasFullBody,
        note: 'Add a clean digital full-length shot to your package',
      },
      {
        key: 'digitals_recency',
        label: 'Current digitals',
        complete: !packageAudit.recency.isStale,
        note: 'Refresh your digitals — agencies expect a current set',
      },
      {
        key: 'measurements',
        label: 'Measurements',
        complete: hasMeasurements,
        note: 'Complete height and core measurements',
      },
      {
        key: 'contact',
        label: 'Contact',
        complete: hasContact,
        note: 'Add email and phone in settings',
      },
    ];
  }, [packageImages, profile, packageAudit]);

  const sendBlockers = useMemo(() => {
    const packageGaps = checks
      .filter((check) => !check.complete)
      .map((check) => ({
        key: check.key,
        label: check.label,
        task: check.note,
      }));

    if (Array.isArray(gating.sendBlockers)) {
      const coveredKeys = new Set(gating.sendBlockers.map((blocker) => blocker.key));
      return [
        ...gating.sendBlockers,
        ...packageGaps.filter((gap) => !coveredKeys.has(gap.key)),
      ];
    }

    return packageGaps;
  }, [checks, gating.sendBlockers]);

  const isSendReady = useMemo(() => {
    const packageReady = checks.every((check) => check.complete);
    if (typeof gating.isSendReady === 'boolean') {
      return gating.isSendReady && packageReady;
    }
    return gating.isCoreReady && packageReady;
  }, [checks, gating.isCoreReady, gating.isSendReady]);

  const missingChecks = useMemo(
    () => checks.filter((check) => !check.complete),
    [checks],
  );

  const digitalsReadiness = useMemo(() => analyzeDigitalsReadiness(packageImages), [packageImages]);
  const digitalsGaps = useMemo(
    () => DIGITALS_ADVISORY.filter((item) => !digitalsReadiness[item.key]),
    [digitalsReadiness],
  );
  const untypedPackageCount = useMemo(
    () => packageImages.filter((img) => !normalizeToken(img?.shot_type)).length,
    [packageImages],
  );

  const selectedMediaSetName =
    selectedMediaSetId === 'current'
      ? 'Current book'
      : mediaSets.find((set) => set.id === selectedMediaSetId)?.name || 'Selected image set';
  const selectedCompCardName = selectedCompCardPreset?.name || COMP_CARD_NAME;
  // The agency's own open boards (real agency-managed data), and the talent's
  // selection narrowed to them — a draft can't carry a board the house dropped.
  const agencyOpenBoards = useMemo(
    () => (Array.isArray(selectedAgency?.open_boards) ? selectedAgency.open_boards.filter(Boolean) : []),
    [selectedAgency],
  );
  const boardLabels = selectedBoards.filter((b) => agencyOpenBoards.includes(b));
  const statsInfo = useMemo(() => buildStats(profile), [profile]);
  const statsDate = statsInfo.measuredAt ? monthYearLabel(statsInfo.measuredAt) : null;

  const canSubmit =
    !!selectedAgency &&
    isSendReady &&
    consent &&
    draftHydrated &&
    !applyMutation.isPending;

  /* ── navigation ── */

  const goTo = (index) => {
    const bounded = Math.max(0, Math.min(PAGES.length - 1, index));
    const document = { ...draftDocument, currentStepId: PAGES[bounded].id };
    currentDraftRef.current = document;
    setPageIndex(bounded);
    persistDraftDocument(document);
  };
  const exitToMarket = () => navigate('/dashboard/talent/applications');
  const handleBack = async () => {
    if (pageIndex > 0) return goTo(pageIndex - 1);
    if (!deepLinked) {
      await persistDraftDocument();
      // Return to the house chooser.
      setSelectedAgencyId(null);
      hydratedFor.current = null;
      setDraftHydrated(false);
      setDraftStatus('idle');
      return;
    }
    await persistDraftDocument();
    exitToMarket();
  };
  const handleContinue = () => goTo(pageIndex + 1);

  const navigateFromDraft = async (path) => {
    const saved = await persistDraftDocument();
    if (saved) navigate(path);
  };

  // Record the one-time program acknowledgment and open the dossier.
  const handleBeginSubmission = async () => {
    try {
      await acknowledgeProgramMutation.mutateAsync();
    } catch (err) {
      toast.error(err?.message || 'Could not record your acknowledgment. Please try again.');
    }
  };

  const toggleImage = (imageId) =>
    setExcludedImageIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });

  const handleSaveAndExit = async () => {
    if (selectedAgencyId) await persistDraftDocument(draftDocument);
    exitToMarket();
  };

  const handleSubmit = async () => {
    if (!gating.isCoreReady) {
      toast.info('Complete your required profile fields before submitting to an agency.');
      return;
    }
    if (!isSendReady) {
      toast.info('Complete send requirements before submitting — contact, digitals, and your package.');
      return;
    }
    if (!selectedAgency?.id || !canSubmit || consent !== true) return;
    await persistDraftDocument(draftDocument);
    applyMutation.mutate({
      agencyId: selectedAgency.id,
      draftVersion: draftVersionRef.current,
      draftGeneration: draftGenerationRef.current,
      consentConfirmed: true,
      note: note.trim() || undefined,
      submissionPackage: {
        agencyName: selectedAgency?.name || null,
        agencyLocation: selectedAgency?.agency_location || null,
        boards: selectedBoards,
        boardLabels,
        mediaSetId: selectedMediaSetId,
        mediaSetName: selectedMediaSetName,
        compCardName: selectedCompCardName,
        // Chosen saved comp-card variant (null = live default composed card).
        // The agency renders this exact take via the recorded seed.
        compCardPresetId: selectedCompCardPreset?.id || null,
        compCardPresetName: selectedCompCardPreset?.name || null,
        compCardSeed: selectedCompCardPreset?.seed || null,
        digitalSlotPicks,
        imageIds: packageImages.map((img) => img.id),
        readiness: missingChecks.length === 0 ? 'Ready' : `Missing ${missingChecks.length}`,
        digitalsGaps: digitalsGaps.map((g) => g.label),
        untypedImageCount: untypedPackageCount,
        consentConfirmed: true,
      },
    });
  };

  /* ── terminal & guard states ── */

  if (applicationsQuery.isError || agenciesQuery.isError) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-error-state" role="alert">
          <h1>Couldn’t open the submission studio.</h1>
          <p>The applications service didn’t respond. Return to the market and try again.</p>
          <div className="app-error-actions">
            <PholioButton variant="secondary" onClick={exitToMarket}>
              <ArrowLeft size={14} aria-hidden /> Back to market
            </PholioButton>
          </div>
        </section>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-submit-success" role="status">
          <div className="app-submit-success__mark" aria-hidden>
            <Check size={24} strokeWidth={1.4} />
          </div>
          <h2>Submitted to {submitted.agency?.name || selectedAgency?.name || 'Agency'}</h2>
          <p>
            Your package is now with the agency. {dateLabel(submitted.submittedAt)} ·{' '}
            {submitted.frameCount} frames · Under review
          </p>
          <dl className="app-package-readiness">
            <div>
              <span>Book</span>
              <strong>{submitted.mediaSetName || selectedMediaSetName}</strong>
            </div>
            <div>
              <span>Comp card</span>
              <strong>{submitted.compCardName || selectedCompCardName}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Under review</strong>
            </div>
          </dl>
          <PholioButton variant="solid" onClick={exitToMarket}>
            Return to market <ArrowUpRight size={14} aria-hidden />
          </PholioButton>
        </section>
      </div>
    );
  }

  const initialLoading =
    (applicationsQuery.isLoading || agenciesQuery.isLoading) && openAgencies.length === 0;

  if (initialLoading) {
    return (
      <div className="applications-view-container apply-experience">
        <ApplyHeader
          selectedAgency={null}
          onExit={exitToMarket}
          onSaveAndExit={exitToMarket}
          draftStatus="loading"
          actionLabel="Exit"
        />
        <div className="apply-draft-loading" role="status">
          <Loader2 size={17} className="app-spin" aria-hidden />
          Opening application workspace…
        </div>
      </div>
    );
  }

  if (!initialLoading && openAgencies.length === 0) {
    return (
      <div className="applications-view-container apply-experience">
        <section className="app-application-empty">
          <CircleDashed size={28} strokeWidth={1.4} aria-hidden />
          <h3>Every house is already in your ledger.</h3>
          <p>Withdraw an active submission to reopen a slot, or return to follow the conversations you’ve started.</p>
          <PholioButton variant="secondary" onClick={exitToMarket}>
            <ArrowLeft size={14} aria-hidden /> Back to market
          </PholioButton>
        </section>
      </div>
    );
  }

  /* ── the house chooser (pre-dossier, when not deep-linked) ── */

  if (!selectedAgency) {
    return (
      <div className="applications-view-container apply-experience">
        <ApplyHeader
          selectedAgency={null}
          onExit={exitToMarket}
          onSaveAndExit={handleSaveAndExit}
          draftStatus="idle"
          actionLabel="Exit"
        />
        {!gating.isCoreReady && (
          <ProfileGateBanner
            variant="compact"
            featureName={applicationGate.featureName}
            featureLabel={applicationGate.featureLabel}
            description={applicationGate.description}
            {...gating}
          />
        )}
        <AgencyChooser
          agencies={openAgencies}
          isLoading={agenciesQuery.isLoading}
          onSelect={(id) => {
            setSelectedAgencyId(id);
            setPageIndex(0);
            setSelectedBoards([]);
            setSelectedMediaSetId('current');
            setSelectedCompCardPreset(null);
            setDigitalSlotPicks({});
            setExcludedImageIds(new Set());
            setNote('');
            setConsent(false);
            setDraftUpdatedAt(null);
            setDraftStatus('loading');
            setDraftHydrated(false);
            draftVersionRef.current = 0;
            draftGenerationRef.current = 0;
            lastSavedFingerprintRef.current = '';
            hydratedFor.current = null;
          }}
        />
      </div>
    );
  }

  // A brief loader while the saved draft is checked. A draft is a convenience:
  // if the check fails, hydration still completes and the flow proceeds.
  if (!draftHydrated) {
    return (
      <div className="applications-view-container apply-experience apply-experience--dossier">
        <ApplyHeader
          selectedAgency={selectedAgency}
          onExit={exitToMarket}
          onSaveAndExit={exitToMarket}
          draftStatus="loading"
          actionLabel="Checking draft…"
          actionDisabled
        />
        <div className="apply-draft-loading" role="status">
          <Loader2 size={17} className="app-spin" aria-hidden />
          Checking for your latest draft…
        </div>
      </div>
    );
  }

  /* ── the threshold — one-time "before you submit" cover that opens the
     dossier. Native chrome (header · rail · mast · foot); the affirmative
     action records the acknowledgment. After this, it never returns. ── */

  if (needsProgramAck && !programDismissed) {
    const programContent = submissionProgramQuery.data?.content;
    return (
      <div className="applications-view-container apply-experience apply-experience--dossier">
        <ApplyHeader
          selectedAgency={selectedAgency}
          onExit={handleSaveAndExit}
          onSaveAndExit={handleSaveAndExit}
          draftStatus={draftStatus}
          draftUpdatedAt={draftUpdatedAt}
        />

        <div className="apply-dossier-stage">
          <AgencyEditorialRail agency={selectedAgency} site={site} />

          <div className="apply-dossier-col">
            <header className="apply-pagemast">
              <span className="apply-pagemast__marker">Before you submit</span>
              <h1 className="apply-pagemast__title">
                {programContent?.title || 'How agency submissions work'}
              </h1>
              <p className="apply-pagemast__standfirst">
                A few things to know before your package goes to {selectedAgency.name || 'the agency'}.
                Once — then you’re composing.
              </p>
            </header>

            <div className="apply-page">
              <SubmissionThreshold content={programContent} />
            </div>
          </div>
        </div>

        <footer className="apply-foot">
          <p className="apply-foot__meta">Recorded once · you can withdraw any submission anytime</p>
          <div className="apply-foot__actions">
            <PholioButton
              variant="secondary"
              className="apply-nav-button apply-nav-button--back"
              onClick={handleBack}
            >
              Back
            </PholioButton>
            <PholioButton
              variant="solid"
              onClick={handleBeginSubmission}
              disabled={acknowledgeProgramMutation.isPending}
            >
              {acknowledgeProgramMutation.isPending ? (
                <>
                  <Loader2 size={14} className="app-spin" aria-hidden /> Recording
                </>
              ) : (
                <>
                  I understand — begin submission <ArrowUpRight size={14} aria-hidden />
                </>
              )}
            </PholioButton>
          </div>
        </footer>
      </div>
    );
  }

  /* ── the dossier (persistent rail + paginated right column) ── */

  const page = PAGES[pageIndex];
  const isLastPage = pageIndex === PAGES.length - 1;
  // Page 01 copy is agency-primary and depends on whether boards are exposed.
  const mast =
    page.id === 'board'
      ? boardPageCopy(selectedAgency, agencyOpenBoards)
      : { title: page.title, standfirst: page.standfirst };

  return (
    <div className="applications-view-container apply-experience apply-experience--dossier">
      <ApplyHeader
        selectedAgency={selectedAgency}
        onExit={handleSaveAndExit}
        onSaveAndExit={handleSaveAndExit}
        draftStatus={draftStatus}
        draftUpdatedAt={draftUpdatedAt}
      />

      {!gating.isCoreReady && (
        <ProfileGateBanner
          variant="compact"
          featureName={applicationGate.featureName}
          featureLabel={applicationGate.featureLabel}
          description={applicationGate.description}
          {...gating}
        />
      )}

      <div className={`apply-dossier-stage${FULLSCREEN_PAGES.has(page.id) ? ' apply-dossier-stage--full' : ''}`}>
        {/* Digitals and Book take over the full workspace — the rail steps aside
            so the review surface can breathe and the work reads immersively. */}
        {!FULLSCREEN_PAGES.has(page.id) && <AgencyEditorialRail agency={selectedAgency} site={site} />}

        <div className="apply-dossier-col">
          <header key={`${page.id}-mast`} className="apply-pagemast">
            <span className="apply-pagemast__marker">{pageMarker(pageIndex)}</span>
            <h1 className="apply-pagemast__title">{mast.title}</h1>
            <p className="apply-pagemast__standfirst">{mast.standfirst}</p>
          </header>

          <div key={page.id} className="apply-page">
            {page.id === 'board' && (
              <BoardPage
                agencyName={selectedAgency?.name}
                openBoards={agencyOpenBoards}
                selected={selectedBoards}
                onToggle={toggleBoard}
              />
            )}
            {page.id === 'digitals' && (
              <DigitalsPage
                slots={digitalSet}
                filled={filledSlots}
                intel={digitalsIntel}
                isMinor={isMinorProfile(profile)}
                guardianConsent={hasGuardianConsent(profile)}
                onSwap={swapSlot}
                onOpenMedia={() => navigateFromDraft('/dashboard/talent/media')}
                onOpenIdentity={() => navigateFromDraft('/dashboard/talent/profile?tab=identity')}
              />
            )}
            {page.id === 'stats' && (
              <StatsPage
                stats={statsInfo}
                isMinor={isMinorProfile(profile)}
                onOpenProfile={() => navigateFromDraft('/dashboard/talent/profile?tab=appearance')}
              />
            )}
            {page.id === 'book' && (
              <BookPage
                mediaSets={mediaSets}
                visibleImages={visibleImages}
                bookSetImages={bookSetImages}
                review={bookReview}
                excludedImageIds={excludedImageIds}
                selectedMediaSetId={selectedMediaSetId}
                onSelectSet={selectMediaSet}
                onToggleImage={toggleImage}
                onOpenMedia={() => navigateFromDraft('/dashboard/talent/media')}
              />
            )}
            {page.id === 'compcard' && (
              <CompCardPage
                profile={profile}
                agencyName={selectedAgency?.name}
                targetBoards={boardLabels.length ? boardLabels : agencyOpenBoards}
                isMinor={isMinorProfile(profile)}
                guardianConsent={hasGuardianConsent(profile)}
                selectedPresetId={selectedCompCardPreset?.id || null}
                onSelectPreset={setSelectedCompCardPreset}
                onOpenMedia={() => navigateFromDraft('/dashboard/talent/media')}
                onOpenIdentity={() => navigateFromDraft('/dashboard/talent/profile?tab=identity')}
              />
            )}
            {page.id === 'message' && (
              <MessagePage
                agency={selectedAgency}
                note={note}
                onNoteChange={(v) => setNote(v.slice(0, 1200))}
              />
            )}
            {page.id === 'review' && (
              <ReviewSendPage
                agency={selectedAgency}
                boardLabels={boardLabels}
                filledSlots={filledSlots}
                stale={packageAudit.recency.isStale}
                statsReady={!missingChecks.find((c) => c.key === 'measurements')}
                statsDate={statsDate}
                packageImages={packageImages}
                compCardName={selectedCompCardName}
                checks={checks}
                packageAudit={packageAudit}
                consent={consent}
                onConsentChange={setConsent}
              />
            )}
          </div>
        </div>
      </div>

      <footer className="apply-foot">
        <p className="apply-foot__meta">
          {monthlyLimitLabel}
          {isLastPage && !isSendReady && sendBlockers.length > 0
            ? ` · ${sendBlockers.map((blocker) => sendBlockerLabel(blocker)).join(', ')} still needed`
            : ''}
        </p>
        <div className="apply-foot__actions">
          <PholioButton
            variant="secondary"
            className="apply-nav-button apply-nav-button--back"
            onClick={handleBack}
          >
            Back
          </PholioButton>
          {!isLastPage ? (
            <PholioButton
              variant="solid"
              className="apply-nav-button apply-nav-button--next"
              onClick={handleContinue}
            >
              Next page <ArrowUpRight size={14} aria-hidden />
            </PholioButton>
          ) : (
            <PholioButton variant="solid" onClick={handleSubmit} disabled={!canSubmit}>
              {!gating.isCoreReady ? (
                <>
                  <Lock size={14} aria-hidden /> Profile incomplete
                </>
              ) : !isSendReady ? (
                <>
                  <Lock size={14} aria-hidden /> Requirements
                </>
              ) : applyMutation.isPending ? (
                <>
                  <Loader2 size={14} className="app-spin" aria-hidden /> Sending
                </>
              ) : (
                <>
                  Send package <ArrowUpRight size={14} aria-hidden />
                </>
              )}
            </PholioButton>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Workspace chrome
   ════════════════════════════════════════════════════════════ */

function ApplyHeader({
  selectedAgency,
  onExit,
  onSaveAndExit,
  draftStatus = 'idle',
  draftUpdatedAt = null,
  localDurability = 'available',
  actionLabel = null,
  actionDisabled = false,
}) {
  const savedAt = formatSavedAt(draftUpdatedAt);
  const defaultStatusText = {
    loading: 'Checking draft…',
    saving: 'Saving…',
    saved: savedAt ? `Last saved ${savedAt}` : 'Saved',
    unsaved: 'On this device · saving soon',
    error: 'Could not save',
    conflict: 'Choose a version',
    deleted: 'Deleted',
    expired: 'Expired',
    unavailable: 'Agency unavailable',
    submitted: 'Submitted',
    idle: 'Not saved yet',
  }[draftStatus] || 'Draft';
  const statusText =
    localDurability === 'failed' && (draftStatus === 'unsaved' || draftStatus === 'error')
      ? 'Not saved — keep this page open'
      : localDurability === 'available' && draftStatus === 'error'
        ? 'On this device only'
        : defaultStatusText;
  const isSaving = draftStatus === 'saving';
  const buttonLabel = actionLabel || (isSaving ? 'Saving…' : 'Save and exit');
  const disabled = isSaving || actionDisabled;

  return (
    <header className="apply-workspace-top" aria-label="Application workspace">
      <button type="button" className="apply-workspace-logo" onClick={onExit} aria-label="Back to applications">
        <span>PHOLIO</span>
      </button>
      <div
        className="apply-workspace-status"
        aria-label={selectedAgency?.name ? `Submitting to ${selectedAgency.name}` : 'Submitting to'}
      >
        <span>Submitting to</span>
        {selectedAgency?.name && <strong>{selectedAgency.name}</strong>}
      </div>
      <div className="apply-workspace-actions">
        {selectedAgency && (
          <p className={`apply-workspace-save-state is-${draftStatus}`} aria-live="polite">
            <span>Draft</span>
            <strong>{statusText}</strong>
          </p>
        )}
        <button
          type="button"
          className="apply-workspace-exit"
          onClick={onSaveAndExit}
          disabled={disabled}
          aria-label={buttonLabel}
        >
          {buttonLabel}
        </button>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════
   House chooser (pre-dossier)
   ════════════════════════════════════════════════════════════ */

function AgencyChooser({ agencies, isLoading, onSelect }) {
  const [previewId, setPreviewId] = useState(null);
  const preview = agencies.find((a) => a.id === previewId) || null;
  const site = websiteUrl(preview?.agency_website);

  return (
    <>
      <header className="apply-mast">
        <div className="apply-mast__lede">
          <h1 className="apply-mast__title">Choose the house.</h1>
          <p className="apply-mast__standfirst">
            Choose the agency your package is addressed to. Nothing is sent until you say so.
          </p>
        </div>
      </header>

      <div className="apply-address">
        <div className="apply-houses-col">
          <span className="apply-houses__label">Open agencies</span>
          <div className="apply-houses" role="listbox" aria-label="Agencies">
            {isLoading
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="apply-house apply-house--skeleton" aria-hidden />
                ))
              : agencies.map((agency, index) => {
                  const selected = previewId === agency.id;
                  return (
                    <button
                      key={agency.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`apply-house ${selected ? 'apply-house--on' : ''}`}
                      onClick={() => setPreviewId(agency.id)}
                      onDoubleClick={() => onSelect(agency.id)}
                    >
                      <span className="apply-house__num">{String(index + 1).padStart(2, '0')}</span>
                      <span className="apply-house__copy">
                        <strong className="apply-house__name">{agency.name || 'Unnamed Agency'}</strong>
                        <span className="apply-house__loc">
                          <MapPin size={12} aria-hidden />
                          {agency.agency_location || 'Global'}
                        </span>
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>

        {preview && (
          <div className="apply-chooser-preview">
            <AgencyDossier agency={preview} site={site} />
            <PholioButton variant="solid" onClick={() => onSelect(preview.id)}>
              Compose submission <ArrowUpRight size={14} aria-hidden />
            </PholioButton>
          </div>
        )}
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Constant left rail — agency identity
   ════════════════════════════════════════════════════════════ */

function AgencyEditorialRail({ agency, site }) {
  const openBoards = Array.isArray(agency.open_boards) ? agency.open_boards.filter(Boolean) : [];
  const primaryBoard = openBoards[0] || 'Representation review';
  const domain = agencyDomain(site);
  const established = agencyEstablishedLabel(agency);

  return (
    <aside className="apply-editorial-rail apply-editorial-rail--dossier" aria-label="Submission framing">
      <div className="apply-editorial-rail__identity">
        {established && (
          <span className="apply-editorial-rail__established">Established {established}</span>
        )}
        <h1>{agency.name || 'Agency'}</h1>
        <span className="apply-editorial-rail__rule" aria-hidden />
        <p>
          {agency.agency_description ||
            'You are preparing a focused agency submission. Pholio will package your book, comp card, and note for review.'}
        </p>
      </div>

      <dl className="apply-editorial-rail__facts">
        <div>
          <dt>Market</dt>
          <dd>{agency.agency_location || 'Global'}</dd>
        </div>
        <div>
          <dt>Review focus</dt>
          <dd>{primaryBoard}</dd>
        </div>
        {domain && (
          <div>
            <dt>Agency site</dt>
            <dd>
              <a href={site} target="_blank" rel="noreferrer">
                {domain}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="apply-editorial-rail__guidance">
        <h2>Scouting guidance</h2>
        <p>
          Present a clean, current edit with a direct note. Agencies review the full package, so every frame should earn its place.
        </p>
      </div>
    </aside>
  );
}

/* Match score as an editorial signal — presence through typographic scale. */
function MatchMark({ score }) {
  const tier = score >= 85 ? 'Strong affinity' : score >= 70 ? 'Close affinity' : 'Worth a look';
  return (
    <div className="apply-match" role="img" aria-label={`Match score ${score} out of 100`}>
      <span className="apply-match__label">Match</span>
      <span className="apply-match__num">{score}</span>
      <span className="apply-match__tier">{tier}</span>
    </div>
  );
}

/* The house being applied to — used in the chooser preview. */
function AgencyDossier({ agency, site }) {
  const openBoards = Array.isArray(agency.open_boards) ? agency.open_boards.filter(Boolean) : [];

  return (
    <aside className="apply-dossier" aria-label="Agency detail">
      <header className="apply-dossier__hero">
        <span className="apply-dossier__crest" aria-hidden>
          {agency.profile_image ? <img src={agency.profile_image} alt="" /> : agencyInitial(agency.name)}
        </span>
        <div className="apply-dossier__herocopy">
          <div className="apply-dossier__titleline">
            <h2 className="apply-dossier__name">{agency.name || 'Agency'}</h2>
            {site && (
              <a
                href={site}
                target="_blank"
                rel="noreferrer"
                className="apply-dossier__site"
                aria-label={`Open ${agency.name || 'agency'} website`}
              >
                <ArrowUpRight size={18} aria-hidden />
              </a>
            )}
          </div>
          <div className="apply-dossier__meta">
            <p className="apply-dossier__location">
              <MapPin size={18} aria-hidden />
              {agency.agency_location || 'Global'}
            </p>
          </div>
        </div>
        {agency.matchScore ? <MatchMark score={agency.matchScore} /> : null}
      </header>

      <div className="apply-dossier__info">
        <p className="apply-dossier__desc">
          {agency.agency_description ||
            'Open to new talent submissions. Your package arrives directly in their inbox for review.'}
        </p>

        {openBoards.length > 0 && (
          <div className="apply-boards">
            <span className="apply-boards__label">Boards now open</span>
            <ul className="apply-boards__list">
              {openBoards.map((board) => (
                <li key={board}>{board}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════
   01 — Submitting to the agency (board optional)

   Submission is to the agency; a board is the agency's own classification.
   We surface the boards the agency actually advertises as open — never a
   generic, talent-side list. When the house exposes none, there is nothing to
   choose: placement is theirs to decide, and the page simply confirms that.
   ════════════════════════════════════════════════════════════ */

function BoardPage({ agencyName, openBoards, selected, onToggle }) {
  const name = agencyName || 'the agency';

  if (openBoards.length === 0) {
    return (
      <div className="apply-board apply-board--noboards">
        <p className="apply-board__note">
          {name} hasn’t opened specific boards for submission. Your package goes to
          their desk for representation review, and they’ll place you on the board
          that fits.
        </p>
      </div>
    );
  }

  return (
    <div className="apply-board">
      <div className="apply-board__grid" role="group" aria-label="Open boards">
        {openBoards.map((board) => {
          const on = selected.includes(board);
          return (
            <button
              key={board}
              type="button"
              className={`apply-board__opt ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggle(board)}
            >
              <span className="apply-board__name">{board}</span>
              {on && <Check className="apply-board__mark" size={15} aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="apply-board__foot">
        {selected.length > 0
          ? `${name} makes the final placement — this just tells them where you see yourself.`
          : `Optional. Leave it blank and ${name} will place you on the board that fits.`}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   02 — Digitals — immersive, PITS-assisted review stage.

   Industry: digitals are the agency's truth-check — a raw, ruled set
   (headshot · ¾ · full-length · profile · back), unretouched, ≤90 days, with
   stats. They are NOT the book; a styled book frame can't stand in (the page
   inherits that rule from /media via isDigitalSlot + analyzePackageIntelligence).
   The only edit here is submission-scoped — swapping which qualifying digital
   represents a slot. Uploading, re-tagging, retouch and the rest stay in /media.
   ════════════════════════════════════════════════════════════ */

function ageLabel(image) {
  const days = getImageAgeDays(image);
  if (days == null) return null;
  if (days <= 0) return 'Today';
  if (days < 95) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function DigitalsPage({
  slots,
  filled,
  intel,
  isMinor = false,
  guardianConsent = false,
  onSwap,
  onOpenMedia,
  onOpenIdentity,
}) {
  const total = slots.length;
  const open = total - filled;
  const ready = intel.isSubmissionReady && open === 0;

  const verdict = (() => {
    if (ready) return 'A complete, current set — exactly what agencies assess first.';
    const bits = [];
    if (open > 0) bits.push(`${open} slot${open === 1 ? '' : 's'} still open`);
    if (intel.recency?.isStale) bits.push(`set is ${intel.recency.oldestDays} days old`);
    return bits.length ? bits.join(' · ') : 'Almost there — one more pass.';
  })();

  // Quiet review notes from PITS — de-duplicated, submission-relevant.
  const seen = new Set();
  const notes = (intel.advisories || []).filter((a) => {
    const key = `${a.id}-${a.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="apply-digitals">
      {/* Minors are a distinct legal regime: full-length/form-fitting body
          frames need guardian consent before they can be sent, and go only to
          the named agency — never public. The send itself is gated upstream;
          this branch makes the rule visible on the surface that prepares the
          body images. */}
      {isMinor && (
        <div
          className={`apply-digitals__minor${guardianConsent ? ' is-cleared' : ''}`}
          role="note"
        >
          <p>
            {guardianConsent
              ? 'Under-18 account — guardian consent on file. Your digitals are shared only with the agency you submit to, never published.'
              : 'You’re under 18. A parent or guardian must record consent before your set can be sent. Your full-length frames go only to the agency you submit to, never public.'}
          </p>
          {!guardianConsent && onOpenIdentity && (
            <button type="button" className="apply-digitals__minor-cta" onClick={onOpenIdentity}>
              Record guardian consent <ArrowUpRight size={13} aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="apply-digitals__band" role="status">
        <span className="apply-digitals__coverage" aria-hidden>
          {slots.map((slot) => (
            <span
              key={slot.key}
              className={`apply-digitals__seg${slot.image ? ' is-on' : ''}`}
            />
          ))}
        </span>
        <span className="apply-digitals__verdict">
          <strong>{ready ? 'Submission-ready' : `${filled} of ${total} slots`}</strong>
          {verdict}
        </span>
      </div>

      <div className="apply-digitals__set">
        {slots.map((slot) => {
          const stale =
            slot.image && intel.recency?.staleImageIds?.includes(slot.image.id);
          const age = slot.image ? ageLabel(slot.image) : null;
          return (
            <div
              key={slot.key}
              className={`apply-dslot ${slot.image ? 'is-filled' : 'is-empty'}`}
            >
              <div className="apply-dslot__frame">
                {slot.image ? (
                  <img src={imageUrl(slot.image)} alt={slot.label} loading="lazy" />
                ) : (
                  <span className="apply-dslot__add" aria-hidden>
                    <Plus size={18} />
                  </span>
                )}
                {age && (
                  <span className={`apply-dslot__age${stale ? ' is-stale' : ''}`}>{age}</span>
                )}
              </div>

              <div className="apply-dslot__meta">
                <span className="apply-dslot__label">{slot.label}</span>
                {slot.image ? (
                  <FrameReadCaption image={slot.image} surface="mw-frame" />
                ) : (
                  <span className="apply-dslot__reason">
                    {slot.bookFallback
                      ? `You have a book ${slot.label.toLowerCase()} — agencies still need a raw digital.`
                      : `No ${slot.label.toLowerCase()} digital yet.`}
                  </span>
                )}
              </div>

              {slot.image && slot.candidates.length > 1 ? (
                <button
                  type="button"
                  className="apply-dslot__swap"
                  onClick={() => onSwap(slot.key)}
                >
                  Swap · {slot.candidates.length}
                </button>
              ) : !slot.image ? (
                <button type="button" className="apply-dslot__swap" onClick={onOpenMedia}>
                  Add in media
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="apply-digitals__foot">
        {notes.length > 0 ? (
          <ul className="apply-digitals__notes" aria-label="Digitals review notes">
            {notes.map((note) => (
              <li key={`${note.id}-${note.imageIds?.[0] || 'global'}`}>{note.message}</li>
            ))}
          </ul>
        ) : (
          <p className="apply-digitals__clear">{verdict}</p>
        )}
        <button type="button" className="apply-digitals__media" onClick={onOpenMedia}>
          Refine in media <ArrowUpRight size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   03 — Stats
   ════════════════════════════════════════════════════════════ */

function StatsPage({ stats, isMinor = false, onOpenProfile }) {
  const { height, vitals, secondary, measuredAt, ageDays, isStale, isPerformance, hasAny } = stats;

  if (!hasAny) {
    return (
      <div className="apply-stats apply-stats--empty">
        <CircleDashed size={20} aria-hidden />
        <p>No measurements on file yet. Add your stats in your profile so agencies can cast you.</p>
        {onOpenProfile && (
          <button type="button" className="apply-stats__edit" onClick={onOpenProfile}>
            Add stats in profile <ArrowUpRight size={13} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  // Freshness reads as a quiet indicator; the detail lives in the hover title.
  const fresh = (() => {
    if (!measuredAt) {
      return { tone: 'unknown', title: 'No measured date on record — confirm these are current.', month: null };
    }
    const month = new Date(measuredAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (isStale) {
      const m = Math.max(1, Math.round(ageDays / 30));
      return { tone: 'stale', title: `Measured ${month} · about ${m} months ago — refresh due before you send.`, month };
    }
    return { tone: 'fresh', title: `Measured ${month} — current.`, month };
  })();

  return (
    <div className="apply-stats">
      <span className={`apply-stats__fresh apply-stats__fresh--${fresh.tone}`} title={fresh.title}>
        <span className="apply-stats__fresh-dot" aria-hidden />
        {fresh.month ? <span className="apply-stats__fresh-month">{fresh.month}</span> : null}
        <span className="apply-sr-only">{fresh.title}</span>
      </span>

      <div className="apply-stats__stage">
        {height && (
          <div className="apply-stats__height">
            <span className="apply-stats__h-label">Height</span>
            <span className="apply-stats__h-val">
              {height.cm} cm <em>/ {height.sub}</em>
            </span>
          </div>
        )}

        {vitals && (
          <div className="apply-stats__vitals" aria-label="Measurements">
            <div className="apply-stats__vrow">
              {vitals.map((v) => (
                <div key={v.label} className="apply-stats__vital">
                  <span className="apply-stats__vl">{v.label}</span>
                  <span className="apply-stats__vn">
                    {v.cm}
                    <span className="apply-stats__vu">cm</span>
                  </span>
                  <span className="apply-stats__vi">{v.in} in</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {secondary.length > 0 && (
        <dl className="apply-stats__more">
          {secondary.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="apply-stats__foot">
        {isMinor && (
          <p className="apply-stats__minor" role="note">
            Under-18 — your measurements are shared only with the agency you submit to, never published.
          </p>
        )}
        <p className="apply-stats__note">
          {isPerformance
            ? 'For this board, casting leads on your headshots and reel — measurements are supporting detail.'
            : 'Your stats travel with your digitals — agencies expect both current and accurate.'}
          {onOpenProfile && (
            <button type="button" className="apply-stats__edit" onClick={onOpenProfile}>
              Update in profile <ArrowUpRight size={13} aria-hidden />
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   04 — Book
   ════════════════════════════════════════════════════════════ */

function BookPage({
  mediaSets,
  visibleImages,
  bookSetImages,
  review,
  excludedImageIds,
  selectedMediaSetId,
  onSelectSet,
  onToggleImage,
  onOpenMedia,
}) {
  const bookOnly = (imgs) => imgs.filter(isBookFrame);
  // Book sets only — never a digitals set, never a set with no book frames.
  // (Digitals live on their own page; surfacing them here filters to empty and
  // strands the talent in an empty state with no way back.)
  const setOptions = [
    { id: 'current', name: 'Full book', count: bookOnly(visibleImages).length },
    ...mediaSets
      .map((set) => ({
        id: set.id,
        name: set.name || `${set.kind || 'Image'} set`,
        count: bookOnly(visibleImages.filter((image) => image.set_id === set.id)).length,
        kind: normalizeToken(set.kind),
      }))
      .filter((set) => set.kind !== 'digitals' && set.count > 0),
  ];

  // The opening frame is the first one actually being sent — agencies read it hardest.
  const openingId = bookSetImages.find((img) => !excludedImageIds.has(img.id))?.id || null;
  const isEmpty = bookSetImages.length === 0;

  return (
    <div className="apply-book">
      {/* Lead: the editorial read. The verdict leads; the range spread supports —
          a clear hierarchy instead of two elements competing. */}
      <header className="apply-book__lead">
        <div className="apply-book__read">
          <strong className="apply-book__verdict">{review.verdict}</strong>
          <span className="apply-book__total">
            {review.total} frame{review.total === 1 ? '' : 's'} in this submission
          </span>
        </div>
        {review.placed.length > 0 && (
          <dl className="apply-book__spread" aria-label="Range represented">
            {review.placed.map((r) => (
              <div key={r.slug} className="apply-book__reg">
                <dt className="apply-book__reg-n">{r.count}</dt>
                <dd className="apply-book__reg-l">{r.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {/* Set selector — a quiet, secondary utility, only when there's a real
          choice among book sets. */}
      {setOptions.length > 1 && (
        <div className="apply-book__sets" role="group" aria-label="Book set">
          {setOptions.map((set) => (
            <button
              key={set.id}
              type="button"
              className={`apply-book__settab ${selectedMediaSetId === set.id ? 'is-on' : ''}`}
              onClick={() => onSelectSet(set.id)}
            >
              {set.name}
              <span>{set.count}</span>
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <div className="apply-book__empty">
          <CircleDashed size={20} aria-hidden />
          <p>
            No book frames {setOptions.length > 1 ? 'in this set' : 'yet'}. Your book is your
            styled, published, and test work — separate from your raw digitals.
          </p>
          <button type="button" className="apply-book__media" onClick={onOpenMedia}>
            Build your book in media <ArrowUpRight size={13} aria-hidden />
          </button>
        </div>
      ) : (
        <>
          {/* the book in sequence — read like the agency flips through it */}
          <ol className="apply-book__seq">
            {bookSetImages.map((image, index) => {
              const included = !excludedImageIds.has(image.id);
              const register = labelForStyle(image.style_type);
              const isOpening = image.id === openingId;
              return (
                <li
                  key={image.id}
                  className={`apply-bookframe${included ? '' : ' is-out'}${isOpening ? ' is-opening' : ''}`}
                >
                  <button
                    type="button"
                    className="apply-bookframe__btn"
                    aria-pressed={included}
                    aria-label={included ? 'Hold this frame back' : 'Add this frame'}
                    onClick={() => onToggleImage(image.id)}
                  >
                    <span className="apply-bookframe__num">{String(index + 1).padStart(2, '0')}</span>
                    <img src={imageUrl(image)} alt="" loading="lazy" />
                    <span className="apply-bookframe__toggle" aria-hidden>
                      {included ? <X size={13} /> : <Plus size={13} />}
                    </span>
                    {!included && <span className="apply-bookframe__held">Held back</span>}
                  </button>
                  <span className="apply-bookframe__meta">
                    {isOpening && <span className="apply-bookframe__open">Opening</span>}
                    {register && <span className="apply-bookframe__register">{register}</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="apply-book__foot">
            {review.notes.length > 0 ? (
              <ul className="apply-book__notes" aria-label="Book review notes">
                {review.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="apply-book__clear">
                A clean, varied book. Your opening frame sets the read — make sure it’s your strongest.
              </p>
            )}
            <button type="button" className="apply-book__media" onClick={onOpenMedia}>
              Reorder &amp; edit in media <ArrowUpRight size={13} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   05 — Comp card — full-screen review of the card being sent.

   A talent has ONE composed card (the /media engine designs it from their book);
   there is no library of variants to pick. This stage confirms the card and lets
   the talent inspect both sides — exactly the leave-behind the agency receives.
   Redesigning the card itself stays in /media.
   ════════════════════════════════════════════════════════════ */

/* The most-recently-used variant is the default the agency receives — the
   server bumps `last_used_at` on apply, so /media and /apply agree. */
function pickDefaultPreset(presets) {
  if (!presets || presets.length === 0) return null;
  let best = null;
  for (const preset of presets) {
    const ts = preset.lastUsedAt ? Date.parse(preset.lastUsedAt) : 0;
    if (!best || ts > best.ts) best = { preset, ts };
  }
  return best ? best.preset : presets[0];
}

/* Build the `/pdf/view` URL for a chosen variant from its stored query
   (seed + locked hero/grid). Null preset → the live default composed card. */
function presetViewUrl(slug, preset) {
  const base = `/pdf/view/${slug}`;
  const fallback = `${base}?seed=profile:${encodeURIComponent(slug)}`;
  const q = preset?.query || (preset?.seed ? { seed: preset.seed } : null);
  if (!q) return fallback;
  const params = new URLSearchParams();
  if (q.seed) params.set('seed', q.seed);
  if (q.layoutFamily) params.set('layoutFamily', q.layoutFamily);
  if (q.styleVariant) params.set('styleVariant', q.styleVariant);
  if (q.lockHeroId) params.set('lockHeroId', q.lockHeroId);
  if (q.lockGridIds) params.set('lockGridIds', q.lockGridIds);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : fallback;
}

function CompCardPage({
  profile,
  agencyName,
  targetBoards = [],
  isMinor = false,
  guardianConsent = false,
  selectedPresetId = null,
  onSelectPreset,
  onOpenMedia,
  onOpenIdentity,
}) {
  const [flipped, setFlipped] = useState(false);
  const slug = profile?.slug;
  const name = agencyName || 'the agency';
  const minorBlocked = isMinor && !guardianConsent;

  const presetsQuery = useQuery({
    queryKey: ['compCardPresets', slug],
    queryFn: () => talentApi.listCompCardPresets(slug),
    enabled: !!slug && !minorBlocked,
    staleTime: 60_000,
  });
  const presets = useMemo(
    () => (Array.isArray(presetsQuery.data?.presets) ? presetsQuery.data.presets : []),
    [presetsQuery.data],
  );
  // A picker only appears when the talent keeps more than one variant.
  const hasPicker = presets.length > 1;
  // The card a working talent would send: one tuned to this agency's board, if
  // they keep one. Match the variant's board against the agency's boards
  // (case-insensitive). Falls back to their last-used card.
  const boardMatch = useMemo(() => {
    if (!presets.length || !Array.isArray(targetBoards) || !targetBoards.length) return null;
    const wanted = new Set(targetBoards.map((b) => String(b || '').trim().toLowerCase()));
    return presets.find((p) => p.board && wanted.has(String(p.board).trim().toLowerCase())) || null;
  }, [presets, targetBoards]);
  const defaultPreset = useMemo(
    () => boardMatch || pickDefaultPreset(presets),
    [boardMatch, presets],
  );
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) || null,
    [presets, selectedPresetId],
  );

  // Keep the recorded choice consistent with what's on screen: preselect the
  // default when a choice is required, and clear it when it isn't (0–1 variant).
  useEffect(() => {
    if (!onSelectPreset) return;
    if (!hasPicker) {
      if (selectedPresetId) onSelectPreset(null);
      return;
    }
    if (!selectedPreset && defaultPreset) onSelectPreset(defaultPreset);
  }, [hasPicker, selectedPreset, defaultPreset, selectedPresetId, onSelectPreset]);

  if (minorBlocked) {
    return (
      <div className="apply-compcard apply-compcard--gated">
        <p>
          You’re under 18 — guardian consent is required before your comp card can be previewed or
          sent. Your card carries your stats and images, shared only with the agency you submit to.
        </p>
        {onOpenIdentity && (
          <button type="button" className="apply-compcard__media" onClick={onOpenIdentity}>
            Record guardian consent <ArrowUpRight size={13} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  // The card previewed + sent: the chosen variant when a picker is shown,
  // otherwise the live default composed card.
  const previewPreset = hasPicker ? selectedPreset || defaultPreset : null;

  return (
    <div className="apply-compcard">
      <div className={`apply-compcard__stage${hasPicker ? ' apply-compcard__stage--picker' : ''}`}>
        {/* The card itself flips on click — front to back — like /media. */}
        <div className="apply-ccflip-wrap">
          <button
            type="button"
            className="apply-ccflip"
            data-flipped={flipped ? 'true' : 'false'}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show card front' : 'Show card back'}
          >
            <span className="apply-ccflip__inner">
              <span className="apply-ccflip__face apply-ccflip__face--front">
                <CompCardFace slug={slug} side="front" preset={previewPreset} />
              </span>
              <span className="apply-ccflip__face apply-ccflip__face--back">
                <CompCardFace slug={slug} side="back" preset={previewPreset} />
              </span>
            </span>
          </button>
          <span className="apply-ccflip__hint" aria-hidden>
            <RotateCw size={12} /> {flipped ? 'Show front' : 'Show back'}
          </span>
        </div>

        <div className="apply-compcard__caption">
          {hasPicker && (
            <div className="apply-ccpicker" role="radiogroup" aria-label="Choose the card to send">
              {presets.map((preset) => {
                const active = preset.id === previewPreset?.id;
                const tag = [preset.board, preset.market].filter(Boolean).join(' · ');
                const fitsBoard = preset.id === boardMatch?.id;
                const isDefault = preset.id === defaultPreset?.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`apply-ccpicker__opt ${active ? 'is-active' : ''}`}
                    onClick={() => onSelectPreset?.(preset)}
                  >
                    <span className="apply-ccpicker__text">
                      <span className="apply-ccpicker__name">{preset.name}</span>
                      {(tag || fitsBoard || isDefault) && (
                        <span className="apply-ccpicker__sub">
                          {tag && <span className="apply-ccpicker__tag">{tag}</span>}
                          {fitsBoard ? (
                            <span className="apply-ccpicker__mark">Fits this board</span>
                          ) : isDefault && (
                            <span className="apply-ccpicker__mark">Default</span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="apply-ccpicker__check" aria-hidden>
                      {active && <Check size={15} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <dl className="apply-compcard__facts">
            <div>
              <dt>Format</dt>
              <dd>5.5 × 8.5 · two-sided</dd>
            </div>
            <div>
              <dt>Composed</dt>
              <dd>From your book, always current</dd>
            </div>
          </dl>

          <p className="apply-compcard__confirm">
            {hasPicker
              ? `${name} receives the ${previewPreset?.name || 'selected'} card. Keep more cards or change a design in media.`
              : `This is the comp card ${name} receives — change its design in media.`}
            {onOpenMedia && (
              <button type="button" className="apply-compcard__media" onClick={onOpenMedia}>
                Open in media <ArrowUpRight size={13} aria-hidden />
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* A controls-free preview of one side of the live comp card. The /pdf/view doc
   is 528×1632 — front (top 816) stacked over back (bottom 816); we scale to the
   frame width and shift to the requested side. A `preset` renders that saved
   variant's exact take; otherwise the default composed card. */
function CompCardFace({ slug, side, preset = null }) {
  if (!slug) {
    return (
      <div className="apply-ccface" aria-hidden>
        <CircleDashed
          size={22}
          aria-hidden
          style={{ position: 'absolute', inset: 0, margin: 'auto', color: 'var(--app-text-faint)' }}
        />
      </div>
    );
  }
  return (
    <div className={`apply-ccface apply-ccface--${side}`}>
      <iframe
        src={presetViewUrl(slug, preset)}
        title={`Comp card — ${side}`}
        scrolling="no"
        tabIndex={-1}
        loading="lazy"
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   06 — The message
   ════════════════════════════════════════════════════════════ */

function MessagePage({ agency, note, onNoteChange }) {
  const name = agency?.name || 'this agency';

  const [assistBusy, setAssistBusy] = useState(false);
  const [assistMode, setAssistMode] = useState(null);
  const [previousNote, setPreviousNote] = useState(null);

  const trimmedNote = note.trim();
  const noteLen = trimmedNote.length;

  const runAssist = async (mode) => {
    setAssistMode(mode);
    setAssistBusy(true);
    const snapshot = note;
    try {
      const agencyPayload = {
        agencyId: agency?.id || undefined,
        agencyName: agency?.name || undefined,
      };
      let data;
      if (mode === 'draft') {
        data = await talentApi.draftSubmissionNote({
          ...agencyPayload,
          note: trimmedNote || undefined,
        });
      } else if (mode === 'sharpen') {
        data = await talentApi.sharpenSubmissionNote({
          ...agencyPayload,
          note: trimmedNote,
        });
      } else {
        data = await talentApi.shortenSubmissionNote({ note: trimmedNote });
      }

      const next = (data?.note || '').slice(0, 1200);
      if (!next) {
        toast.error('No note returned. Please try again.');
        return;
      }
      setPreviousNote(snapshot);
      onNoteChange(next);
      toast.success(
        mode === 'draft' ? 'Note drafted' : mode === 'sharpen' ? 'Note sharpened' : 'Note shortened',
      );
    } catch (err) {
      if (err?.data?.details?.code === 'STUDIO_PLUS_REQUIRED') {
        toast.error('Studio+ is required to use the note assistant.');
      } else {
        toast.error(err?.message || 'Could not update the note. Please try again.');
      }
    } finally {
      setAssistBusy(false);
      setAssistMode(null);
    }
  };

  const handleUndoAssist = () => {
    if (previousNote === null) return;
    onNoteChange(previousNote);
    setPreviousNote(null);
    toast.info('Reverted to your original note');
  };

  const assistActions = [];
  if (noteLen < 10) {
    assistActions.push({ id: 'draft', label: 'Draft a note', onClick: () => runAssist('draft') });
  } else {
    assistActions.push({ id: 'sharpen', label: 'Sharpen', onClick: () => runAssist('sharpen') });
    if (noteLen >= 50) {
      assistActions.push({ id: 'shorten', label: 'Shorten', onClick: () => runAssist('shorten') });
    }
  }

  const busyLabel =
    assistMode === 'draft'
      ? 'Drafting…'
      : assistMode === 'sharpen'
        ? 'Sharpening…'
        : assistMode === 'shorten'
          ? 'Shortening…'
          : 'Working…';

  return (
    <div className="apply-message">
      <div className="app-application-note">
        <span className="apply-note-lbl">A note to {name}</span>
        <WritingAssistToolbar
          className="apply-note-assist"
          actions={assistActions}
          busy={assistBusy}
          busyActionId={assistMode}
          busyLabel={busyLabel}
          showUndo={previousNote !== null}
          onUndo={handleUndoAssist}
        />
        <textarea
          id="apply-note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={`A few honest lines for ${name} — who you are, why them.`}
          rows={6}
        />
        <small>{note.length} / 1200</small>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   07 — Review & send
   ════════════════════════════════════════════════════════════ */

function ReviewSendPage({
  agency,
  boardLabels,
  filledSlots,
  stale,
  statsReady,
  statsDate,
  packageImages,
  compCardName,
  checks,
  packageAudit,
  consent,
  onConsentChange,
}) {
  const name = agency?.name || 'this agency';
  const manifest = [
    { label: 'To', value: name },
    {
      label: 'Board',
      value: boardLabels.length ? boardLabels.join(', ') : 'Agency’s placement',
    },
    {
      label: 'Digitals',
      value: `${filledSlots} of ${DIGITAL_SLOTS.length}${stale ? ' · aged' : filledSlots === DIGITAL_SLOTS.length ? ' · current' : ''}`,
    },
    {
      label: 'Stats',
      value: statsReady ? `Complete${statsDate ? ` · ${statsDate}` : ''}` : 'Incomplete',
    },
    { label: 'Book', value: `${packageImages.length} frame${packageImages.length === 1 ? '' : 's'}` },
    { label: 'Comp card', value: compCardName },
  ];

  return (
    <div className="apply-review">
      <section className="apply-manifest" aria-label="Enclosed in this submission">
        <span className="apply-manifest__label">Enclosed for {name}</span>
        <dl className="apply-manifest__list">
          {manifest.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ul className="apply-readyline" aria-label="Profile readiness">
        {checks.map((check) => (
          <li key={check.label} className={check.complete ? 'is-ok' : 'is-need'}>
            {check.complete ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
            {check.label}
          </li>
        ))}
      </ul>

      {packageAudit?.advisories?.length > 0 && (
        <ul className="apply-package-audit" aria-label="Package notes">
          {packageAudit.advisories.map((item) => (
            <li key={`${item.id}-${item.imageIds?.[0] || 'global'}`}>{item.message}</li>
          ))}
        </ul>
      )}

      <label className="app-consent-check">
        <input type="checkbox" checked={consent} onChange={(e) => onConsentChange(e.target.checked)} />
        <span>I consent to sharing my profile, book, and comp card with {name}.</span>
      </label>
    </div>
  );
}
