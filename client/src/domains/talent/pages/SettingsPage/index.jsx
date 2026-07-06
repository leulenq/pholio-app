import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Archive,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Camera,
  CreditCard,
  Download,
  Eye,
  FileText,
  Scale,
  Lock,
  Mail,
  Monitor,
  Shield,
  SlidersHorizontal,
  Trash2,
  User,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { purgeApplyDraftStorage } from '../ApplyPage/applicationDraftStorage';
import { auth } from '../../../../shared/lib/firebase';
import { isMinorProfile, minorPublicExposureAllowed } from '../../../../shared/utils/talentAge';
import ReportDialog from '../../../../shared/components/ReportDialog';
import { SubscriptionCheckoutModal } from '../../../../shared/components/SubscriptionCheckoutDisclosure';
import CheckoutHandoff from '../../../../shared/components/billing/CheckoutHandoff';
import SubscriptionReturnBanner from '../../../../shared/components/billing/SubscriptionReturnBanner';
import PholioButton, { PholioToggleButton, PholioToggleGroup } from '../../../../shared/components/ui/PholioButton';
import { useBrandedStripeCheckout } from '../../../../shared/hooks/useBrandedStripeCheckout';
import './SettingsPage.css';

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

const SECTIONS = [
  { id: 'identity', numeral: 'I', label: 'Identity', icon: User, summary: 'Sign-in, contact, timezone' },
  { id: 'visibility', numeral: 'II', label: 'Visibility', icon: Eye, summary: 'Portfolio, agency discovery, contact exposure' },
  { id: 'notifications', numeral: 'III', label: 'Notifications', icon: Bell, summary: 'Agency updates and email rhythm' },
  { id: 'subscription', numeral: 'IV', label: 'Studio+', icon: CreditCard, summary: 'Plan, trial, invoices' },
  { id: 'security', numeral: 'V', label: 'Security', icon: Shield, summary: 'Password and signed-in browsers' },
  { id: 'privacy', numeral: 'VI', label: 'Privacy & data', icon: Lock, summary: 'Cookies and data export' },
  { id: 'legal', numeral: 'VII', label: 'Legal & compliance', icon: Scale, summary: 'Consent, minors, safety reporting' },
  { id: 'account', numeral: 'VIII', label: 'Account control', icon: Archive, summary: 'Pause or permanently erase' },
];

const DEFAULT_SECTION = 'identity';

// House spring-physics entrances (stiffness ~55 / damping ~16) with a small
// stagger, and a plain crossfade when the visitor prefers reduced motion.
function stackVariants(reduce) {
  return reduce
    ? { hidden: {}, show: { transition: { staggerChildren: 0 } } }
    : { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.03 } } };
}
function panelVariants(reduce) {
  return reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.24 } } }
    : {
      hidden: { opacity: 0, y: 18 },
      show: { opacity: 1, y: 0, transition: { ...SPRING, when: 'beforeChildren', staggerChildren: 0.05 } },
    };
}
function childVariants(reduce) {
  return reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.24 } } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: SPRING } };
}

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

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw ? [raw] : [];
  }
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

function panelId(title) {
  return `${title.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase()}-title`;
}

function SectionPanel({ kicker, title, intro, children, action }) {
  const reduce = useReducedMotion();
  const id = panelId(title);
  return (
    <motion.section className="talent-settings-panel" aria-labelledby={id} variants={panelVariants(reduce)}>
      <motion.div className="talent-settings-panel__head" variants={childVariants(reduce)}>
        <div className="talent-settings-panel__heading">
          <span className="talent-settings-kicker">{kicker}</span>
          <h2 id={id}>{title}</h2>
          {intro && <p>{intro}</p>}
        </div>
        {action && <div className="talent-settings-panel__action">{action}</div>}
      </motion.div>
      {children}
    </motion.section>
  );
}

function SettingRow({ icon: Icon, title, description, children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="talent-settings-row" variants={childVariants(reduce)}>
      <div className="talent-settings-row__mark" aria-hidden="true">
        <Icon size={16} />
      </div>
      <div className="talent-settings-row__copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="talent-settings-row__control">{children}</div>
    </motion.div>
  );
}

function NativeSwitch({ checked, disabled, label, onChange }) {
  return (
    <label className="talent-settings-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </label>
  );
}

