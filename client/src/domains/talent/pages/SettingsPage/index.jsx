import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  CreditCard,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Mail,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { purgeApplyDraftStorage } from '../ApplyPage/applicationDraftStorage';
import { auth } from '../../../../shared/lib/firebase';
import { isMinorProfile, minorPublicExposureAllowed } from '../../../../shared/utils/talentAge';
import {
  clearConsent,
  getConsent,
  onConsentChange,
  setConsent,
} from '../../../../shared/lib/cookie-consent';
import ReportDialog from '../../../../shared/components/ReportDialog';
import { SubscriptionCheckoutModal } from '../../../../shared/components/SubscriptionCheckoutDisclosure';
import CheckoutHandoff from '../../../../shared/components/billing/CheckoutHandoff';
import SubscriptionReturnBanner from '../../../../shared/components/billing/SubscriptionReturnBanner';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import PholioCustomSelect from '../../../../shared/components/ui/forms/PholioCustomSelect';
import { useBrandedStripeCheckout } from '../../../../shared/hooks/useBrandedStripeCheckout';
import { formatPhoneDisplay } from '../../../../shared/lib/phone-format';
import { identityFormFromProfile } from './identityForm';
import { STUDIO_LEDE, portalReturnStatus } from './studioCopy';
import './SettingsPage.css';

/* ------------------------------------------------------------------ *
 * The settings ledger. One editorial surface synthesised from the
 * profile "movements" rail and the applications masthead + market index.
 * Every control writes to a live endpoint — nothing here is decorative.
 * ------------------------------------------------------------------ */

const PUBLIC_PORTFOLIO_ORIGIN = (
  import.meta.env.VITE_PORTFOLIO_URL || 'https://pholio.studio'
).replace(/\/$/, '');

/**
 * There is no "Presentation" section. It held comp-card layout, cover image and
 * watermark — none of which had a consumer. Comp cards are composed from the
 * actual frames by the generator, the lead frame is chosen in Media, and the PDF
 * watermark tracks the plan (`!profile.is_pro`), not a preference.
 */
const MOVEMENTS = [
  { id: 'identity', label: 'Identity', summary: 'Name, sign-in, handle' },
  { id: 'presence', label: 'Presence', summary: 'Who can see and reach you' },
  { id: 'notifications', label: 'Signals', summary: 'What Pholio tells you' },
  { id: 'studio', label: 'Membership', summary: 'Plan and billing' },
  { id: 'security', label: 'Security', summary: 'Sign-in and devices' },
  { id: 'privacy', label: 'Data', summary: 'Cookies and export' },
  { id: 'legal', label: 'Standing', summary: 'Consent and protection' },
  { id: 'account', label: 'Account', summary: 'Pause or close' },
];

const MOVEMENT_IDS = MOVEMENTS.map((m) => m.id);

/* --- data hooks (reused, live-wired) ------------------------------- */

function useTalentSettings() {
  return useQuery({
    queryKey: ['talent-settings'],
    queryFn: talentApi.getSettings,
    select: (data) => data?.settings ?? data,
  });
}

function useSettingsMutation(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => talentApi.updateSettings(payload),
    onSuccess: (response) => {
      const settings = response?.settings ?? response;
      if (settings) queryClient.setQueryData(['talent-settings'], { success: true, settings });
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      options.onSuccess?.(settings);
    },
    onError: (error) => {
      toast.error(error?.message || 'Unable to save settings');
      options.onError?.(error);
    },
  });
}

/* --- helpers ------------------------------------------------------- */

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* --- shared primitives --------------------------------------------- */

function Movement({ id, title, lede, children }) {
  return (
    <article className="set-movement" id={`movement-${id}`} aria-labelledby={`${id}-title`}>
      <header className="set-movement__head">
        <h2 className="set-movement__title" id={`${id}-title`}>{title}</h2>
        {lede && <p className="set-movement__lede">{lede}</p>}
      </header>
      {children}
    </article>
  );
}

function Row({ title, description, children, muted = false }) {
  return (
    <div className={`set-row${muted ? ' set-row--muted' : ''}`}>
      <div className="set-row__copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, disabled, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`set-toggle${checked ? ' is-on' : ''}`}
      onClick={onChange}
    >
      <span className="set-toggle__track" aria-hidden="true">
        <span className="set-toggle__knob" />
      </span>
    </button>
  );
}

/**
 * The state of something that is not a switch. Used where a row exists because
 * the behaviour is worth stating, not because there is a decision to make —
 * these used to be paragraphs floating between cards, which read as leftover
 * copy rather than part of the ledger.
 */
function Locked({ children }) {
  return (
    <span className="set-locked">
      <Lock size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="set-field">
      <span className="set-field__label">{label}</span>
      {children}
      {hint && <span className="set-field__hint">{hint}</span>}
    </label>
  );
}

function SkeletonRows({ count = 3 }) {
  return (
    <div className="set-skeleton" aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <span key={i} />)}
    </div>
  );
}

/* --- sign-in identity ---------------------------------------------- */

/**
 * Google's "G", inline so it survives the CSP and needs no asset pipeline.
 * This is Google's own asset, byte-for-byte — the path data and viewBox are
 * copied verbatim from `fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg`,
 * the same product-icon asset Google's own surfaces load for the mark. It is
 * never recoloured, outlined, resized non-uniformly, or given a currentColor
 * treatment — Google's brand guidelines require it shown unmodified.
 */
function GoogleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * Material Symbols "open_in_new", inline for the same CSP reason as the G
 * above. Path data copied verbatim from Google's Material Symbols CDN
 * (`fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/open_in_new/default/24px.svg`)
 * — this is the exact glyph Google's own products use for "this leaves the
 * current app," not a stand-in from a third-party icon set.
 */
function OpenInNewIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z" />
    </svg>
  );
}

/** Instagram's glyph, white on the brand gradient tile (see `.set-signin__mark--instagram`). */
function InstagramMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" focusable="false">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

