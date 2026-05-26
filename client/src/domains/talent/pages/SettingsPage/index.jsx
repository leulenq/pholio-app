import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera, Mail, Monitor, Check, CreditCard, ExternalLink,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { auth } from '../../../../shared/lib/firebase';
import './SettingsPage.css';

const EASING = [0.22, 1, 0.36, 1];

const SECTIONS = [
  { id: 'account',       label: 'Account',       group: 'IDENTITY',     desc: 'Name, email, locale' },
  { id: 'notifications', label: 'Notifications',  group: 'PREFERENCES',  desc: 'Alerts and digest frequency' },
  { id: 'privacy',       label: 'Privacy',        group: 'PREFERENCES',  desc: 'Visibility, portfolio, blocklist' },
  { id: 'display',       label: 'Display',        group: 'PREFERENCES',  desc: 'Watermark and comp card layout' },
  { id: 'subscription',  label: 'Subscription',   group: 'YOUR PLAN',    desc: 'Plan and billing' },
  { id: 'security',      label: 'Security',       group: 'YOUR PLAN',    desc: 'Password and access' },
  { id: 'data',          label: 'Data & Privacy', group: 'LEGAL',        desc: 'Export, cookies, retention' },
  { id: 'danger',        label: 'Danger Zone',    group: 'LEGAL',        desc: 'Account actions' },
];

const GROUPS = ['IDENTITY', 'PREFERENCES', 'YOUR PLAN', 'LEGAL'];