function Skeleton() {
  const reduce = useReducedMotion();
  return (
    <motion.div className="talent-settings-skeleton" aria-label="Loading settings" variants={childVariants(reduce)}>
      <span /><span /><span />
    </motion.div>
  );
}

export default function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const activeSection = SECTIONS.some((item) => item.id === section) ? section : DEFAULT_SECTION;

  useEffect(() => {
    if (section && section !== activeSection) navigate(`/dashboard/talent/settings/${DEFAULT_SECTION}`, { replace: true });
  }, [activeSection, navigate, section]);

  return (
    <div className="talent-settings-page">
      <div className="talent-settings-wrap">
        <motion.header
          className="talent-settings-masthead"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.24 } : SPRING}
        >
          <div className="talent-settings-masthead__copy">
            <h1 className="talent-settings-h1">Settings</h1>
            <div className="talent-settings-sweep" aria-hidden="true" />
            <p className="talent-settings-sub">
              Control who can see your portfolio, how agencies reach you, how submissions travel, and how Pholio handles your account data.
            </p>
          </div>
          <div className="talent-settings-masthead__actions">
            <PholioButton variant="secondary" to="/dashboard/talent/profile">
              Review profile <ArrowUpRight size={16} aria-hidden />
            </PholioButton>
          </div>
        </motion.header>

        <div className="talent-settings-shell">
          <nav className="talent-settings-index" aria-label="Settings sections">
            {SECTIONS.map(({ id, numeral, label }) => (
              <button
                key={id}
                type="button"
                className={`talent-settings-index__item${activeSection === id ? ' is-active' : ''}`}
                onClick={() => navigate(`/dashboard/talent/settings/${id}`)}
                aria-current={activeSection === id ? 'page' : undefined}
              >
                <span className="talent-settings-index__num" aria-hidden="true">{numeral}</span>
                <span className="talent-settings-index__label">{label}</span>
              </button>
            ))}
          </nav>

          <div className="talent-settings-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                className="talent-settings-stack"
                variants={stackVariants(reduce)}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
              >
                {activeSection === 'identity' && <IdentitySection />}
                {activeSection === 'visibility' && <VisibilitySection />}
                {activeSection === 'notifications' && <NotificationsSection />}
                {activeSection === 'subscription' && <SubscriptionSection />}
                {activeSection === 'security' && <SecuritySection />}
                {activeSection === 'privacy' && <PrivacySection />}
                {activeSection === 'legal' && <LegalComplianceSection />}
                {activeSection === 'account' && <AccountControlSection />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentitySection() {
  const reduce = useReducedMotion();
  const { profile, updateProfile, isUpdatingProfile } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', language: 'English', timezone: 'America/New_York' });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!profile || dirty) return;
    setForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      language: parseJsonArray(profile.languages)[0] || 'English',
      timezone: profile.timezone || 'America/New_York',
    });
  }, [dirty, profile]);

  const setField = (key, value) => { setForm((prev) => ({ ...prev, [key]: value })); setDirty(true); };

  const save = async () => {
    try {
      await updateProfile({ ...form, languages: form.language ? [form.language] : [] });
      setDirty(false);
      toast.success('Identity settings saved');
    } catch (error) {
      toast.error(error?.message || 'Unable to save identity settings');
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
    <SectionPanel kicker="Account · Identity" title="Identity and contact" intro="These details support agency submissions, comp cards, and account recovery. Measurements and board details stay in Profile.">
      <motion.div className="talent-settings-identity" variants={childVariants(reduce)}>
        <button type="button" className="talent-settings-avatar" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {profile?.photo_url_primary ? <img src={profile.photo_url_primary} alt="" /> : <Camera size={22} aria-hidden />}
          <span>{uploading ? 'Uploading…' : 'Update primary image'}</span>
        </button>
        <input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={uploadPhoto} />
        <div className="talent-settings-fields two-col">
          <label>First name<input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} autoComplete="given-name" /></label>
          <label>Last name<input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} autoComplete="family-name" /></label>
          <label>Email<input value={profile?.email || ''} disabled type="email" /></label>
          <label>Phone<input value={form.phone} onChange={(e) => setField('phone', e.target.value)} autoComplete="tel" placeholder="+1 (555) 000-0000" /></label>
          <label>Working language<select value={form.language} onChange={(e) => setField('language', e.target.value)}><option>English</option><option>Spanish</option><option>French</option><option>Italian</option><option>German</option><option>Portuguese</option><option>Japanese</option><option>Korean</option></select></label>
          <label>Home timezone<select value={form.timezone} onChange={(e) => setField('timezone', e.target.value)}><option value="America/New_York">Eastern (ET)</option><option value="America/Chicago">Central (CT)</option><option value="America/Denver">Mountain (MT)</option><option value="America/Los_Angeles">Pacific (PT)</option><option value="Europe/London">London</option><option value="Europe/Paris">Paris</option><option value="Asia/Tokyo">Tokyo</option></select></label>
        </div>
      </motion.div>
      <motion.div className="talent-settings-footer" variants={childVariants(reduce)}>
        <PholioButton type="button" variant="primary" disabled={!dirty || isUpdatingProfile} onClick={save}>{isUpdatingProfile ? 'Saving…' : 'Save identity'}</PholioButton>
      </motion.div>
    </SectionPanel>
  );
}