/** Apple's mark, white on black — the only presentation Apple's guidelines allow. */
function AppleMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" focusable="false">
      <path d="M17.05 12.54c-.02-2.2 1.79-3.25 1.87-3.3-1.02-1.49-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.52zM14.9 5.98c.61-.74 1.02-1.77.91-2.79-.88.04-1.94.58-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.23z" />
    </svg>
  );
}

/** Facebook's "f", white on brand blue. */
function FacebookMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" focusable="false">
      <path d="M13.5 21.9V13.9h2.7l.4-3.1h-3.1V8.8c0-.9.25-1.5 1.55-1.5H16.7V4.5c-.29-.04-1.28-.13-2.43-.13-2.41 0-4.06 1.47-4.06 4.17v2.32H7.5v3.1h2.71v8h3.29z" />
    </svg>
  );
}

const PROVIDERS = {
  google: { name: 'Google', mark: GoogleMark },
  instagram: { name: 'Instagram', mark: InstagramMark },
  apple: { name: 'Apple', mark: AppleMark },
  facebook: { name: 'Facebook', mark: FacebookMark },
};

/**
 * Sign-in identity, kept distinct from the editable profile fields around it.
 * This used to be a disabled "Sign-in email" text input, then a card nested
 * inside a card with a shadowed circle logo and a green "Connected" pill —
 * both visual interpretations of "Google-ish," not anything Google ships.
 *
 * This row is rebuilt from Google's own source, not from memory of what a
 * Google row "looks like":
 * - Geometry is Material 3's actual two-line list-item (`<md-list-item>` /
 *   `<md-item>` in google/material-web) — 16px gap between leading element,
 *   text block, and trailing action; 12px/16px block/inline padding; 72px
 *   min height. None of that is eyeballed — it's the literal token values in
 *   material-web's `tokens/versions/v0_192` package and the `:host` rules in
 *   `list/internal/listitem/_list-item.scss` and `labs/item/internal/_item.scss`.
 * - The leading element uses M3's *avatar* slot, not its plain icon slot —
 *   the spec reserves avatar (40px, fully round) specifically for rows whose
 *   leading content identifies a person or account, versus the 24px icon
 *   slot for a row that merely triggers a control. This row identifies an
 *   account, so avatar is the correct slot: `list-item-leading-avatar-size`
 *   is 40px, `-shape` is `corner-full`. Avatars are normally filled with a
 *   tonal colour, but Google's own brand guidelines require the G mark
 *   specifically "on a white background," so the fill is white with a
 *   1px `outline-variant` ring for contrast instead of a tonal fill — no
 *   drop shadow; M3 avatars don't carry elevation of their own.
 * - Colour and type are Google's actual production values, taken from the
 *   live CSS Google's own accounts surface ships today: `#1f1f1f` headline /
 *   `#444746` supporting text / `#0b57d0` primary (the current GM3 blue —
 *   note this superseded the older `#1a73e8`) / `#e8eaed` divider and ring, in
 *   "Google Sans Flex","Google Sans Text","Google Sans",Roboto,Arial.
 * - The mark is Google's actual asset (`GoogleMark`, byte-for-byte from
 *   `fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg`) — never
 *   recoloured or reshaped, only ever resized uniformly.
 * - "Manage" is a real Material 3 text button (40px, fully-rounded, 8px
 *   icon/label gap, 0.08/0.12 hover/press state-layer opacity — again the
 *   literal `md-sys-state` values) opening the identity's actual home,
 *   `myaccount.google.com/permissions` — Pholio has no such screen of its own.
 *
 * Three states, and the third matters: a provider we can't resolve is *unknown*,
 * not "email and password". Asserting a password login to a Google account is a
 * lie the talent can act on — they go looking for a password that doesn't exist.
 */
function GoogleSignInIdentity({ email, label = 'How you sign in' }) {
  return (
    <div className="set-signin-google">
      {label && (
        <div className="set-signin-google__label">
          <KeyRound size={15} aria-hidden="true" />
          <span>{label}</span>
        </div>
      )}
      <div className="set-signin-google__item">
        <span className="set-signin-google__leading">
          <GoogleMark size={22} />
        </span>
        <span className="set-signin-google__text">
          <span className="set-signin-google__headline" title={email || undefined}>
            {email || 'Account email unavailable'}
          </span>
          <span className="set-signin-google__supporting">Signed in with Google</span>
        </span>
        <a
          className="set-signin-google__button"
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noreferrer"
        >
          Manage
          <OpenInNewIcon size={18} />
        </a>
      </div>
      <p className="set-signin-google__note">
        Your password and 2-step verification are managed directly by your Google Account. Pholio never sees or stores your Google password.
      </p>
    </div>
  );
}

function SignInIdentity({ email, provider, label = 'How you sign in' }) {
  if (provider === 'google') {
    return <GoogleSignInIdentity email={email} label={label} />;
  }

  const known = provider ? PROVIDERS[provider] : null;
  const isPassword = provider === 'password';

  const Mark = known?.mark;
  const name = known?.name || (isPassword ? 'Email and password' : 'Pholio account');
  const note = known
    ? `Your password and any two-step verification live with ${known.name}. Pholio never sees them.`
    : isPassword
      ? 'A password you set on Pholio, kept separate from the contact details on your profile.'
      : 'How this account signs in isn’t on record yet — it is written the next time you sign in.';

  return (
    <div className="set-signin">
      {label && (
        <div className="set-signin__label">
          <KeyRound size={15} aria-hidden="true" />
          <span>{label}</span>
        </div>
      )}
      <div className="set-signin__identity">
        <span className={`set-signin__mark set-signin__mark--${known ? provider : 'email'}`}>
          {Mark ? <Mark size={24} /> : <Mail size={20} aria-hidden="true" />}
        </span>
        <span className="set-signin__who">
          <strong>{name}</strong>
          <span className="set-signin__address" title={email || undefined}>
            {email || 'Account email unavailable'}
          </span>
        </span>
      </div>
      <p className="set-signin__note">{note}</p>
    </div>
  );
}

