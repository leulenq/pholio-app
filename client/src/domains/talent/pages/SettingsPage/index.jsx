import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera, Mail, Monitor, Check, CreditCard,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { auth } from '../../../../shared/lib/firebase';
import {
  isMinorProfile,
  minorPublicExposureAllowed,
} from '../../../../shared/utils/talentAge';
import './SettingsPage.css';

const EASING = [0.22, 1, 0.36, 1];

const SECTIONS = [
  { id: 'account',       label: 'Account' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy',       label: 'Privacy' },
  { id: 'display',       label: 'Display' },
  { id: 'subscription',  label: 'Subscription' },
  { id: 'security',      label: 'Security' },
  { id: 'data',          label: 'Data' },
  { id: 'danger',        label: 'Danger Zone' },
];

function useTalentSettings() {
  return useQuery({
    queryKey: ['talent-settings'],
    queryFn: talentApi.getSettings,
    select: (d) => d?.settings ?? d,
  });
}

function useSettingsMutation(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => talentApi.updateSettings(data),
    onSuccess: (response) => {
      const settings = response?.settings ?? response;
      if (settings) queryClient.setQueryData(['talent-settings'], { success: true, settings });
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      options.onSuccess?.(settings);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to save settings');
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

function formatDisplayDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
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

function CardHeader({ title }) {
  return (
    <div className="ts-card-hd">
      <div className="ts-card-hd-row">
        <div className="ts-card-hd-main">
          <h2 className="ts-card-title">{title}</h2>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { section } = useParams();
  const activeSection = section || 'account';
  const navigate = useNavigate();

  return (
    <div className="ts-page">
      <motion.div
        className="ts-wrap"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASING }}
      >
        <header className="ts-page-header">
          <div className="ts-page-header-main">
            <h1 className="ts-page-title">Settings</h1>
            <div className="ts-page-sweep" aria-hidden="true" />
          </div>
        </header>

        <div className="ts-layout">
          <aside className="ts-sidebar">
            <nav className="ts-nav" aria-label="Settings sections">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`ts-nav-item${activeSection === s.id ? ' active' : ''}`}
                  onClick={() => { if (activeSection !== s.id) navigate(`/dashboard/talent/settings/${s.id}`); }}
                  aria-current={activeSection === s.id ? 'page' : undefined}
                >
                  {activeSection === s.id && (
                    <motion.div layoutId="ts-nav-bar" className="ts-nav-bar" />
                  )}
                  <span className="ts-nav-label">{s.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="ts-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.28, ease: EASING }}
              >
                {activeSection === 'account'       && <AccountSection />}
                {activeSection === 'notifications' && <NotificationsSection />}
                {activeSection === 'privacy'       && <PrivacySection />}
                {activeSection === 'display'       && <DisplaySection />}
                {activeSection === 'subscription'  && <SubscriptionSection />}
                {activeSection === 'security'      && <SecuritySection />}
                {activeSection === 'data'          && <DataSection />}
                {activeSection === 'danger'        && <DangerZoneSection />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </motion.div>
    </div>
  );
}

function AccountSection() {
  const { profile, updateProfile, isUpdatingProfile } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const profileLanguage = parseJsonArray(profile?.languages)[0] || 'English';
  const [form, setForm] = useState(() => ({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    phone:      profile?.phone      || '',
    language:   profileLanguage,
    timezone:   profile?.timezone   || 'America/New_York',
  }));
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    if (!profile || isChanged) return;
    setForm({
      first_name: profile.first_name || '',
      last_name:  profile.last_name  || '',
      phone:      profile.phone      || '',
      language:   parseJsonArray(profile.languages)[0] || 'English',
      timezone:   profile.timezone   || 'America/New_York',
    });
  }, [profile, isChanged]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setIsChanged(true);
  };

  const handleCancel = () => {
    setForm({
      first_name: profile?.first_name || '',
      last_name:  profile?.last_name  || '',
      phone:      profile?.phone      || '',
      language:   parseJsonArray(profile?.languages)[0] || 'English',
      timezone:   profile?.timezone   || 'America/New_York',
    });
    setIsChanged(false);
  };

  const handleSave = async () => {
    try {
      await updateProfile({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        timezone: form.timezone,
        languages: form.language ? [form.language] : [],
      });
      toast.success('Account updated');
      setIsChanged(false);
    } catch {
      toast.error('Failed to save changes');
    }
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('media', file);
    formData.append('image_type', 'portfolio');
    formData.append('shot_type', 'headshot');
    formData.append('style_type', 'studio');
    formData.append('status', 'active');

    setIsUploadingPhoto(true);
    try {
      const result = await talentApi.uploadMedia(formData);
      const uploaded = result?.images?.[0];
      if (uploaded?.id) {
        await updateProfile({ primary_photo_id: uploaded.id });
      }
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error(error?.message || 'Failed to upload profile photo');
    } finally {
      setIsUploadingPhoto(false);
      event.target.value = '';
    }
  };

  return (
    <div className="ts-card">
      <CardHeader title="Account" />
      <div className="ts-card-inner">
        <div className="ts-avatar-section">
          <div
            className="ts-avatar"
            role="button"
            tabIndex={0}
            aria-label="Upload profile photo"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {profile?.photo_url_primary ? (
              <img className="ts-avatar-img" src={profile.photo_url_primary} alt="" />
            ) : (
              <Camera size={22} className="ts-avatar-icon" aria-hidden="true" />
            )}
            <div className="ts-avatar-overlay" aria-hidden="true">
              <Camera size={16} color="white" />
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handlePhotoUpload}
            disabled={isUploadingPhoto}
          />
          <div>
            <div className="ts-label">Photo</div>
            <div className="ts-avatar-action-text">
              {isUploadingPhoto ? 'Uploading…' : 'Upload headshot'}
            </div>
          </div>
        </div>

        <div className="ts-form-body">
          <div className="ts-field-row">
            <div className="ts-field">
              <label className="ts-label" htmlFor="ts-first-name">First Name</label>
              <input
                id="ts-first-name"
                className="ts-input"
                name="first_name"
                autoComplete="given-name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="e.g. Mia"
              />
            </div>
            <div className="ts-field">
              <label className="ts-label" htmlFor="ts-last-name">Last Name</label>
              <input
                id="ts-last-name"
                className="ts-input"
                name="last_name"
                autoComplete="family-name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="e.g. Voss"
              />
            </div>
          </div>

          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-email">Email Address</label>
            <input
              id="ts-email"
              className="ts-input"
              type="email"
              autoComplete="email"
              value={profile?.email || ''}
              disabled
            />
            <span className="ts-input-help">
              Managed by Firebase authentication — contact support to update.
            </span>
          </div>

          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-phone">Phone Number</label>
            <input
              id="ts-phone"
              className="ts-input"
              type="tel"
              name="phone"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div className="ts-field-row">
            <div className="ts-field">
              <label className="ts-label" htmlFor="ts-language">Language</label>
              <select
                id="ts-language"
                className="ts-select"
                name="language"
                value={form.language}
                onChange={handleChange}
              >
                <option value="English">English</option>
                <option value="Spanish">Español</option>
                <option value="French">Français</option>
                <option value="German">Deutsch</option>
                <option value="Italian">Italiano</option>
                <option value="Portuguese">Português</option>
                <option value="Japanese">日本語</option>
                <option value="Chinese (Simplified)">中文</option>
                <option value="Korean">한국어</option>
              </select>
            </div>
            <div className="ts-field">
              <label className="ts-label" htmlFor="ts-timezone">Timezone</label>
              <select
                id="ts-timezone"
                className="ts-select"
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="America/Anchorage">Alaska (AKT)</option>
                <option value="Pacific/Honolulu">Hawaii (HT)</option>
                <option value="Europe/London">London (GMT/BST)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Europe/Berlin">Berlin (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Asia/Shanghai">Shanghai (CST)</option>
                <option value="Asia/Seoul">Seoul (KST)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="ts-card-footer">
        {isChanged && (
          <button
            type="button"
            className="ts-btn ts-btn-secondary"
            onClick={handleCancel}
            disabled={isUpdatingProfile}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="ts-btn ts-btn-primary"
          onClick={handleSave}
          disabled={!isChanged || isUpdatingProfile}
        >
          {isUpdatingProfile ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

const EMAIL_TOGGLES = [
  { key: 'emailNotifications', label: 'Account Email',       desc: 'Account updates' },
  { key: 'profileViews',       label: 'Profile Views',       desc: 'Agency views' },
  { key: 'applicationUpdates', label: 'Applications',        desc: 'Status changes' },
  { key: 'marketing',          label: 'Product Updates',     desc: 'Announcements and tips' },
];

const INAPP_TOGGLES = [
  { key: 'inAppApplications', label: 'Applications', desc: 'Dashboard alerts' },
  { key: 'newMessages',       label: 'Messages',     desc: 'Agency messages' },
];

const FREQ_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'daily',     label: 'Daily digest' },
  { value: 'weekly',    label: 'Weekly digest' },
];

function NotificationsSection() {
  const { data: settings, isLoading } = useTalentSettings();
  const notifications = settings?.notifications || {};
  const prefs = {
    emailNotifications: notifications.emailNotifications ?? true,
    profileViews:       notifications.profileViews       ?? true,
    applicationUpdates: notifications.applicationUpdates ?? true,
    marketing:          notifications.marketing          ?? false,
    inAppApplications:  notifications.inAppApplications  ?? true,
    newMessages:        notifications.newMessages        ?? true,
  };
  const emailFrequency = notifications.emailFrequency || 'immediate';
  const mutation = useSettingsMutation({
    onSuccess: () => toast.success('Preference saved'),
  });

  const handleToggle = (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    mutation.mutate({ notifications: { ...next, emailFrequency } });
  };

  const handleFrequency = (value) => {
    mutation.mutate({ notifications: { ...prefs, emailFrequency: value } });
  };

  const renderRow = ({ key, label, desc }) => (
    <div key={key} className="ts-toggle-row">
      <div className="ts-toggle-info">
        <span className="ts-toggle-label">{label}</span>
        <span className="ts-toggle-desc">{desc}</span>
      </div>
      <label className="ts-switch">
        <input
          type="checkbox"
          checked={prefs[key]}
          onChange={() => handleToggle(key)}
          disabled={mutation.isPending}
        />
        <span className="ts-slider" />
        <span className="sr-only">{label}</span>
      </label>
    </div>
  );

  if (isLoading) return <div className="ts-loading"><span>Loading…</span></div>;

  return (
    <div className="ts-card">
      <CardHeader title="Notifications" />
      <div className="ts-toggle-list">
        <div className="ts-notif-freq">
          <div className="ts-toggle-info">
            <span className="ts-toggle-label">Email Frequency</span>
            <span className="ts-toggle-desc">Notification timing</span>
          </div>
          <div className="ts-freq-options" role="group" aria-label="Email frequency">
            {FREQ_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`ts-freq-btn${emailFrequency === opt.value ? ' active' : ''}`}
                onClick={() => handleFrequency(opt.value)}
                aria-pressed={emailFrequency === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <span className="ts-toggle-group-label">Email</span>
        {EMAIL_TOGGLES.map(renderRow)}
        <span className="ts-toggle-group-label">In App</span>
        {INAPP_TOGGLES.map(renderRow)}
      </div>
    </div>
  );
}

function PrivacySection() {
  const { data: settings, isLoading } = useTalentSettings();

  if (isLoading || !settings) {
    return <div className="ts-loading"><span>Loading…</span></div>;
  }

  return <PrivacySectionForm initialSettings={settings} />;
}

function PrivacySectionForm({ initialSettings }) {
  const { profile } = useAuth();
  const minorBlocked =
    isMinorProfile(profile) && !minorPublicExposureAllowed(profile);
  const [blockedAgencies, setBlockedAgencies] = useState(initialSettings.blockedAgencies || []);
  const [blockInput, setBlockInput] = useState('');
  const [form, setForm] = useState(() => ({
    slug:           initialSettings.slug          || '',
    isPublic:       initialSettings.isPublic      ?? true,
    isDiscoverable: initialSettings.isDiscoverable ?? false,
    showContact:    initialSettings.showContact    ?? true,
  }));
  const [isChanged, setIsChanged] = useState(false);
  const mutation = useSettingsMutation();

  const addBlockedAgency = () => {
    const name = blockInput.trim();
    if (!name || blockedAgencies.includes(name)) return;
    const next = [...blockedAgencies, name];
    setBlockedAgencies(next);
    setBlockInput('');
    mutation.mutate({ blockedAgencies: next }, {
      onSuccess: () => toast.success(`${name} blocked`),
    });
  };

  const removeBlockedAgency = (name) => {
    const next = blockedAgencies.filter(a => a !== name);
    setBlockedAgencies(next);
    mutation.mutate({ blockedAgencies: next }, {
      onSuccess: () => toast.success(`${name} unblocked`),
    });
  };

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setIsChanged(true);
  };

  const slugError = form.slug && !/^[a-z0-9-]{2,50}$/.test(form.slug)
    ? 'Slug must be 2–50 lowercase letters, numbers, or hyphens'
    : null;

  const handleSave = () => {
    if (slugError) { toast.error(slugError); return; }
    mutation.mutate({
      slug: form.slug,
      isPublic: minorBlocked ? false : form.isPublic,
      isDiscoverable: form.isDiscoverable,
      showContact: minorBlocked ? false : form.showContact,
      blockedAgencies,
    }, {
      onSuccess: () => {
        toast.success('Privacy settings saved');
        setIsChanged(false);
      },
    });
  };

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader title="Privacy" />

        <div className="ts-card-inner ts-form-body">
          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-slug">Portfolio Slug</label>
            <div className="ts-input-prefix-wrap">
              <span className="ts-input-prefix">pholio.studio/p/</span>
              <input
                id="ts-slug"
                className="ts-input"
                value={form.slug}
                onChange={e => set('slug', e.target.value.toLowerCase())}
                placeholder="your-name"
                maxLength={50}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {slugError
              ? <span className="ts-input-help ts-input-help--error">{slugError}</span>
              : <span className="ts-input-help">Your public portfolio link.</span>
            }
          </div>

          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-visibility">Profile Visibility</label>
            <select
              id="ts-visibility"
              className="ts-select"
              value={(minorBlocked ? false : form.isPublic) ? 'public' : 'private'}
              onChange={e => set('isPublic', e.target.value === 'public')}
              disabled={minorBlocked}
            >
              <option value="public">Public — anyone can view</option>
              <option value="private">Private — hidden from search</option>
            </select>
            {minorBlocked ? (
              <span className="ts-input-help">
                Guardian consent is required before a minor profile can be made public.
              </span>
            ) : null}
          </div>

          <div className="ts-toggle-row ts-toggle-row--inline">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Search Indexing</span>
              <span className="ts-toggle-desc">Allow search engines</span>
            </div>
            <label className="ts-switch">
              <input
                type="checkbox"
                checked={form.isDiscoverable}
                onChange={() => set('isDiscoverable', !form.isDiscoverable)}
              />
              <span className="ts-slider" />
              <span className="sr-only">Allow search indexing</span>
            </label>
          </div>

          <div className="ts-toggle-row ts-toggle-row--inline">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Contact Info</span>
              <span className="ts-toggle-desc">Show email and phone</span>
            </div>
            <label className="ts-switch">
              <input
                type="checkbox"
                checked={minorBlocked ? false : form.showContact}
                disabled={minorBlocked}
                onChange={() => {
                  if (!minorBlocked) set('showContact', !form.showContact);
                }}
              />
              <span className="ts-slider" />
              <span className="sr-only">Show contact information</span>
            </label>
          </div>
        </div>

        <div className="ts-card-footer">
          <button
            type="button"
            className="ts-btn ts-btn-primary"
            onClick={handleSave}
            disabled={!isChanged || mutation.isPending || Boolean(slugError)}
          >
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Agency blocklist */}
      <div className="ts-card">
        <CardHeader title="Agency Blocklist" />
        <div className="ts-card-inner ts-form-body">
          <p className="ts-toggle-desc" style={{ margin: 0 }}>
            Blocked agencies cannot view your profile.
          </p>
          {blockedAgencies.length > 0 && (
            <div className="ts-blocklist">
              {blockedAgencies.map(name => (
                <div key={name} className="ts-blocklist-row">
                  <span className="ts-blocklist-name">{name}</span>
                  <button
                    type="button"
                    className="ts-btn ts-btn-ghost"
                    style={{ padding: '4px 0', fontSize: '12px' }}
                    onClick={() => removeBlockedAgency(name)}
                    disabled={mutation.isPending}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
          {blockedAgencies.length === 0 && (
            <span className="ts-blocklist-empty">No agencies blocked</span>
          )}
          <div className="ts-blocklist-add">
            <input
              className="ts-input"
              placeholder="Agency name…"
              value={blockInput}
              onChange={e => setBlockInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addBlockedAgency(); }}
              aria-label="Agency name to block"
            />
            <button
              type="button"
              className="ts-btn ts-btn-secondary"
              onClick={addBlockedAgency}
              disabled={!blockInput.trim() || mutation.isPending}
            >
              Block
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscriptionSection() {
  const { data: settings, isLoading } = useTalentSettings();
  const [isOpeningBilling, setIsOpeningBilling] = useState(false);
  const subscription = settings?.subscription;
  const invoices = settings?.invoices || [];

  const openBilling = async () => {
    if (subscription?.isPro || subscription?.stripeCustomerId) {
      window.location.href = '/stripe/customer-portal';
      return;
    }

    setIsOpeningBilling(true);
    try {
      const session = await talentApi.createCheckoutSession();
      if (session?.url) {
        window.location.href = session.url;
      } else {
        window.location.href = '/pro/upgrade';
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to open billing');
      setIsOpeningBilling(false);
    }
  };

  if (isLoading || !subscription) {
    return <div className="ts-loading"><span>Loading…</span></div>;
  }

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <div className="ts-plan-card">
          <div className="ts-plan-left">
            <span className="ts-plan-name">{subscription.planName}</span>
            <div className="ts-plan-price">
              <span className="ts-plan-price-num">{subscription.priceLabel}</span>
              <span className="ts-plan-price-unit">{subscription.priceUnit}</span>
            </div>
            <span className="ts-plan-renewal">
              {subscription.renewalDate
                ? `Next renewal: ${formatDisplayDate(subscription.renewalDate)}`
                : subscription.isPro
                  ? 'Billing is managed through Stripe'
                  : 'Upgrade to unlock Studio+ features'}
            </span>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              style={{ marginTop: '16px', padding: '6px 14px', fontSize: '12px' }}
              onClick={openBilling}
              disabled={isOpeningBilling}
            >
              {isOpeningBilling ? 'Opening…' : subscription.isPro ? 'Manage Plan' : 'Upgrade Plan'}
            </button>
          </div>
          <div className="ts-plan-right">
            <div className="ts-payment-method">
              <CreditCard size={15} aria-hidden="true" />
              <span className="ts-payment-label">
                {subscription.stripeCustomerId ? 'Stripe billing' : 'No payment method'}
              </span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={openBilling}
              disabled={isOpeningBilling}
            >
              Update Payment
            </button>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader title="Invoices" />
        {invoices.length === 0 && (
          <div className="ts-card-inner">
            <span className="ts-blocklist-empty">No invoices available yet</span>
          </div>
        )}
        {invoices.map(inv => (
          <div key={inv.id} className="ts-invoice-row">
            <span className="ts-invoice-id">{inv.id}</span>
            <span className="ts-invoice-date">{inv.date}</span>
            <span className="ts-invoice-amount">{inv.amount}</span>
            <span className="ts-invoice-status">
              <Check size={10} aria-hidden="true" /> Paid
            </span>
            <button
              type="button"
              className="ts-invoice-download"
              onClick={() => downloadJson(`pholio-invoice-${inv.id}.json`, inv)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecuritySection() {
  const { profile } = useAuth();
  const { data: settings, isLoading } = useTalentSettings();
  const queryClient = useQueryClient();
  const [isSendingReset, setIsSendingReset] = useState(false);
  const revokeMutation = useMutation({
    mutationFn: talentApi.revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.success('Session revoked');
    },
    onError: (error) => toast.error(error?.message || 'Failed to revoke session'),
  });

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      toast.success(`Password reset email sent to ${profile.email}`);
    } catch {
      toast.error('Failed to send reset email');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader title="Security" />
        <div className="ts-card-inner ts-form-body">
          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-sec-email">Email Address</label>
            <div className="ts-input-icon-wrap">
              <Mail size={14} className="ts-input-icon" aria-hidden="true" />
              <input
                id="ts-sec-email"
                className="ts-input ts-input--icon"
                type="email"
                value={profile?.email || ''}
                disabled
              />
            </div>
            <span className="ts-input-help">Primary sign-in email.</span>
          </div>

          <div className="ts-credential-row">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Password</span>
              <span className="ts-toggle-desc">Send a reset link</span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-secondary"
              onClick={handlePasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? 'Sending…' : 'Update Password'}
            </button>
          </div>

        </div>
      </div>

      <div className="ts-card">
        <CardHeader title="Sessions" />
        {isLoading && <div className="ts-loading"><span>Loading…</span></div>}
        {!isLoading && (!settings?.sessions || settings.sessions.length === 0) && (
          <div className="ts-card-inner">
            <span className="ts-blocklist-empty">No active browser sessions found</span>
          </div>
        )}
        {!isLoading && settings?.sessions?.map((s) => (
          <div key={s.id} className="ts-session-row">
            <div className="ts-session-icon" aria-hidden="true">
              <Monitor size={14} />
            </div>
            <div className="ts-session-info">
              <span className="ts-session-device">{s.device}</span>
              <span className="ts-session-location">{s.location}</span>
            </div>
            <span className="ts-session-time">
              {s.expiresAt ? `Expires ${formatDisplayDate(s.expiresAt)}` : 'Session'}
            </span>
            <span className={`ts-badge ${s.active ? 'ts-badge--active' : 'ts-badge--expired'}`}>
              {s.active ? 'Active' : 'Expired'}
            </span>
            {!s.isCurrent && (
              <button
                type="button"
                className="ts-invoice-download"
                onClick={() => revokeMutation.mutate(s.id)}
                disabled={revokeMutation.isPending}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const LAYOUT_OPTIONS = [
  { value: 'editorial', label: 'Editorial', desc: 'Full-bleed hero image' },
  { value: 'classic',   label: 'Classic',   desc: '1 large + 3 small' },
  { value: 'minimal',   label: 'Minimal',   desc: 'Text-forward grid' },
];

function DisplaySection() {
  const { data: settings, isLoading } = useTalentSettings();
  const prefs = {
    watermark:  settings?.display?.watermark  ?? false,
    cardLayout: settings?.display?.cardLayout ?? 'editorial',
    coverImage: settings?.display?.coverImage ?? 'first',
  };
  const mutation = useSettingsMutation({
    onSuccess: () => toast.success('Display preference saved'),
  });

  const set = (key, value) => {
    const next = { ...prefs, [key]: value };
    mutation.mutate({ display: next });
  };

  if (isLoading) return <div className="ts-loading"><span>Loading…</span></div>;

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader title="Display" />
        <div className="ts-toggle-list">
          <div className="ts-toggle-row">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Watermark</span>
              <span className="ts-toggle-desc">Add Pholio badge</span>
            </div>
            <label className="ts-switch">
              <input
                type="checkbox"
                checked={prefs.watermark}
                onChange={() => set('watermark', !prefs.watermark)}
                disabled={mutation.isPending}
              />
              <span className="ts-slider" />
              <span className="sr-only">Pholio watermark</span>
            </label>
          </div>
        </div>
        <div className="ts-card-inner">
          <div className="ts-field">
            <div className="ts-label">Comp Card Layout</div>
            <div className="ts-display-grid">
              {LAYOUT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ts-display-option${prefs.cardLayout === opt.value ? ' active' : ''}`}
                  onClick={() => set('cardLayout', opt.value)}
                  aria-pressed={prefs.cardLayout === opt.value}
                >
                  <span className="ts-display-option-label">{opt.label}</span>
                  <span className="ts-display-option-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader title="Cover Image" />
        <div className="ts-card-inner">
          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-cover">Default Cover</label>
            <select
              id="ts-cover"
              className="ts-select"
              value={prefs.coverImage}
              onChange={e => set('coverImage', e.target.value)}
            >
              <option value="first">First image in gallery</option>
              <option value="latest">Most recently added</option>
              <option value="featured">Manually pinned image</option>
            </select>
            <span className="ts-input-help">
              Used for your portfolio and comp cards.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataSection() {
  const { data: settings, isLoading } = useTalentSettings();
  const queryClient = useQueryClient();
  const cookies = {
    analytics: settings?.cookies?.analytics ?? true,
    marketing: settings?.cookies?.marketing ?? false,
  };
  const [isExporting, setIsExporting] = useState(false);
  const cookieMutation = useSettingsMutation({
    onSuccess: () => toast.success('Cookie preference saved'),
  });
  const erasureMutation = useMutation({
    mutationFn: talentApi.requestDataErasure,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.info('Erasure request submitted — our team will respond within 30 days');
    },
    onError: (error) => toast.error(error?.message || 'Failed to submit erasure request'),
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await talentApi.requestDataExport();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`pholio-data-export-${stamp}.json`, result?.export || result);
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.success('Data export downloaded');
    } catch (error) {
      toast.error(error?.message || 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCookieToggle = (key) => {
    const next = { ...cookies, [key]: !cookies[key] };
    cookieMutation.mutate({ cookies: next });
  };

  if (isLoading) return <div className="ts-loading"><span>Loading…</span></div>;

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader title="Data" />
        <div className="ts-card-inner ts-form-body">
          <div className="ts-data-row">
            <div className="ts-action-info">
              <span className="ts-action-label">Download Data</span>
              <span className="ts-action-desc">
                Export profile, images, applications, and account history.
              </span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-secondary"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? 'Requesting…' : 'Request Export'}
            </button>
          </div>
          <div className="ts-data-row">
            <div className="ts-action-info">
              <span className="ts-action-label">Erase Data</span>
              <span className="ts-action-desc">
                Request permanent deletion of personal data.
              </span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              onClick={() => erasureMutation.mutate()}
              disabled={erasureMutation.isPending}
            >
              {erasureMutation.isPending ? 'Submitting…' : settings?.data?.erasureRequestedAt ? 'Request Submitted' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader title="Tracking" />
        <div className="ts-toggle-list">
          {[
            { key: 'essential', label: 'Essential',  desc: 'Required for sign-in', locked: true },
            { key: 'analytics', label: 'Analytics',  desc: 'Product improvement' },
            { key: 'marketing', label: 'Marketing',  desc: 'Announcements and promotions' },
          ].map(({ key, label, desc, locked }) => (
            <div key={key} className="ts-toggle-row">
              <div className="ts-toggle-info">
                <span className="ts-toggle-label">{label}</span>
                <span className="ts-toggle-desc">{desc}</span>
              </div>
              <label className="ts-switch" style={locked ? { opacity: 0.38, pointerEvents: 'none' } : {}}>
                <input
                  type="checkbox"
                  checked={locked ? true : cookies[key]}
                  disabled={locked}
                  onChange={() => {
                    if (!locked) handleCookieToggle(key);
                  }}
                />
                <span className="ts-slider" />
                <span className="sr-only">{label} cookies</span>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DangerZoneSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useTalentSettings();
  const deactivateMutation = useMutation({
    mutationFn: talentApi.deactivateAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      toast.success('Account deactivated');
    },
    onError: (error) => toast.error(error?.message || 'Failed to deactivate account'),
  });
  const deleteMutation = useMutation({
    mutationFn: talentApi.deleteAccount,
    onSuccess: (result) => {
      toast.success('Account deleted');
      window.location.href = result?.redirect || '/login';
    },
    onError: (error) => toast.error(error?.message || 'Failed to delete account'),
  });

  const handleDeactivate = () => {
    const confirmed = window.confirm(
      'Deactivate your account? Your public profile will be hidden and agencies will not be able to discover you.',
    );
    if (confirmed) deactivateMutation.mutate();
  };

  const handleDelete = () => {
    const confirmed = window.confirm(
      'Permanently delete your Pholio account and all related data? This cannot be undone.',
    );
    if (confirmed) deleteMutation.mutate();
  };

  return (
    <div className="ts-card ts-card--danger">
      <CardHeader title="Danger Zone" />

      <div className="ts-action-row">
        <div className="ts-action-info">
          <span className="ts-action-label">Deactivate Account</span>
          <span className="ts-action-desc">
            Hide your profile and suspend access.
          </span>
        </div>
        <button
          type="button"
          className="ts-btn ts-btn-danger-ghost"
          onClick={handleDeactivate}
          disabled={deactivateMutation.isPending || settings?.account?.isDeactivated}
        >
          {deactivateMutation.isPending ? 'Deactivating…' : settings?.account?.isDeactivated ? 'Deactivated' : 'Deactivate'}
        </button>
      </div>

      <div className="ts-action-row">
        <div className="ts-action-info">
          <span className="ts-action-label">Delete Account</span>
          <span className="ts-action-desc">
            Permanently delete your account.
          </span>
        </div>
        <button
          type="button"
          className="ts-btn ts-btn-danger"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete Account'}
        </button>
      </div>
    </div>
  );
}