function VisibilitySection() {
  const reduce = useReducedMotion();
  const { profile } = useAuth();
  const { data: settings, isLoading } = useTalentSettings();
  const [blockInput, setBlockInput] = useState('');
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Visibility settings saved') });
  const minorLocked = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);
  const blockedAgencies = settings?.blockedAgencies || [];

  const update = (payload) => mutation.mutate(payload);
  const addBlock = () => {
    const value = blockInput.trim();
    if (!value) return;
    update({ blockedAgencies: [...new Set([...blockedAgencies, value])] });
    setBlockInput('');
  };

  if (isLoading) return <Skeleton />;

  return (
    <>
      {minorLocked && (
        <motion.div className="talent-settings-notice" variants={childVariants(reduce)}>
          Guardian consent and a valid date of birth are required before public exposure or public contact details can be enabled.
        </motion.div>
      )}
      <SectionPanel kicker="Visibility · Portfolio" title="Portfolio visibility" intro="Decide how your public book and agency-discovery profile behave. Digitals and measurements remain sensitive submission material.">
        <SettingRow icon={Eye} title="Public portfolio" description="Allow your portfolio link to be viewed outside your account."><NativeSwitch label="Public portfolio" checked={!!settings?.isPublic} disabled={mutation.isPending || minorLocked} onChange={() => update({ isPublic: !settings?.isPublic })} /></SettingRow>
        <SettingRow icon={SlidersHorizontal} title="Agency discovery" description="Allow vetted agencies to find you in Pholio scout and roster workflows."><NativeSwitch label="Agency discovery" checked={!!settings?.isDiscoverable} disabled={mutation.isPending || minorLocked} onChange={() => update({ isDiscoverable: !settings?.isDiscoverable })} /></SettingRow>
        <SettingRow icon={Mail} title="Show contact details" description="Expose email or phone on eligible public surfaces. Keep off if agencies should contact you only inside Pholio."><NativeSwitch label="Show contact details" checked={!!settings?.showContact} disabled={mutation.isPending || minorLocked} onChange={() => update({ showContact: !settings?.showContact })} /></SettingRow>
      </SectionPanel>
      <SectionPanel kicker="Visibility · Blocks" title="Agency blocks" intro="Prevent specific agencies from seeing your discoverable profile. Existing legal obligations or submitted applications may still remain in records.">
        <motion.div className="talent-settings-block" variants={childVariants(reduce)}>
          <input value={blockInput} onChange={(e) => setBlockInput(e.target.value)} placeholder="Agency name or domain" />
          <PholioButton type="button" variant="secondary" onClick={addBlock} disabled={!blockInput.trim() || mutation.isPending}>Block</PholioButton>
        </motion.div>
        {blockedAgencies.length ? (
          <motion.ul className="talent-settings-block-list" variants={childVariants(reduce)}>
            {blockedAgencies.map((agency) => (
              <li key={agency} className="talent-settings-block-item">
                <span>{agency}</span>
                <PholioButton type="button" variant="tertiary" onClick={() => update({ blockedAgencies: blockedAgencies.filter((item) => item !== agency) })}>Remove</PholioButton>
              </li>
            ))}
          </motion.ul>
        ) : (
          <motion.p className="talent-settings-empty" variants={childVariants(reduce)}>No agency blocks are active.</motion.p>
        )}
      </SectionPanel>
    </>
  );
}