/* --- page ---------------------------------------------------------- */

export default function SettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const prefersReduced = useReducedMotion();
  const { data: settings, isLoading } = useTalentSettings();

  const SECTION_ALIASES = {
    subscription: 'studio',
    membership: 'studio',
    billing: 'studio',
    plan: 'studio',
  };
  const resolvedSection = SECTION_ALIASES[section] || section;
  const active = MOVEMENT_IDS.includes(resolvedSection) ? resolvedSection : 'identity';

  const selectTab = useCallback((id) => {
    navigate(`/dashboard/talent/settings/${id}`);
  }, [navigate]);

  const renderActivePanel = () => {
    switch (active) {
      case 'identity':
        return <IdentityMovement settings={settings} />;
      case 'presence':
        return <PresenceMovement settings={settings} isLoading={isLoading} />;
      case 'notifications':
        return <NotificationsMovement settings={settings} isLoading={isLoading} />;
      case 'studio':
        return <StudioMovement settings={settings} isLoading={isLoading} />;
      case 'security':
        return <SecurityMovement settings={settings} isLoading={isLoading} />;
      case 'privacy':
        return <PrivacyMovement settings={settings} isLoading={isLoading} />;
      case 'legal':
        return <LegalMovement />;
      case 'account':
        return <AccountMovement settings={settings} />;
      default:
        return <IdentityMovement settings={settings} />;
    }
  };

  return (
    <div className="talent-settings">
      <header className="set-page-header">
        <h1 className="set-page-title">Settings</h1>
      </header>

      <div className="set-workspace">
        <nav className="set-rail" aria-label="Settings sections">
          <ol>
            {MOVEMENTS.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={active === m.id ? 'is-active' : ''}
                  aria-current={active === m.id ? 'true' : undefined}
                  onClick={() => selectTab(m.id)}
                >
                  <span className="set-rail__text">
                    <strong>{m.label}</strong>
                    <small>{m.summary}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <motion.main
          className="set-main"
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? false : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderActivePanel()}
            </motion.div>
          </AnimatePresence>
        </motion.main>
      </div>
    </div>
  );
}

/* --- I · Identity -------------------------------------------------- */

const LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'Italian',
  'German',
  'Portuguese',
  'Japanese',
  'Korean',
].map((language) => ({ value: language, label: language }));

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