function CardHeader({ chapter, title, meta }) {
  return (
    <div className="ts-card-hd">
      <div className="ts-card-hd-row">
        <div className="ts-card-hd-main">
          {chapter ? <span className="ts-card-chapter">{chapter}</span> : null}
          <h2 className="ts-card-title">{title}</h2>
        </div>
        {meta ? <span className="ts-card-meta">{meta}</span> : null}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { section } = useParams();
  const activeSection = section || 'account';
  const navigate = useNavigate();
  const activeMeta = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

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
            <span className="ts-page-kicker">Your workspace</span>
            <h1 className="ts-page-title">Settings</h1>
            <div className="ts-page-sweep" aria-hidden="true" />
          </div>
          <div className="ts-page-header-meta">
            <span className="ts-page-meta-label">Viewing</span>
            <span className="ts-page-meta-value">{activeMeta.label}</span>
            <span className="ts-page-meta-desc">{activeMeta.desc}</span>
          </div>
        </header>

        <div className="ts-layout">
          {/* Sidebar */}
          <aside className="ts-sidebar">
            <nav className="ts-nav" aria-label="Settings sections">
              {GROUPS.map(group => (
                <div key={group} className="ts-nav-group">
                  <span className="ts-nav-group-label">{group}</span>
                  {SECTIONS.filter(s => s.group === group).map(s => (
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
                      <span className="ts-nav-dot" aria-hidden="true" />
                      <span className="ts-nav-text">
                        <span className="ts-nav-label">{s.label}</span>
                        <span className="ts-nav-desc">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="ts-support">
              <span className="ts-support-eyebrow">Need Help?</span>
              <p className="ts-support-text">Questions about your account or billing?</p>
              <a href="mailto:support@pholio.studio" className="ts-support-link">
                support@pholio.studio <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </aside>

          {/* Main content */}
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
  const [form, setForm] = useState(() => ({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    phone:      profile?.phone      || '',
    language:   profile?.language   || 'en',
    timezone:   profile?.timezone   || 'America/New_York',
  }));
  const [isChanged, setIsChanged] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setIsChanged(true);
  };

  const handleCancel = () => {
    setForm({
      first_name: profile?.first_name || '',
      last_name:  profile?.last_name  || '',
      phone:      profile?.phone      || '',
      language:   profile?.language   || 'en',
      timezone:   profile?.timezone   || 'America/New_York',
    });
    setIsChanged(false);
  };

  const handleSave = async () => {
    try {
      await updateProfile(form);
      toast.success('Account updated');
      setIsChanged(false);
    } catch {
      toast.error('Failed to save changes');
    }
  };

  return (
    <div className="ts-card">
      <CardHeader chapter="Identity" title="Account" meta="Profile & locale" />
      <div className="ts-card-inner">
        <div className="ts-avatar-section">
          <div
            className="ts-avatar"
            role="button"
            tabIndex={0}
            aria-label="Upload profile photo"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
            onClick={() => toast.info('Photo upload coming soon')}
          >
            <Camera size={22} className="ts-avatar-icon" aria-hidden="true" />
            <div className="ts-avatar-overlay" aria-hidden="true">
              <Camera size={16} color="white" />
            </div>
          </div>
          <div>
            <div className="ts-label">Profile Photo</div>
            <div className="ts-avatar-action-text">Click to upload a headshot</div>
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
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
                <option value="ko">한국어</option>
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
  { key: 'emailNotifications', label: 'Email Notifications',  desc: 'All account-related emails' },
  { key: 'profileViews',       label: 'Profile View Alerts',  desc: 'When an agency views your profile' },
  { key: 'applicationUpdates', label: 'Application Updates',  desc: 'Status changes on your applications' },
  { key: 'marketing',          label: 'Marketing & Tips',     desc: 'Feature announcements and editorial tips' },
];

const INAPP_TOGGLES = [
  { key: 'inAppApplications', label: 'Application Updates', desc: 'In-dashboard application status alerts' },
  { key: 'newMessages',       label: 'New Messages',        desc: 'Direct messages from agencies' },
];

const FREQ_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'daily',     label: 'Daily digest' },
  { value: 'weekly',    label: 'Weekly digest' },
];

function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    profileViews:       true,
    applicationUpdates: true,
    marketing:          false,
    inAppApplications:  true,
    newMessages:        true,
  });
  const [emailFrequency, setEmailFrequency] = useState('immediate');

  const handleToggle = (key) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    toast.success('Preference saved');
  };

  const handleFrequency = (value) => {
    setEmailFrequency(value);
    toast.success('Digest frequency updated');
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
        />
        <span className="ts-slider" />
        <span className="sr-only">{label}</span>
      </label>
    </div>
  );

  return (
    <div className="ts-card">
      <CardHeader chapter="Preferences" title="Notifications" meta="Email & in-app" />
      <div className="ts-toggle-list">
        <div className="ts-notif-freq">
          <div className="ts-toggle-info">
            <span className="ts-toggle-label">Email Delivery</span>
            <span className="ts-toggle-desc">How often to batch email notifications</span>
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
        <span className="ts-toggle-group-label">By Email</span>
        {EMAIL_TOGGLES.map(renderRow)}
        <span className="ts-toggle-group-label">In App</span>
        {INAPP_TOGGLES.map(renderRow)}
      </div>
    </div>
  );
}

function PrivacySection() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['talent-settings'],
    queryFn:  talentApi.getSettings,
    select:   (d) => d?.settings,
  });

  if (isLoading || !settings) {
    return <div className="ts-loading"><span>Loading…</span></div>;
  }

  return <PrivacySectionForm initialSettings={settings} />;
}