const NOTIFICATION_ROWS = [
  ['applicationUpdates', 'Agency submission updates', 'Received, reviewed, kept on file, meeting, offer, and decline updates.'],
  ['profileViews', 'Agency views', 'Signals when an agency reviews your portfolio or comp card.'],
  ['newMessages', 'Messages', 'Booker or agency communication inside Pholio.'],
  ['marketing', 'Product guidance', 'Occasional Pholio announcements and workflow education.'],
];
const FREQUENCIES = [['immediate', 'Immediate'], ['daily', 'Daily digest'], ['weekly', 'Weekly digest']];
function NotificationsSection() {
  const reduce = useReducedMotion();
  const { data: settings, isLoading } = useTalentSettings();
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Submission preference saved') });
  const notifications = settings?.notifications || {};
  const notificationValue = (key) => notifications[key] ?? (key !== 'marketing');

  if (isLoading) return <Skeleton />;

  const saveNotifications = (next) => mutation.mutate({ notifications: { ...notifications, ...next } });
  return (
    <SectionPanel kicker="Notifications" title="Notification rhythm" intro="Keep agency workflow signals visible without turning settings into a second inbox. Comp card images and layouts stay with Media and the comp-card generator.">
      <motion.div className="talent-settings-choice-line" variants={childVariants(reduce)}>
        <span>Email rhythm</span>
        <PholioToggleGroup role="group" aria-label="Email rhythm">
          {FREQUENCIES.map(([value, label]) => <PholioToggleButton key={value} type="button" active={(notifications.emailFrequency || 'immediate') === value} onClick={() => saveNotifications({ emailFrequency: value })}>{label}</PholioToggleButton>)}
        </PholioToggleGroup>
      </motion.div>
      {NOTIFICATION_ROWS.map(([key, title, desc]) => <SettingRow key={key} icon={Bell} title={title} description={desc}><NativeSwitch label={title} checked={notificationValue(key)} disabled={mutation.isPending} onChange={() => saveNotifications({ [key]: !notificationValue(key) })} /></SettingRow>)}
    </SectionPanel>
  );
}