function IdentityMovement({ settings }) {
  const { profile, updateProfile, isUpdatingProfile } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  // Seed from the cached auth profile on mount — otherwise the render-sync below
  // never fires when React Query already has auth-user (normal in-dashboard nav).
  const [form, setForm] = useState(() => identityFormFromProfile(profile));
  const [dirty, setDirty] = useState(false);

  const handleMutation = useSettingsMutation({ onSuccess: () => toast.success('Public handle updated') });
  const canonicalSlug = settings?.slug || profile?.slug || '';
  const [handle, setHandle] = useState(canonicalSlug);
  const [handleDirty, setHandleDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync canonical slug into local handle when not dirty (adjust during render).
  const [prevCanonicalSlug, setPrevCanonicalSlug] = useState(canonicalSlug);
  const [prevHandleDirty, setPrevHandleDirty] = useState(handleDirty);
  if (canonicalSlug !== prevCanonicalSlug || handleDirty !== prevHandleDirty) {
    setPrevCanonicalSlug(canonicalSlug);
    setPrevHandleDirty(handleDirty);
    if (!handleDirty) setHandle(canonicalSlug);
  }

  // Sync server profile into local form when not dirty (adjust during render).
  // Form is seeded from the cached profile above; this covers async profile
  // arrival and later refetches without wiping in-progress edits.
  const [prevProfile, setPrevProfile] = useState(profile);
  const [prevDirty, setPrevDirty] = useState(dirty);
  if (profile !== prevProfile || dirty !== prevDirty) {
    setPrevProfile(profile);
    setPrevDirty(dirty);
    if (profile && !dirty) {
      setForm(identityFormFromProfile(profile));
    }
  }

  const setField = (key, value) => { setForm((prev) => ({ ...prev, [key]: value })); setDirty(true); };

  const save = async () => {
    try {
      const result = await updateProfile({ ...form, languages: form.language ? [form.language] : [] });
      // Apply the persisted profile before clearing dirty so the render-sync cannot
      // race-wipe the form with a stale auth-user cache entry.
      if (result?.profile) {
        setForm(identityFormFromProfile(result.profile));
        setPrevProfile(result.profile);
      }
      setDirty(false);
      toast.success('Identity saved');
    } catch (error) {
      toast.error(error?.message || 'Unable to save identity');
    }
  };

  const saveHandle = () => {
    const cleaned = slugify(handle);
    if (!cleaned || cleaned === canonicalSlug) { setHandleDirty(false); setHandle(canonicalSlug); return; }
    handleMutation.mutate({ slug: cleaned }, { onSuccess: () => setHandleDirty(false) });
  };

  const copyLink = async () => {
    if (!canonicalSlug) return;
    try {
      await navigator.clipboard.writeText(`${PUBLIC_PORTFOLIO_ORIGIN}/${canonicalSlug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Unable to copy link');
    }
  };

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('media', file);
    body.append('image_type', 'portfolio');
    body.append('shot_type', 'headshot');
    body.append('style_type', 'studio');
    body.append('status', 'active');
    setUploading(true);
    try {
      const result = await talentApi.uploadMedia(body);
      const uploaded = result?.images?.[0];
      if (uploaded?.id) await talentApi.setHeroImage(uploaded.id);
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      toast.success('Primary image updated');
    } catch (error) {
      toast.error(error?.message || 'Unable to update image');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <Movement
      id="identity"
      title="Who you are on the record"
      lede="The details that carry your submissions, comp cards, and account recovery. Measurements and board detail stay in Profile."
    >
      <div className="set-card">
        <div className="set-identity">
          <button
            type="button"
            className="set-identity__avatar"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Update primary image"
          >
            {profile?.photo_url_primary
              ? <img src={profile.photo_url_primary} alt="" />
              : <Camera size={22} aria-hidden="true" />}
            <span className="set-identity__avatar-veil">
              {uploading ? <Loader2 size={16} className="set-spin" aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
              {uploading ? 'Uploading' : 'Replace'}
            </span>
          </button>
          <input ref={fileRef} className="set-visually-hidden" type="file" accept="image/*" onChange={uploadPhoto} />

          <div className="set-fields set-fields--two">
            <Field label="First name">
              <input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} autoComplete="family-name" />
            </Field>
            <Field label="Phone" hint="booking contact only, never public">
              <input
                value={form.phone ? formatPhoneDisplay(form.phone) : ''}
                onChange={(e) => setField('phone', formatPhoneDisplay(e.target.value))}
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
              />
            </Field>
            <PholioCustomSelect
              label="Working language"
              id="settings-language"
              options={LANGUAGE_OPTIONS}
              value={form.language}
              onChange={(value) => setField('language', value)}
              placeholder="Select language"
            />
            <PholioCustomSelect
              label="Home timezone"
              id="settings-timezone"
              options={TIMEZONE_OPTIONS}
              value={form.timezone}
              onChange={(value) => setField('timezone', value)}
              placeholder="Select timezone"
            />
          </div>
        </div>
        <div className="set-card__foot">
          <PholioButton type="button" variant="primary" disabled={!dirty || isUpdatingProfile} onClick={save}>
            {isUpdatingProfile ? 'Saving…' : 'Save identity'}
          </PholioButton>
        </div>
      </div>

      <div className="set-card">
        <SignInIdentity
          email={settings?.user?.email || profile?.email || ''}
          provider={settings?.user?.authProvider}
        />
      </div>

      <div className="set-card">
        <div className="set-handle">
          <div className="set-handle__label">
            <Link2 size={15} aria-hidden="true" />
            <span>Public handle</span>
          </div>
          <p className="set-handle__note">The address of your public book. Changing it retires the old link.</p>
          <div className="set-handle__field">
            <span className="set-handle__origin">{PUBLIC_PORTFOLIO_ORIGIN.replace(/^https?:\/\//, '')}/</span>
            <input
              value={handle}
              onChange={(e) => { setHandle(e.target.value); setHandleDirty(true); }}
              onBlur={() => setHandle((h) => slugify(h))}
              placeholder="your-name"
              aria-label="Public handle"
              spellCheck={false}
            />
          </div>
          <div className="set-handle__actions">
            <PholioButton
              type="button"
              variant="secondary"
              onClick={saveHandle}
              disabled={handleMutation.isPending || !handleDirty || slugify(handle) === canonicalSlug || !slugify(handle)}
            >
              {handleMutation.isPending ? 'Saving…' : 'Save handle'}
            </PholioButton>
            <button type="button" className="set-inline-link" onClick={copyLink} disabled={!canonicalSlug}>
              {copied ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy link</>}
            </button>
          </div>
        </div>
      </div>
    </Movement>
  );
}

/* --- II · Public presence ------------------------------------------ */

function PresenceMovement({ settings, isLoading }) {
  const { profile } = useAuth();
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Presence updated') });
  const agencyDirectoryQuery = useQuery({
    queryKey: ['agency-privacy-directory'],
    queryFn: talentApi.getAgencyPrivacyDirectory,
  });
  const [blockInput, setBlockInput] = useState('');
  const minorLocked = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);
  const blockedAgencies = settings?.blockedAgencies || [];
  const agencyDirectory = Array.isArray(agencyDirectoryQuery.data)
    ? agencyDirectoryQuery.data
    : [];
  const agencyById = new Map(agencyDirectory.map((agency) => [agency.id, agency]));

  const normalizedAgencyIdentity = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const update = (payload) => mutation.mutate(payload);
  const addBlock = () => {
    const entered = blockInput.trim();
    if (!entered) return;
    const needle = normalizedAgencyIdentity(entered);
    const matchedAgency = agencyDirectory.find((agency) => [
      agency.id,
      agency.name,
      agency.agency_website,
    ].some((identity) => normalizedAgencyIdentity(identity) === needle));
    const value = matchedAgency?.id || entered;
    update({ blockedAgencies: [...new Set([...blockedAgencies, value])] });
    setBlockInput('');
  };
  const removeBlock = (name) => update({ blockedAgencies: blockedAgencies.filter((a) => a !== name) });

  return (
    <Movement
      id="presence"
      title="Who can see and reach you"
      lede="Your public book and your discoverability are two separate decisions. Digitals and measurements always stay sensitive submission material."
    >
      {minorLocked && (
        <p className="set-notice">
          Public exposure and public contact details are locked until a valid date of birth and guardian consent are on file.
        </p>
      )}

      <div className="set-card">
        {isLoading ? <SkeletonRows /> : (
          <>
            <Row title="Public portfolio" description="Let your book be viewed at its public link, outside your account.">
              <Toggle label="Public portfolio" checked={!!settings?.isPublic} disabled={mutation.isPending || minorLocked} onChange={() => update({ isPublic: !settings?.isPublic })} />
            </Row>
            <Row title="Agency discovery" description="Let vetted agencies surface you in Pholio Discover search.">
              <Toggle label="Agency discovery" checked={!!settings?.isDiscoverable} disabled={mutation.isPending || minorLocked} onChange={() => update({ isDiscoverable: !settings?.isDiscoverable })} />
            </Row>
            {/*
              There was a "Show contact details" toggle here, defaulted on, claiming
              to expose email or phone "on eligible public surfaces". No public
              surface renders talent contact details, so it controlled nothing while
              implying exposure. It reads as a row in the same ledger as the switches
              it qualifies — a state, not a decision — rather than a paragraph left
              floating after the card.
            */}
            <Row
              title="Contact details"
              description="Your email and phone stay with Pholio. Agencies reach you here, and you decide what each submission carries."
              muted
            >
              <Locked>Never published</Locked>
            </Row>
          </>
        )}
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Blocked agencies</h3>
            <p className="set-card__sub">Keep specific agencies from seeing your discoverable profile. Applications already submitted may remain on record.</p>
          </div>
        </div>
        <div className="set-blockform">
          <input
            value={blockInput}
            onChange={(e) => setBlockInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBlock(); } }}
            placeholder="Agency name or domain"
            aria-label="Agency to block"
            list="agency-block-options"
          />
          <datalist id="agency-block-options">
            {agencyDirectory.map((agency) => (
              <option key={agency.id} value={agency.name} />
            ))}
          </datalist>
          <PholioButton type="button" variant="secondary" onClick={addBlock} disabled={!blockInput.trim() || mutation.isPending}>
            <Plus size={15} aria-hidden="true" /> Block
          </PholioButton>
        </div>
        {blockedAgencies.length ? (
          <ul className="set-blocklist">
            {blockedAgencies.map((agency) => (
              <li key={agency}>
                <span>{agencyById.get(agency)?.name || agency}</span>
                <button type="button" onClick={() => removeBlock(agency)} disabled={mutation.isPending} aria-label={`Unblock ${agencyById.get(agency)?.name || agency}`}>
                  <X size={13} aria-hidden="true" /> Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="set-empty">No agencies are blocked.</p>
        )}
      </div>
    </Movement>
  );
}

/* --- III · Notifications ------------------------------------------- */

/**
 * Only the two categories the notification service actually consults. The list
 * previously also offered an email rhythm (immediate / daily / weekly — no digest
 * job exists), "Product notes", and a "Messages" switch that
 * `shared/services/notifications.js` deliberately ignores, because a booker
 * reaching out always has to reach you.
 */
const NOTIFICATION_ROWS = [
  ['applicationUpdates', 'Submission updates', 'Received, reviewed, kept on file, meeting, offer, and decline.'],
  ['profileViews', 'Agency views', 'When an agency opens your portfolio or comp card.'],
];

/** Time-sensitive by nature — the notification service will not suppress these. */
const ALWAYS_ON_ROWS = [
  ['Messages from agencies', 'A booker writing to you always reaches you.'],
];

function NotificationsMovement({ settings, isLoading }) {
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Signal preference saved') });
  const notifications = settings?.notifications || {};
  // Defaults are ON server-side; only an explicit false opts out.
  const value = (key) => notifications[key] !== false;
  const save = (next) => mutation.mutate({ notifications: { ...notifications, ...next } });

  return (
    <Movement
      id="notifications"
      title="What Pholio tells you"
      lede="Two signals you can turn down, and two you can’t — a booker’s message and a meeting time are the ones you can’t afford to miss."
    >
      <div className="set-card">
        {isLoading ? <SkeletonRows count={2} /> : (
          <>
            {NOTIFICATION_ROWS.map(([key, title, desc]) => (
              <Row key={key} title={title} description={desc}>
                <Toggle label={title} checked={value(key)} disabled={mutation.isPending} onChange={() => save({ [key]: !value(key) })} />
              </Row>
            ))}
            {/*
              The two signals `shared/services/notifications.js` refuses to suppress.
              They belong in the same list as the switches — a booker writing to you
              is a signal, and its state is "always on". Stating that in a paragraph
              under the card left the list looking as if it were the whole story.
            */}
            {ALWAYS_ON_ROWS.map(([title, desc], i) => (
              <Row key={title} title={title} description={desc} muted={i === ALWAYS_ON_ROWS.length - 1}>
                <Locked>Always on</Locked>
              </Row>
            ))}
          </>
        )}
      </div>
    </Movement>
  );
}

/* --- V · Studio+ --------------------------------------------------- */

export function StudioMovement({ settings, isLoading }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [returnState, setReturnState] = useState(() => searchParams.get('checkout'));
  // Stripe's billing portal returns to `?billing=portal-return` (set in
  // src/shared/lib/stripe.js). The portal is where cancelling actually happens,
  // and until now this page ignored the parameter entirely — you cancelled,
  // came back, and the page still showed the pre-cancel state from cache.
  const [portalReturn] = useState(
    () => searchParams.get('billing') === 'portal-return',
  );
  const [opening, setOpening] = useState(false);
  // A refused checkout that the talent must be able to read and act on — the
  // jurisdiction gate (403 region_unavailable) is a standing fact about where
  // we sell, not a transient failure, so it outlives a toast.
  const [checkoutBlocked, setCheckoutBlocked] = useState(null);
  // useBrandedStripeCheckout takes the session-creating FUNCTION and owns the
  // handoff state itself. It was being handed an options object, so the hook
  // called that object and threw "createSession is not a function" — surfacing
  // minified as "l is not a function" the moment Start Studio+ was clicked.
  const { handoffOpen, redirectToCheckout } = useBrandedStripeCheckout(
    (payload) => talentApi.createCheckoutSession(payload),
  );
  const subscription = settings?.subscription;

  useEffect(() => {
    if (!returnState) return;
    if (returnState === 'success') {
      toast.success('Studio+ is being activated');
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    }
    setSearchParams({}, { replace: true });
  }, [queryClient, returnState, setSearchParams]);

  // Coming back from the portal, the cached subscription is stale by
  // definition. Refetch, then state what is now true (see portalReturnStatus)
  // and strip the parameter so a refresh doesn't re-announce it.
  useEffect(() => {
    if (!portalReturn) return;
    queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
    queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    setSearchParams({}, { replace: true });
  }, [portalReturn, queryClient, setSearchParams]);

  const openBilling = async () => {
    if (subscription?.stripeCustomerId && subscription.status && !['free', 'canceled'].includes(subscription.status)) {
      window.location.href = '/stripe/customer-portal';
      return;
    }
    setCheckoutOpen(true);
  };
  const confirmCheckout = async (payload) => {
    setCheckoutOpen(false);
    setOpening(true);
    setCheckoutBlocked(null);
    try {
      await redirectToCheckout(payload);
    } catch (error) {
      // 403 region_unavailable: Studio+ isn't sold in this state yet. That is a
      // fact the talent needs on the page, not a red toast that vanishes.
      if (error?.status === 403 && error?.data?.code === 'region_unavailable') {
        setCheckoutBlocked(error.message);
      } else {
        toast.error(error?.message || 'Unable to open billing');
      }
      setOpening(false);
    }
  };

  return (
    <Movement
      id="studio"
      title="Membership"
      lede={STUDIO_LEDE}
    >
      <CheckoutHandoff open={handoffOpen} planLabel="Studio+" />
      <SubscriptionReturnBanner state={returnState} onDismiss={() => setReturnState(null)} />

      {isLoading || !subscription ? (
        <div className="set-card"><SkeletonRows count={2} /></div>
      ) : (
        <>
          <div className="set-card set-plan">
            <div className="set-plan__head">
              <div className="set-plan__name">
                <strong>{subscription.planName}</strong>
                <span>{subscription.priceLabel || '$0'}{subscription.priceUnit || '/month'}</span>
              </div>
              <PholioButton type="button" variant="primary" onClick={openBilling} disabled={opening}>
                {opening || handoffOpen ? 'Opening…' : subscription.isPro ? 'Manage billing' : 'Start Studio+'}
              </PholioButton>
            </div>
            <p className="set-plan__renewal">
              {subscription?.renewalDate
                ? `Renews ${formatDate(subscription.renewalDate)}`
                : subscription?.isTrialing
                  ? `Trial ends ${formatDate(subscription.trialEndDate)}`
                  : (
                    <>
                      <span className="set-plan__trial-highlight">14-day trial available.</span>{' '}
                      <span className="set-plan__trial-sub">Cancel anytime.</span>
                    </>
                  )}
            </p>
            {portalReturn && (
              <p className="set-plan__status" role="status" data-testid="portal-return-status">
                {portalReturnStatus(subscription)}
              </p>
            )}
            {checkoutBlocked && (
              <p className="set-plan__status set-plan__status--blocked" role="status" data-testid="checkout-blocked">
                {checkoutBlocked}
              </p>
            )}
            <p className="set-plan__fine">Submissions an agency invites through their open call never count toward the monthly limit, on any plan.</p>
            <p className="set-plan__method">
              <CreditCard size={14} aria-hidden="true" />
              {subscription.stripeCustomerId ? 'Payment method on file' : 'No payment method on file'}
            </p>
            {/*
              No invoices card. The server hardcoded an empty list, so it could only
              ever say "no invoices are available yet" — including to paying members.
              Stripe's customer portal holds the real receipts and is one click away
              behind "Manage billing" above. It belongs with the payment method it
              qualifies, not adrift under the card.
            */}
            {subscription.stripeCustomerId && (
              <p className="set-plan__fine">
                Invoices, receipts, and payment method changes live in the Stripe billing
                portal — open it with Manage billing above.
              </p>
            )}
          </div>
        </>
      )}

      <SubscriptionCheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} onConfirm={confirmCheckout} isLoading={opening} subscription={subscription} />
    </Movement>
  );
}

/* --- VI · Security ------------------------------------------------- */

const DEVICE_ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor };

/** Relative last-active reads better than a date for something updated hourly. */
function formatLastSeen(value) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 2) return 'active now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

function SecurityMovement({ settings, isLoading }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['talent-settings'] });

  const revoke = useMutation({
    mutationFn: talentApi.revokeSession,
    onSuccess: () => { invalidate(); toast.success('Device signed out'); },
    onError: (error) => toast.error(error?.message || 'Unable to sign out that device'),
  });
  const revokeOthers = useMutation({
    mutationFn: talentApi.revokeOtherSessions,
    onSuccess: (result) => {
      invalidate();
      const count = result?.revoked ?? 0;
      toast.success(count ? `Signed out ${count} other ${count === 1 ? 'device' : 'devices'}` : 'No other devices were signed in');
    },
    onError: (error) => toast.error(error?.message || 'Unable to sign out other devices'),
  });

  const accountEmail = settings?.user?.email || profile?.email || '';
  const provider = settings?.user?.authProvider;
  // A Google/Instagram account has no Pholio password, so a Firebase reset email
  // either fails or invents a second credential the talent never asked for.
  const canResetPassword = settings?.user?.canResetPassword !== false;

  const resetPassword = async () => {
    if (!accountEmail) return;
    setSending(true);
    try { await sendPasswordResetEmail(auth, accountEmail); toast.success(`Reset link sent to ${accountEmail}`); }
    catch { toast.error('Unable to send reset link'); }
    finally { setSending(false); }
  };

  const devices = settings?.devices || [];
  const others = devices.filter((device) => !device.isCurrent);

  return (
    <Movement
      id="security"
      title="Sign-in and devices"
      lede="Where your account is currently signed in, and how to cut off anything you don’t recognise."
    >
      <div className="set-card">
        <SignInIdentity email={accountEmail} provider={provider} label="Sign-in method" />
        {canResetPassword ? (
          <Row title="Password" description={accountEmail ? `Send a reset link to ${accountEmail}.` : 'Reset your account password.'} muted>
            <PholioButton type="button" variant="secondary" onClick={resetPassword} disabled={sending || !accountEmail}>
              {sending ? 'Sending…' : 'Send reset link'}
            </PholioButton>
          </Row>
        ) : (
          <Row
            title="Password"
            description={PROVIDERS[provider]
              ? `${PROVIDERS[provider].name} holds this account’s password, so there is nothing for Pholio to reset.`
              : 'This account signs in through a provider, so there’s no Pholio password to reset.'}
            muted
          >
            <span className="set-fixed">Not applicable</span>
          </Row>
        )}
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Signed-in devices</h3>
            <p className="set-card__sub">
              Live sessions only, one entry per device. Signing a device out takes effect immediately.
            </p>
          </div>
          {others.length > 0 && (
            <PholioButton type="button" variant="secondary" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
              {revokeOthers.isPending ? 'Signing out…' : 'Sign out everywhere else'}
            </PholioButton>
          )}
        </div>
        {isLoading ? <SkeletonRows /> : devices.length ? (
          <ul className="set-devices">
            {devices.map((device) => {
              const Icon = DEVICE_ICONS[device.type] || Monitor;
              const lastSeen = formatLastSeen(device.lastSeenAt);
              return (
                <li key={device.id}>
                  <span className="set-devices__icon" aria-hidden="true"><Icon size={17} /></span>
                  <div className="set-devices__body">
                    <strong>{device.label}</strong>
                    <span>
                      {device.isCurrent ? 'This device' : lastSeen ? `Last active ${lastSeen}` : 'Active'}
                      {device.signedInAt && ` · signed in ${formatDate(device.signedInAt)}`}
                    </span>
                  </div>
                  {device.isCurrent ? (
                    <span className="set-fixed">Current</span>
                  ) : (
                    <button
                      type="button"
                      className="set-inline-link set-inline-link--danger"
                      onClick={() => revoke.mutate(device.id)}
                      disabled={revoke.isPending || revokeOthers.isPending}
                    >
                      Sign out
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="set-empty">No signed-in devices to show.</p>
        )}
      </div>
    </Movement>
  );
}

/* --- VII · Privacy & data ------------------------------------------ */

function PrivacyMovement({ settings, isLoading }) {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Setting saved') });
  const cookies = settings?.cookies || {};
  const ai = settings?.ai || {};
  const lastExport = formatDate(settings?.data?.exportRequestedAt);

  const exportData = async () => {
    setExporting(true);
    try {
      const result = await talentApi.requestDataExport();
      downloadJson(`pholio-data-export-${new Date().toISOString().slice(0, 10)}.json`, result?.export || result);
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.success('Data export downloaded');
    } catch (error) { toast.error(error?.message || 'Unable to export data'); }
    finally { setExporting(false); }
  };

  // The shared `.pholio.studio` consent cookie is what actually gates analytics
  // (server-side portfolio tracking reads it, and www honours the same record).
  // This screen used to write only to a server column nothing consumed, with the
  // opposite default, so the toggle and the banner could disagree. Keep the
  // account-level record, but treat the cookie as the effective value and write
  // both so one change lands on every surface.
  const [browserConsent, setBrowserConsent] = useState(() => getConsent());
  useEffect(() => onConsentChange(() => setBrowserConsent(getConsent())), []);

  const analyticsOn = browserConsent
    ? browserConsent.analytics
    : (cookies.analytics ?? false);

  const toggleCookie = (key) => {
    const next = { ...cookies, [key]: key === 'analytics' ? !analyticsOn : !cookies[key] };
    if (key === 'analytics') {
      setConsent({ analytics: next.analytics });
    }
    mutation.mutate({ cookies: next });
  };

  const toggleAiProcessing = (key, currentlyEnabled) => {
    const next = !currentlyEnabled;
    if (next && !ai.canEnable) {
      toast.error('A valid adult date of birth is required before this processing can be enabled.');
      return;
    }
    mutation.mutate({
      [key]: next,
      ...(next && ai.disclosureVersion
        ? { aiConsentDisclosureVersion: ai.disclosureVersion }
        : {}),
    });
  };

  const imageDisclosure = ai.imageProcessingDisclosure
    || 'Allow Pholio to send portfolio images to its image-analysis provider for shot classification and profile insights.';
  const embeddingDisclosure = ai.profileEmbeddingDisclosure
    || 'Allow Pholio to send a limited profile summary to its embedding provider so vetted agency searches can find relevant talent.';
  const imageProcessingDescription = ai.imageProcessingAvailable
    ? `${imageDisclosure} Turning this off prevents future provider calls and clears Pholio’s stored image-analysis results.`
    : `${imageDisclosure} The service is disabled in this environment, so saving permission will not send an image unless it is enabled later.`;
  const embeddingDescription = ai.profileEmbeddingAvailable
    ? `${embeddingDisclosure} Turning this off clears Pholio’s stored search derivatives.`
    : `${embeddingDisclosure} The service is disabled in this environment, so saving permission will not send profile data unless it is enabled later.`;

  return (
    <Movement
      id="privacy"
      title="Cookies and your data"
      lede="Export everything Pholio holds about you at any time. Permanent erasure lives in Account."
    >
      <div className="set-card">
        <Row title="Download your data" description={lastExport ? `Last exported ${lastExport}.` : 'Your profile, media records, applications, and account history as JSON.'}>
          <PholioButton type="button" variant="secondary" onClick={exportData} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Request export'}
          </PholioButton>
        </Row>
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Optional processing</h3>
            <p className="set-card__sub">These permissions are separate from cookies. They are off by default and available only to adults with a valid date of birth.</p>
          </div>
        </div>
        {isLoading ? <SkeletonRows count={2} /> : (
          <>
            <Row title="Image analysis" description={imageProcessingDescription}>
              <Toggle
                label="Allow image analysis"
                checked={ai.imageProcessing ?? false}
                disabled={mutation.isPending || (!ai.canEnable && !(ai.imageProcessing ?? false))}
                onChange={() => toggleAiProcessing('aiProcessingConsent', ai.imageProcessing ?? false)}
              />
            </Row>
            <Row title="Agency search matching" description={embeddingDescription} muted>
              <Toggle
                label="Allow agency search matching"
                checked={ai.profileEmbedding ?? false}
                disabled={mutation.isPending || (!ai.canEnable && !(ai.profileEmbedding ?? false))}
                onChange={() => toggleAiProcessing('embeddingProcessingConsent', ai.profileEmbedding ?? false)}
              />
            </Row>
          </>
        )}
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Cookies</h3>
            <p className="set-card__sub">Essential cookies keep sign-in, security, and payments working. The rest are yours to decide.</p>
          </div>
        </div>
        {isLoading ? <SkeletonRows /> : (
          <>
            <Row title="Essential" description="Authentication, sessions, security, and payments.">
              <span className="set-fixed">Always on</span>
            </Row>
            {/*
              No marketing-cookie toggle. The canonical consent contract
              (`shared/lib/consent.js`) models only `necessary` and `analytics` —
              there is no marketing category to consent to, so offering one was
              granularity over a permission the product doesn't have.
            */}
            <Row title="Analytics" description="Helps improve dashboard quality and reliability. Applies to pholio.studio and app.pholio.studio.">
              <Toggle label="Analytics cookies" checked={analyticsOn} disabled={mutation.isPending} onChange={() => toggleCookie('analytics')} />
            </Row>
            <Row title="Reset choice" description="Clears the stored preference and re-opens the consent banner." muted>
              <PholioButton type="button" variant="secondary" onClick={() => clearConsent()}>
                Reset
              </PholioButton>
            </Row>
          </>
        )}
      </div>
    </Movement>
  );
}

/* --- VIII · Legal & safety ----------------------------------------- */

function LegalMovement() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const minorLocked = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);

  const legalQuery = useQuery({
    queryKey: ['talent-legal-status'],
    queryFn: () => talentApi.getLegalStatus(),
    select: (data) => data?.data ?? data,
  });
  const needsAcceptance = !!legalQuery.data?.needsAcceptance;

  const accept = useMutation({
    mutationFn: () => talentApi.acceptLegalTerms({ terms_accepted: true, privacy_accepted: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['talent-legal-status'] }); toast.success('Agreements acknowledged'); },
    onError: (error) => toast.error(error?.message || 'Unable to record acceptance'),
  });

  return (
    <Movement
      id="legal"
      title="Standing and protection"
      lede="Consent, minor protection, and safety reporting sit apart from preferences so they’re always easy to find."
    >
      <div className="set-card">
        <Row
          title="Terms & Privacy"
          description={needsAcceptance ? 'Updated agreements are waiting for your acknowledgement.' : 'Your acceptance of Pholio’s Terms and Privacy Policy is current.'}
        >
          {needsAcceptance ? (
            <PholioButton type="button" variant="primary" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending ? 'Saving…' : 'Acknowledge'}
            </PholioButton>
          ) : (
            <span className="set-fixed">Current</span>
          )}
        </Row>
        <Row
          title="Minor protection"
          description={minorLocked
            ? 'Public exposure and contact details are locked until a valid date of birth and guardian consent are on file.'
            : 'Public-exposure checks are clear for this profile. Keep date of birth and guardian records current where required.'}
          muted
        >
          <span className="set-fixed">{minorLocked ? 'Restricted' : 'Clear'}</span>
        </Row>
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Report a concern</h3>
            <p className="set-card__sub">Rights, safety, impersonation, or an agency that doesn’t operate the way it should.</p>
          </div>
          <PholioButton type="button" variant="secondary" onClick={() => setReportOpen(true)}>Report</PholioButton>
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </Movement>
  );
}

/* --- IX · Account -------------------------------------------------- */

function AccountMovement({ settings }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deactivate = useMutation({
    mutationFn: talentApi.deactivateAccount,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['talent-settings'] }); queryClient.invalidateQueries({ queryKey: ['auth-user'] }); toast.success('Account paused'); },
    onError: (error) => toast.error(error?.message || 'Unable to pause account'),
  });
  const remove = useMutation({
    mutationFn: talentApi.deleteAccount,
    onSuccess: (result) => {
      purgeApplyDraftStorage();
      if (result?.fullyErased) {
        toast.success('Account deleted');
      } else {
        toast.warning('Your Pholio account was removed. Provider deletion is still pending.');
      }
      window.location.href = result?.redirect || '/login';
    },
    onError: (error) => toast.error(error?.message || 'Unable to delete account'),
  });

  const isPaused = !!settings?.account?.isDeactivated;

  return (
    <Movement
      id="account"
      title="Pause or close"
      lede="Step away without losing your records, or erase your account for good."
    >
      <div className="set-card">
        <Row
          title="Pause visibility"
          description="Hide your public book and agency discovery without deleting anything. Turn it back on whenever you return."
        >
          <PholioButton type="button" variant="secondary" onClick={() => deactivate.mutate()} disabled={deactivate.isPending || isPaused}>
            {isPaused ? 'Paused' : deactivate.isPending ? 'Pausing…' : 'Pause account'}
          </PholioButton>
        </Row>
      </div>

      {/*
        A destructive action reads as destructive. This was a card with a hairline
        tinted 28% red and a quiet mono underline for a button — visually
        indistinguishable from "Pause visibility" directly above it, which is
        reversible. The consequence is now enumerated rather than summarised,
        because "account history" does not tell anyone what they are about to lose.
      */}
      <div className="set-card set-danger">
        <h3 className="set-danger__title">
          <AlertTriangle size={16} aria-hidden="true" />
          Delete account
        </h3>
        <p className="set-danger__lede">
          Deleting removes it all at once, and there is no restore. What goes:
        </p>
        <ul className="set-danger__list">
          <li>Your book, every image in it, and any comp card built from them</li>
          <li>Submissions, drafts, and the history behind each one</li>
          <li>Messages with agencies</li>
          <li>Your profile, your public link, and this sign-in</li>
        </ul>
        <p className="set-danger__fine">
          Anything an agency already downloaded lives outside Pholio and can’t be recalled.
        </p>

        {confirmDelete ? (
          <div className="set-danger__confirm">
            <p>Delete everything and sign out for good?</p>
            <div className="set-danger__actions">
              <button
                type="button"
                className="set-danger__go"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                {remove.isPending ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                type="button"
                className="set-inline-link"
                onClick={() => setConfirmDelete(false)}
                disabled={remove.isPending}
              >
                Keep my account
              </button>
            </div>
          </div>
        ) : (
          <div className="set-danger__actions">
            <button type="button" className="set-danger__go" onClick={() => setConfirmDelete(true)}>
              Delete account
            </button>
          </div>
        )}
      </div>
    </Movement>
  );
}
