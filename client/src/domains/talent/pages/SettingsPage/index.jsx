import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera,
  Check,
  Copy,
  CreditCard,
  Link2,
  Loader2,
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
import { useBrandedStripeCheckout } from '../../../../shared/hooks/useBrandedStripeCheckout';
import { identityFormFromProfile } from './identityForm';
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
 * Google's four-colour "G", inline so it survives the CSP and needs no asset
 * pipeline. Reproduced at the official proportions and colours — Google's brand
 * guidelines require the mark be shown unmodified, so it is never recoloured,
 * outlined, or given a currentColor treatment.
 */
function GoogleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

const PROVIDERS = {
  google: { name: 'Google', mark: GoogleMark },
  instagram: { name: 'Instagram', mark: null },
  apple: { name: 'Apple', mark: null },
  facebook: { name: 'Facebook', mark: null },
};

/**
 * Sign-in identity, kept distinct from the editable profile fields around it.
 * This used to be a disabled "Sign-in email" text input, which flattened an
 * OAuth identity you don't own into something that looked like an editable field
 * you'd forgotten the password to.
 */
function SignInIdentity({ email, provider }) {
  const known = provider ? PROVIDERS[provider] : null;
  const Mark = known?.mark;

  if (known) {
    return (
      <div className="set-provider">
        <span className={`set-provider__badge set-provider__badge--${provider}`}>
          {Mark ? <Mark size={20} /> : <span aria-hidden="true">{known.name.charAt(0)}</span>}
        </span>
        <span className="set-provider__body">
          <strong>Signed in with {known.name}</strong>
          <span title={email || undefined}>{email || 'Account email unavailable'}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="set-provider">
      <span className="set-provider__badge set-provider__badge--email">
        <Mail size={18} aria-hidden="true" />
      </span>
      <span className="set-provider__body">
        <strong>Email and password</strong>
        <span title={email || undefined}>{email || 'Account email unavailable'}</span>
      </span>
    </div>
  );
}

/* --- page ---------------------------------------------------------- */

export default function SettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const prefersReduced = useReducedMotion();
  const { data: settings, isLoading } = useTalentSettings();

  const active = MOVEMENT_IDS.includes(section) ? section : 'identity';

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
        return <LegalMovement settings={settings} />;
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
            <Field label="Phone" hint="Used for booking contact on submissions. Never published on your public book.">
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} autoComplete="tel" placeholder="+1 (555) 000-0000" />
            </Field>
            <Field label="Working language">
              <select value={form.language} onChange={(e) => setField('language', e.target.value)}>
                {['English', 'Spanish', 'French', 'Italian', 'German', 'Portuguese', 'Japanese', 'Korean'].map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Home timezone">
              <select value={form.timezone} onChange={(e) => setField('timezone', e.target.value)}>
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="set-card__foot">
          <PholioButton type="button" variant="primary" disabled={!dirty || isUpdatingProfile} onClick={save}>
            {isUpdatingProfile ? 'Saving…' : 'Save identity'}
          </PholioButton>
        </div>
      </div>

      <div className="set-card">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">How you sign in</h3>
            <p className="set-card__sub">
              Your sign-in identity, separate from the contact details above. Managed under Security.
            </p>
          </div>
        </div>
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
  const [blockInput, setBlockInput] = useState('');
  const minorLocked = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);
  const blockedAgencies = settings?.blockedAgencies || [];

  const update = (payload) => mutation.mutate(payload);
  const addBlock = () => {
    const value = blockInput.trim();
    if (!value) return;
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
            <Row title="Agency discovery" description="Let vetted agencies surface you in Pholio scout and roster search." muted>
              <Toggle label="Agency discovery" checked={!!settings?.isDiscoverable} disabled={mutation.isPending || minorLocked} onChange={() => update({ isDiscoverable: !settings?.isDiscoverable })} />
            </Row>
          </>
        )}
      </div>

      {/*
        There was a "Show contact details" toggle here, defaulted on, claiming to
        expose email or phone "on eligible public surfaces". No public surface
        renders talent contact details, so it controlled nothing while implying
        exposure. Stated as a fact instead of offered as a switch.
      */}
      <p className="set-notice set-notice--plain">
        Your email and phone number are never published on your public book or comp card.
        Agencies reach you through Pholio, and you decide what a submission includes.
      </p>

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
          />
          <PholioButton type="button" variant="secondary" onClick={addBlock} disabled={!blockInput.trim() || mutation.isPending}>
            <Plus size={15} aria-hidden="true" /> Block
          </PholioButton>
        </div>
        {blockedAgencies.length ? (
          <ul className="set-blocklist">
            {blockedAgencies.map((agency) => (
              <li key={agency}>
                <span>{agency}</span>
                <button type="button" onClick={() => removeBlock(agency)} disabled={mutation.isPending} aria-label={`Unblock ${agency}`}>
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
      lede="Two categories you can turn down. Everything else here is either time-sensitive or doesn't exist — so it isn't offered as a switch."
    >
      <div className="set-card">
        {isLoading ? <SkeletonRows count={2} /> : (
          <>
            {NOTIFICATION_ROWS.map(([key, title, desc], i) => (
              <Row key={key} title={title} description={desc} muted={i === NOTIFICATION_ROWS.length - 1}>
                <Toggle label={title} checked={value(key)} disabled={mutation.isPending} onChange={() => save({ [key]: !value(key) })} />
              </Row>
            ))}
          </>
        )}
      </div>

      <p className="set-notice set-notice--plain">
        Messages and interview times always reach you. When a booker writes or a meeting
        is scheduled, that notification isn't optional — it's the part of Pholio you
        can't afford to miss.
      </p>
    </Movement>
  );
}

/* --- V · Studio+ --------------------------------------------------- */

function StudioMovement({ settings, isLoading }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [returnState, setReturnState] = useState(() => searchParams.get('checkout'));
  const [opening, setOpening] = useState(false);
  const { redirectToCheckout } = useBrandedStripeCheckout({ onHandoffStart: () => setHandoffOpen(true) });
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
    try { await redirectToCheckout(payload); } catch (error) { toast.error(error?.message || 'Unable to open billing'); setOpening(false); }
  };

  const renewalLine = subscription?.renewalDate
    ? `Renews ${formatDate(subscription.renewalDate)}`
    : subscription?.isTrialing
      ? `Trial ends ${formatDate(subscription.trialEndDate)}`
      : '14-day trial available. Cancel anytime.';

  return (
    <Movement
      id="studio"
      title="Membership"
      lede="The membership behind expanded insight, submission volume, and premium presentation."
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
            <p className="set-plan__renewal">{renewalLine}</p>
            <p className="set-plan__fine">Submissions an agency invites through their open call never count toward the monthly limit, on any plan.</p>
            <p className="set-plan__method">
              <CreditCard size={14} aria-hidden="true" />
              {subscription.stripeCustomerId ? 'Payment method on file' : 'No payment method on file'}
            </p>
          </div>

          {/*
            No invoices card. The server hardcoded an empty list, so it could only
            ever say "no invoices are available yet" — including to paying members.
            Stripe's customer portal holds the real receipts and is one click away
            behind "Manage billing" above.
          */}
          {subscription.stripeCustomerId && (
            <p className="set-notice set-notice--plain">
              Invoices, receipts, and payment method changes live in the Stripe billing
              portal — open it with Manage billing above.
            </p>
          )}
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
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Sign-in method</h3>
            <p className="set-card__sub">
              {provider === 'google' || provider === 'instagram' || provider === 'apple' || provider === 'facebook'
                ? 'Your sign-in is held by your provider. Change the password or security settings with them.'
                : 'Your Pholio password protects this account.'}
            </p>
          </div>
        </div>
        <SignInIdentity email={accountEmail} provider={provider} />
        {canResetPassword ? (
          <Row title="Password" description={accountEmail ? `Send a reset link to ${accountEmail}.` : 'Reset your account password.'} muted>
            <PholioButton type="button" variant="secondary" onClick={resetPassword} disabled={sending || !accountEmail}>
              {sending ? 'Sending…' : 'Send reset link'}
            </PholioButton>
          </Row>
        ) : (
          <Row
            title="Password"
            description="This account signs in through a provider, so there’s no Pholio password to reset."
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
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Cookie preference saved') });
  const cookies = settings?.cookies || {};
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

function LegalMovement({ settings }) {
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
        targetType="user"
        targetId={profile?.user_id || settings?.user?.id || profile?.id || 'talent-settings'}
        targetLabel="Pholio settings"
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
    onSuccess: (result) => { purgeApplyDraftStorage(); toast.success('Account deleted'); window.location.href = result?.redirect || '/login'; },
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

      <div className="set-card set-card--danger">
        <div className="set-card__head">
          <div>
            <h3 className="set-card__title">Delete account</h3>
            <p className="set-card__sub">Permanently erases your profile, images, applications, drafts, and account history where deletion is permitted. This can’t be undone.</p>
          </div>
        </div>
        {confirmDelete ? (
          <div className="set-confirm">
            <p>Delete everything and sign out for good?</p>
            <div className="set-confirm__actions">
              <PholioButton type="button" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                {remove.isPending ? 'Deleting…' : 'Yes, delete my account'}
              </PholioButton>
              <button type="button" className="set-inline-link" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>Keep my account</button>
            </div>
          </div>
        ) : (
          <div className="set-card__foot set-card__foot--start">
            <PholioButton type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>Delete account</PholioButton>
          </div>
        )}
      </div>
    </Movement>
  );
}