function PrivacySectionForm({ initialSettings }) {
  const queryClient = useQueryClient();
  const [blockedAgencies, setBlockedAgencies] = useState([]);
  const [blockInput, setBlockInput] = useState('');
  const [form, setForm] = useState(() => ({
    slug:           initialSettings.slug          || '',
    isPublic:       initialSettings.isPublic      ?? true,
    isDiscoverable: initialSettings.isDiscoverable ?? false,
    showContact:    true,
  }));
  const [isChanged, setIsChanged] = useState(false);

  const addBlockedAgency = () => {
    const name = blockInput.trim();
    if (!name || blockedAgencies.includes(name)) return;
    setBlockedAgencies(prev => [...prev, name]);
    setBlockInput('');
    toast.success(`${name} blocked`);
  };

  const removeBlockedAgency = (name) => {
    setBlockedAgencies(prev => prev.filter(a => a !== name));
    toast.success(`${name} unblocked`);
  };

  const mutation = useMutation({
    mutationFn: (data) => talentApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-settings'] });
      toast.success('Privacy settings saved');
      setIsChanged(false);
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setIsChanged(true);
  };

  const slugError = form.slug && !/^[a-z0-9-]{2,50}$/.test(form.slug)
    ? 'Slug must be 2–50 lowercase letters, numbers, or hyphens'
    : null;

  const handleSave = () => {
    if (slugError) { toast.error(slugError); return; }
    mutation.mutate({ slug: form.slug, isPublic: form.isPublic });
  };

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader chapter="Preferences" title="Privacy & Portfolio" meta="Visibility & slug" />

        <div className="ts-card-inner ts-form-body">
          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-slug">Your Portfolio Slug</label>
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
              : <span className="ts-input-help">Share this link with agencies and clients.</span>
            }
          </div>

          <div className="ts-field">
            <label className="ts-label" htmlFor="ts-visibility">Profile Visibility</label>
            <select
              id="ts-visibility"
              className="ts-select"
              value={form.isPublic ? 'public' : 'private'}
              onChange={e => set('isPublic', e.target.value === 'public')}
            >
              <option value="public">Public — anyone can view</option>
              <option value="private">Private — hidden from search</option>
            </select>
          </div>

          <div className="ts-toggle-row ts-toggle-row--inline">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Allow Search Indexing</span>
              <span className="ts-toggle-desc">Let search engines index your portfolio page</span>
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
              <span className="ts-toggle-label">Show Contact Information</span>
              <span className="ts-toggle-desc">Display email and phone on your public portfolio</span>
            </div>
            <label className="ts-switch">
              <input
                type="checkbox"
                checked={form.showContact}
                onChange={() => set('showContact', !form.showContact)}
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
        <CardHeader chapter="Agency control" title="Agency Blocklist" meta="Access restrictions" />
        <div className="ts-card-inner ts-form-body">
          <p className="ts-toggle-desc" style={{ margin: 0 }}>
            Agencies on this list cannot view your profile or submit applications on your behalf.
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
              disabled={!blockInput.trim()}
            >
              Block
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCK_INVOICES = [
  { id: '#INV-003', date: 'May 01, 2026', amount: '$29.00' },
  { id: '#INV-002', date: 'Apr 01, 2026', amount: '$29.00' },
  { id: '#INV-001', date: 'Mar 01, 2026', amount: '$29.00' },
];

function SubscriptionSection() {
  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <div className="ts-plan-card">
          <div className="ts-plan-left">
            <span className="ts-plan-name">Studio+</span>
            <div className="ts-plan-price">
              <span className="ts-plan-price-num">$29</span>
              <span className="ts-plan-price-unit">/month</span>
            </div>
            <span className="ts-plan-renewal">Next renewal: June 1, 2026</span>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              style={{ marginTop: '16px', padding: '6px 14px', fontSize: '12px' }}
              onClick={() => toast.info('Plan management coming soon')}
            >
              Change Plan
            </button>
          </div>
          <div className="ts-plan-right">
            <div className="ts-payment-method">
              <CreditCard size={15} aria-hidden="true" />
              <span className="ts-payment-label">•••• 4242</span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              style={{ padding: '5px 12px', fontSize: '12px' }}
              onClick={() => toast.info('Payment method management coming soon')}
            >
              Update Payment
            </button>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader chapter="Your plan" title="Invoice History" meta="Billing records" />
        {MOCK_INVOICES.map(inv => (
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
              onClick={() => toast.info('Invoice download coming soon')}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOCK_SESSIONS = [
  { device: 'Chrome on macOS',   location: 'New York, NY',    time: '2 minutes ago', active: true },
  { device: 'Safari on iPhone',  location: 'New York, NY',    time: '3 days ago',    active: false },
  { device: 'Chrome on Windows', location: 'Los Angeles, CA', time: '2 weeks ago',   active: false },
];

function SecuritySection() {
  const { profile } = useAuth();
  const [isSendingReset, setIsSendingReset] = useState(false);

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
        <CardHeader chapter="Security" title="Security" meta="Credentials" />
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
            <span className="ts-input-help">Primary authentication email. Managed by Firebase.</span>
          </div>

          <div className="ts-credential-row">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Account Password</span>
              <span className="ts-toggle-desc">Send a reset link to your email address</span>
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

          <div className="ts-credential-row">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Two-Factor Authentication</span>
              <span className="ts-toggle-desc">Add an extra layer of security to your account</span>
            </div>
            <span className="ts-badge ts-badge--coming-soon">Coming Soon</span>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader chapter="Recent activity" title="Sessions" meta="Signed-in devices" />
        {MOCK_SESSIONS.map((s, i) => (
          <div key={i} className="ts-session-row">
            <div className="ts-session-icon" aria-hidden="true">
              <Monitor size={14} />
            </div>
            <div className="ts-session-info">
              <span className="ts-session-device">{s.device}</span>
              <span className="ts-session-location">{s.location}</span>
            </div>
            <span className="ts-session-time">{s.time}</span>
            <span className={`ts-badge ${s.active ? 'ts-badge--active' : 'ts-badge--expired'}`}>
              {s.active ? 'Active' : 'Expired'}
            </span>
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
  const [prefs, setPrefs] = useState({
    watermark:  false,
    cardLayout: 'editorial',
    coverImage: 'first',
  });

  const set = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    toast.success('Display preference saved');
  };

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader chapter="Portfolio" title="Display" meta="Comp card & watermark" />
        <div className="ts-toggle-list">
          <div className="ts-toggle-row">
            <div className="ts-toggle-info">
              <span className="ts-toggle-label">Pholio Watermark</span>
              <span className="ts-toggle-desc">Add a subtle Pholio badge to portfolio images</span>
            </div>
            <label className="ts-switch">
              <input
                type="checkbox"
                checked={prefs.watermark}
                onChange={() => set('watermark', !prefs.watermark)}
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
        <CardHeader chapter="Portfolio cover" title="Cover Image" meta="Public portfolio" />
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
              Appears at the top of your public portfolio and on comp cards.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataSection() {
  const [cookies, setCookies] = useState({ analytics: true, marketing: false });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 900));
    toast.success("Data export requested — you'll receive an email within 24 hours");
    setIsExporting(false);
  };

  return (
    <div className="ts-card-stack">
      <div className="ts-card">
        <CardHeader chapter="Legal" title="Your Data" meta="Export & erasure" />
        <div className="ts-card-inner ts-form-body">
          <div className="ts-data-row">
            <div className="ts-action-info">
              <span className="ts-action-label">Download Your Data</span>
              <span className="ts-action-desc">
                Export a ZIP of your profile, images, applications, and account history (GDPR / CCPA).
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
              <span className="ts-action-label">Right to Erasure</span>
              <span className="ts-action-desc">
                Request permanent deletion of all personal data. Separate from account deletion — processed within 30 days.
              </span>
            </div>
            <button
              type="button"
              className="ts-btn ts-btn-ghost"
              onClick={() => toast.info('Erasure request submitted — our team will respond within 30 days')}
            >
              Submit Request
            </button>
          </div>
        </div>
      </div>

      <div className="ts-card">
        <CardHeader chapter="Cookie preferences" title="Tracking" meta="Consent controls" />
        <div className="ts-toggle-list">
          {[
            { key: 'essential', label: 'Essential',  desc: 'Required for authentication and core functionality', locked: true },
            { key: 'analytics', label: 'Analytics',  desc: 'Help us understand how you use Pholio to improve the product' },
            { key: 'marketing', label: 'Marketing',  desc: 'Personalised announcements and partner promotions' },
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
                    if (!locked) {
                      setCookies(prev => ({ ...prev, [key]: !prev[key] }));
                      toast.success('Cookie preference saved');
                    }
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
  return (
    <div className="ts-card ts-card--danger">
      <CardHeader chapter="Irreversible actions" title="Danger Zone" meta="Proceed with care" />

      <div className="ts-action-row">
        <div className="ts-action-info">
          <span className="ts-action-label">Deactivate Account</span>
          <span className="ts-action-desc">
            Temporarily hide your profile and suspend access. Reactivate any time.
          </span>
        </div>
        <button
          type="button"
          className="ts-btn ts-btn-danger-ghost"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Deactivate
        </button>
      </div>

      <div className="ts-action-row">
        <div className="ts-action-info">
          <span className="ts-action-label">Delete Account</span>
          <span className="ts-action-desc">
            Permanently delete all data, images, and applications. This cannot be undone.
          </span>
        </div>
        <button
          type="button"
          className="ts-btn ts-btn-danger"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