function SubscriptionSection() {
  const reduce = useReducedMotion();
  const { data: settings, isLoading } = useTalentSettings();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [returnState, setReturnState] = useState(() => searchParams.get('checkout'));
  const [opening, setOpening] = useState(false);
  const { redirectToCheckout } = useBrandedStripeCheckout({ onHandoffStart: () => setHandoffOpen(true) });
  const subscription = settings?.subscription;
  const invoices = settings?.invoices || [];

  useEffect(() => {
    const state = returnState;
    if (!state) return;
    if (state === 'success') {
      toast.success('Studio+ is being activated');
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    }
    setSearchParams({}, { replace: true });
  }, [queryClient, returnState, setSearchParams]);

  if (isLoading || !subscription) return <Skeleton />;

  const openBilling = async () => {
    if (subscription.stripeCustomerId && subscription.status && !['free', 'canceled'].includes(subscription.status)) {
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

  return (
    <>
      <CheckoutHandoff open={handoffOpen} planLabel="Studio+" />
      <SubscriptionReturnBanner state={returnState} onDismiss={() => setReturnState(null)} />
      <SectionPanel kicker="Studio+ · Plan" title="Studio+ plan" intro="Manage the subscription that powers expanded insights, discovery submission volume, and premium presentation." action={<PholioButton type="button" variant="primary" onClick={openBilling} disabled={opening}>{opening || handoffOpen ? 'Opening…' : subscription.isPro ? 'Manage billing' : 'Start Studio+'}</PholioButton>}>
        <motion.div className="talent-settings-plan" variants={childVariants(reduce)}>
          <div className="talent-settings-plan__lede"><strong>{subscription.planName}</strong><span>{subscription.priceLabel || '$9.99'} {subscription.priceUnit || '/month'}</span></div>
          <p>{subscription.renewalDate ? `Next renewal ${formatDate(subscription.renewalDate)}` : subscription.isTrialing ? `Trial ends ${formatDate(subscription.trialEndDate)}` : '14-day trial available. Cancel anytime in Settings.'}</p>
          <p>Submissions invited by an agency through their open call never count toward the monthly limit, on any plan.</p>
          <span className="talent-settings-plan__meta"><CreditCard size={14} aria-hidden />{subscription.stripeCustomerId ? 'Billing profile on file' : 'No payment method on file'}</span>
        </motion.div>
      </SectionPanel>
      <SectionPanel kicker="Studio+ · Invoices" title="Invoices" intro="Receipts are listed here when Stripe returns invoice records for your account.">
        {invoices.length ? invoices.map((invoice) => (
          <SettingRow key={invoice.id} icon={FileText} title={invoice.id} description={invoice.date}>
            <span className="talent-settings-amount">{invoice.amount}</span>
            <PholioButton type="button" variant="tertiary" onClick={() => downloadJson(`pholio-invoice-${invoice.id}.json`, invoice)}>Download</PholioButton>
          </SettingRow>
        )) : <motion.p className="talent-settings-empty" variants={childVariants(reduce)}>No invoices are available yet.</motion.p>}
      </SectionPanel>
      <SubscriptionCheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} onConfirm={confirmCheckout} isLoading={opening} subscription={subscription} />
    </>
  );
}

function SecuritySection() {
  const reduce = useReducedMotion();
  const { profile } = useAuth();
  const { data: settings, isLoading } = useTalentSettings();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const revokeMutation = useMutation({ mutationFn: talentApi.revokeSession, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['talent-settings'] }); toast.success('Browser session ended'); }, onError: (error) => toast.error(error?.message || 'Unable to end session') });

  const resetPassword = async () => {
    if (!profile?.email) return;
    setSending(true);
    try { await sendPasswordResetEmail(auth, profile.email); toast.success(`Password reset sent to ${profile.email}`); } catch { toast.error('Unable to send password reset'); } finally { setSending(false); }
  };

  return (
    <>
      <SectionPanel kicker="Security · Sign-in" title="Sign-in security" intro="Sensitive account changes use your Firebase sign-in identity.">
        <SettingRow icon={Mail} title="Sign-in email" description={profile?.email || 'No email on file'}><PholioButton type="button" variant="secondary" onClick={resetPassword} disabled={sending}>{sending ? 'Sending…' : 'Send password reset'}</PholioButton></SettingRow>
      </SectionPanel>
      <SectionPanel kicker="Security · Browsers" title="Signed-in browsers" intro="End browser sessions you no longer recognize. The current browser cannot be revoked from here.">
        {isLoading && <Skeleton />}
        {!isLoading && !settings?.sessions?.length && <motion.p className="talent-settings-empty" variants={childVariants(reduce)}>No active browser sessions found.</motion.p>}
        {!isLoading && settings?.sessions?.map((session) => (
          <motion.div className="talent-settings-session" key={session.id} variants={childVariants(reduce)}>
            <Monitor size={16} aria-hidden />
            <div className="talent-settings-session__copy">
              <strong>{session.device}</strong>
              <span>{session.location || 'Location unavailable'} · {session.expiresAt ? `Expires ${formatDate(session.expiresAt)}` : 'Session active'}</span>
            </div>
            <em>{session.isCurrent ? 'Current browser' : session.active ? 'Active' : 'Expired'}</em>
            {!session.isCurrent && <PholioButton type="button" variant="tertiary" onClick={() => revokeMutation.mutate(session.id)} disabled={revokeMutation.isPending}>End</PholioButton>}
          </motion.div>
        ))}
      </SectionPanel>
    </>
  );
}

function PrivacySection() {
  const { data: settings, isLoading } = useTalentSettings();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const mutation = useSettingsMutation({ onSuccess: () => toast.success('Privacy preference saved') });
  const cookies = settings?.cookies || {};

  const exportData = async () => {
    setExporting(true);
    try {
      const result = await talentApi.requestDataExport();
      downloadJson(`pholio-data-export-${new Date().toISOString().slice(0, 10)}.json`, result?.export || result);
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.success('Data export downloaded');
    } catch (error) { toast.error(error?.message || 'Unable to export data'); } finally { setExporting(false); }
  };

  const toggleCookie = (key) => mutation.mutate({ cookies: { ...cookies, [key]: !cookies[key] } });

  if (isLoading) return <Skeleton />;

  return (
    <>
      <SectionPanel kicker="Privacy · Data" title="Data rights" intro="Export your Pholio profile, media records, applications, and account history. Permanent erasure lives under Account control.">
        <SettingRow icon={Download} title="Download your data" description={`Last requested: ${formatDate(settings?.data?.exportRequestedAt)}`}><PholioButton type="button" variant="secondary" onClick={exportData} disabled={exporting}>{exporting ? 'Preparing…' : 'Request export'}</PholioButton></SettingRow>
      </SectionPanel>
      <SectionPanel kicker="Privacy · Cookies" title="Cookie choices" intro="Essential cookies keep sign-in and security working. Optional cookies support analytics and product communication.">
        <SettingRow icon={Lock} title="Essential" description="Required for authentication, sessions, security, and payments."><span className="talent-settings-fixed">Always on</span></SettingRow>
        <SettingRow icon={SlidersHorizontal} title="Analytics" description="Helps improve dashboard quality and reliability."><NativeSwitch label="Analytics cookies" checked={cookies.analytics ?? true} disabled={mutation.isPending} onChange={() => toggleCookie('analytics')} /></SettingRow>
        <SettingRow icon={Bell} title="Marketing" description="Allows non-essential product announcements and promotions."><NativeSwitch label="Marketing cookies" checked={cookies.marketing ?? false} disabled={mutation.isPending} onChange={() => toggleCookie('marketing')} /></SettingRow>
      </SectionPanel>
    </>
  );
}


function LegalComplianceSection() {
  const { profile } = useAuth();
  const { data: settings } = useTalentSettings();
  const [reportOpen, setReportOpen] = useState(false);
  const minorLocked = isMinorProfile(profile) && !minorPublicExposureAllowed(profile);

  return (
    <>
      <SectionPanel kicker="Legal · Consent" title="Consent and safety" intro="Legal controls stay separate from privacy preferences so consent, minor protection, and safety reporting are easy to find.">
        <SettingRow icon={Scale} title="Minor exposure controls" description={minorLocked ? 'Public portfolio and contact exposure are locked until guardian consent and a valid date of birth are in place.' : 'Public exposure checks are clear for this profile. Keep date of birth and guardian records current where required.'}><span className="talent-settings-fixed">{minorLocked ? 'Restricted' : 'Current'}</span></SettingRow>
        <SettingRow icon={FileText} title="Terms and privacy" description="Review legal agreements and report rights, safety, impersonation, or agency-scam concerns."><PholioButton type="button" variant="tertiary" onClick={() => setReportOpen(true)}>Report concern</PholioButton></SettingRow>
      </SectionPanel>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile?.user_id || settings?.user?.id || profile?.id || 'talent-settings'} targetLabel="Pholio settings" />
    </>
  );
}

function AccountControlSection() {
  const { data: settings } = useTalentSettings();
  const queryClient = useQueryClient();
  const deactivateMutation = useMutation({ mutationFn: talentApi.deactivateAccount, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['talent-settings'] }); queryClient.invalidateQueries({ queryKey: ['auth-user'] }); toast.success('Account paused'); }, onError: (error) => toast.error(error?.message || 'Unable to pause account') });
  const deleteMutation = useMutation({ mutationFn: talentApi.deleteAccount, onSuccess: (result) => { purgeApplyDraftStorage(); toast.success('Account deleted'); window.location.href = result?.redirect || '/login'; }, onError: (error) => toast.error(error?.message || 'Unable to delete account') });

  const pause = () => { if (window.confirm('Pause your Pholio account? Your public portfolio and agency discovery profile will be hidden.')) deactivateMutation.mutate(); };
  const erase = () => { if (window.confirm('Permanently delete your Pholio account, profile, images, applications, and account history? This cannot be undone.')) deleteMutation.mutate(); };

  return (
    <SectionPanel kicker="Account · Control" title="Account control" intro="Use these controls only when you need to step away from Pholio or permanently erase your account.">
      <SettingRow icon={CalendarDays} title="Pause visibility" description="Hide your public portfolio and agency discovery profile without deleting your records."><PholioButton type="button" variant="secondary" onClick={pause} disabled={deactivateMutation.isPending || settings?.account?.isDeactivated}>{settings?.account?.isDeactivated ? 'Paused' : deactivateMutation.isPending ? 'Pausing…' : 'Pause account'}</PholioButton></SettingRow>
      <SettingRow icon={Trash2} title="Permanently delete account" description="Erase your profile, images, applications, draft submissions, and Pholio account records where deletion is permitted."><PholioButton type="button" variant="destructive" onClick={erase} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting…' : 'Delete account'}</PholioButton></SettingRow>
    </SectionPanel>
  );
}
