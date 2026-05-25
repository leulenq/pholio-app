import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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

export default function SettingsPage() {
  const { section } = useParams();
  const activeSection = section || 'account';
  const navigate = useNavigate();

  return (
    <div className="st-page">
      <div className="st-grain" aria-hidden="true" />
      <motion.div
        className="st-wrap"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASING }}
      >
        {/* Page header */}
        <span className="st-wordmark">PHOLIO</span>
        <Link to="/dashboard/talent" className="st-back">← Dashboard</Link>
        <div>
          <span className="st-header-eyebrow">Account Settings</span>
          <h1 className="st-page-title">Settings</h1>
        </div>
        <hr className="st-rule" />

        {/* Two-column layout */}
        <div className="st-layout">

          {/* Sidebar */}
          <aside className="st-sidebar">
            <nav className="st-nav" aria-label="Settings sections">
              {GROUPS.map(group => (
                <div key={group} className="st-nav-group">
                  <span className="st-nav-group-label">{group}</span>
                  {SECTIONS.filter(s => s.group === group).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`st-nav-item${activeSection === s.id ? ' active' : ''}`}
                      onClick={() => { if (activeSection !== s.id) navigate(`/dashboard/talent/settings/${s.id}`); }}
                      aria-current={activeSection === s.id ? 'page' : undefined}
                    >
                      {activeSection === s.id && (
                        <motion.div layoutId="st-nav-bar" className="st-nav-bar" />
                      )}
                      <span className="st-nav-dot" aria-hidden="true" />
                      <span className="st-nav-text">
                        <span className="st-nav-label">{s.label}</span>
                        <span className="st-nav-desc">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="st-support">
              <span className="st-support-eyebrow">Need Help?</span>
              <p className="st-support-text">Questions about your account or billing?</p>
              <a href="mailto:support@pholio.studio" className="st-support-link">
                support@pholio.studio <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </aside>

          {/* Main content */}
          <main className="st-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.35, ease: EASING }}
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
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">01 / Identity</span>
        <h2 className="st-card-title">Account</h2>
      </div>
      <div className="st-card-inner">
        <div className="st-avatar-section">
          <div
            className="st-avatar"
            role="button"
            tabIndex={0}
            aria-label="Upload profile photo"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
            onClick={() => toast.info('Photo upload coming soon')}
          >
            <Camera size={24} className="st-avatar-icon" aria-hidden="true" />
            <div className="st-avatar-overlay" aria-hidden="true">
              <Camera size={18} color="white" />
            </div>
          </div>
          <div>
            <div className="st-label">Profile Photo</div>
            <div className="st-avatar-action-text">Click to upload a headshot</div>
          </div>
        </div>

        <div className="st-form-body">
          <div className="st-field-row">
            <div className="st-field">
              <label className="st-label" htmlFor="st-first-name">First Name</label>
              <input
                id="st-first-name"
                className="st-input"
                name="first_name"
                autoComplete="given-name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="e.g. Mia"
              />
            </div>
            <div className="st-field">
              <label className="st-label" htmlFor="st-last-name">Last Name</label>
              <input
                id="st-last-name"
                className="st-input"
                name="last_name"
                autoComplete="family-name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="e.g. Voss"
              />
            </div>
          </div>

          <div className="st-field">
            <label className="st-label" htmlFor="st-email">Email Address</label>
            <input
              id="st-email"
              className="st-input"
              type="email"
              autoComplete="email"
              value={profile?.email || ''}
              disabled
            />
            <span className="st-input-help">
              Managed by Firebase authentication — contact support to update.
            </span>
          </div>

          <div className="st-field">
            <label className="st-label" htmlFor="st-phone">Phone Number</label>
            <input
              id="st-phone"
              className="st-input"
              type="tel"
              name="phone"
              autoComplete="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <div className="st-field-row">
            <div className="st-field">
              <label className="st-label" htmlFor="st-language">Language</label>
              <select
                id="st-language"
                className="st-select"
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
            <div className="st-field">
              <label className="st-label" htmlFor="st-timezone">Timezone</label>
              <select
                id="st-timezone"
                className="st-select"
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

      <div className="st-card-footer" style={{ gap: '8px' }}>
        {isChanged && (
          <button
            type="button"
            className="st-btn st-btn-secondary"
            onClick={handleCancel}
            disabled={isUpdatingProfile}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="st-btn st-btn-primary"
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
    <div key={key} className="st-toggle-row">
      <div className="st-toggle-info">
        <span className="st-toggle-label">{label}</span>
        <span className="st-toggle-desc">{desc}</span>
      </div>
      <label className="st-switch">
        <input
          type="checkbox"
          checked={prefs[key]}
          onChange={() => handleToggle(key)}
        />
        <span className="st-slider" />
        <span className="sr-only">{label}</span>
      </label>
    </div>
  );

  return (
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">02 / Preferences</span>
        <h2 className="st-card-title">Notifications</h2>
      </div>
      <div className="st-toggle-list">
        <div className="st-notif-freq">
          <div className="st-toggle-info">
            <span className="st-toggle-label">Email Delivery</span>
            <span className="st-toggle-desc">How often to batch email notifications</span>
          </div>
          <div className="st-freq-options" role="group" aria-label="Email frequency">
            {FREQ_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`st-freq-btn${emailFrequency === opt.value ? ' active' : ''}`}
                onClick={() => handleFrequency(opt.value)}
                aria-pressed={emailFrequency === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <span className="st-toggle-group-label">By Email</span>
        {EMAIL_TOGGLES.map(renderRow)}
        <span className="st-toggle-group-label">In App</span>
        {INAPP_TOGGLES.map(renderRow)}
      </div>
    </div>
  );
}
function PrivacySection() {
  const queryClient = useQueryClient();
  const [blockedAgencies, setBlockedAgencies] = useState([]);
  const [blockInput, setBlockInput] = useState('');

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

  const { data: settings, isLoading } = useQuery({
    queryKey: ['talent-settings'],
    queryFn:  talentApi.getSettings,
    select:   (d) => d?.settings,
  });

  const [form, setForm] = useState({
    slug:          '',
    isPublic:      true,
    isDiscoverable: false,
    showContact:   true,
  });
  const [initialized, setInitialized] = useState(false);
  const [isChanged, setIsChanged]     = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setForm({
        slug:           settings.slug          || '',
        isPublic:       settings.isPublic      ?? true,
        isDiscoverable: settings.isDiscoverable ?? false,
        showContact:    true,
      });
      setInitialized(true);
    }
  }, [settings, initialized]);

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
    mutation.mutate({
      slug:    form.slug,
      isPublic: form.isPublic,
    });
  };

  if (isLoading || !initialized) {
    return <div className="st-loading"><span>Loading…</span></div>;
  }

  return (
    <div className="st-card-stack">
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">03 / Preferences</span>
        <h2 className="st-card-title">Privacy &amp; Portfolio</h2>
      </div>

      <div className="st-card-inner st-form-body">
        <div className="st-field">
          <label className="st-label" htmlFor="st-slug">Your Portfolio Slug</label>
          <div className="st-input-prefix-wrap">
            <span className="st-input-prefix">pholio.studio/p/</span>
            <input
              id="st-slug"
              className="st-input"
              value={form.slug}
              onChange={e => set('slug', e.target.value.toLowerCase())}
              placeholder="your-name"
              maxLength={50}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {slugError
            ? <span className="st-input-help" style={{ color: '#C0392B' }}>{slugError}</span>
            : <span className="st-input-help">Share this link with agencies and clients.</span>
          }
        </div>

        <div className="st-field">
          <label className="st-label" htmlFor="st-visibility">Profile Visibility</label>
          <select
            id="st-visibility"
            className="st-select"
            value={form.isPublic ? 'public' : 'private'}
            onChange={e => set('isPublic', e.target.value === 'public')}
          >
            <option value="public">Public — anyone can view</option>
            <option value="private">Private — hidden from search</option>
          </select>
        </div>

        <div className="st-toggle-row st-toggle-row--inline">
          <div className="st-toggle-info">
            <span className="st-toggle-label">Allow Search Indexing</span>
            <span className="st-toggle-desc">Let search engines index your portfolio page</span>
          </div>
          <label className="st-switch">
            <input
              type="checkbox"
              checked={form.isDiscoverable}
              onChange={() => set('isDiscoverable', !form.isDiscoverable)}
            />
            <span className="st-slider" />
            <span className="sr-only">Allow search indexing</span>
          </label>
        </div>

        <div className="st-toggle-row st-toggle-row--inline">
          <div className="st-toggle-info">
            <span className="st-toggle-label">Show Contact Information</span>
            <span className="st-toggle-desc">Display email and phone on your public portfolio</span>
          </div>
          <label className="st-switch">
            <input
              type="checkbox"
              checked={form.showContact}
              onChange={() => set('showContact', !form.showContact)}
            />
            <span className="st-slider" />
            <span className="sr-only">Show contact information</span>
          </label>
        </div>
      </div>

      <div className="st-card-footer">
        <button
          type="button"
          className="st-btn st-btn-primary"
          onClick={handleSave}
          disabled={!isChanged || mutation.isPending || Boolean(slugError)}
        >
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>

    {/* Agency blocklist */}
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">Agency Control</span>
        <h2 className="st-card-title">Agency Blocklist</h2>
      </div>
      <div className="st-card-inner st-form-body">
        <p className="st-toggle-desc" style={{ margin: 0 }}>
          Agencies on this list cannot view your profile or submit applications on your behalf.
        </p>
        {blockedAgencies.length > 0 && (
          <div className="st-blocklist">
            {blockedAgencies.map(name => (
              <div key={name} className="st-blocklist-row">
                <span className="st-blocklist-name">{name}</span>
                <button
                  type="button"
                  className="st-btn st-btn-ghost"
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
          <span className="st-blocklist-empty">No agencies blocked</span>
        )}
        <div className="st-blocklist-add">
          <input
            className="st-input"
            placeholder="Agency name…"
            value={blockInput}
            onChange={e => setBlockInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addBlockedAgency(); }}
            aria-label="Agency name to block"
          />
          <button
            type="button"
            className="st-btn st-btn-secondary"
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
    <div className="st-card-stack">
      {/* Plan hero card */}
      <div className="st-card">
        <div className="st-plan-card">
          <div className="st-plan-left">
            <span className="st-plan-name">Studio+</span>
            <div className="st-plan-price">
              <span className="st-plan-price-num">$29</span>
              <span className="st-plan-price-unit">/month</span>
            </div>
            <span className="st-plan-renewal">Next renewal: June 1, 2026</span>
            <button
              className="st-btn st-btn-ghost"
              style={{ marginTop: '16px', padding: '0', fontSize: '13px' }}
              onClick={() => toast.info('Plan management coming soon')}
            >
              Change Plan
            </button>
          </div>
          <div className="st-plan-right">
            <div className="st-payment-method">
              <CreditCard size={16} aria-hidden="true" />
              <span className="st-payment-label">•••• 4242</span>
            </div>
            <button
              className="st-btn st-btn-ghost"
              style={{ padding: '0', fontSize: '12px' }}
              onClick={() => toast.info('Payment method management coming soon')}
            >
              Update Payment Method
            </button>
          </div>
        </div>
      </div>

      {/* Invoice history */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">04 / Your Plan</span>
          <h2 className="st-card-title">Invoice History</h2>
        </div>
        {MOCK_INVOICES.map(inv => (
          <div key={inv.id} className="st-invoice-row">
            <span className="st-invoice-id">{inv.id}</span>
            <span className="st-invoice-date">{inv.date}</span>
            <span className="st-invoice-amount">{inv.amount}</span>
            <span className="st-invoice-status">
              <Check size={11} aria-hidden="true" /> Paid
            </span>
            <button
              className="st-invoice-download"
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
  { device: 'Chrome on macOS',   location: 'New York, NY',      time: '2 minutes ago', active: true },
  { device: 'Safari on iPhone',  location: 'New York, NY',      time: '3 days ago',    active: false },
  { device: 'Chrome on Windows', location: 'Los Angeles, CA',   time: '2 weeks ago',   active: false },
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
    <div className="st-card-stack">
      {/* Credentials card */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">05 / Security</span>
          <h2 className="st-card-title">Security</h2>
        </div>
        <div className="st-card-inner st-form-body">
          <div className="st-field">
            <label className="st-label" htmlFor="st-sec-email">Email Address</label>
            <div className="st-input-icon-wrap">
              <Mail size={15} className="st-input-icon" aria-hidden="true" />
              <input
                id="st-sec-email"
                className="st-input st-input--icon"
                type="email"
                value={profile?.email || ''}
                disabled
              />
            </div>
            <span className="st-input-help">Primary authentication email. Managed by Firebase.</span>
          </div>

          <div className="st-credential-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">Account Password</span>
              <span className="st-toggle-desc">Send a reset link to your email address</span>
            </div>
            <button
              className="st-btn st-btn-secondary"
              onClick={handlePasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? 'Sending…' : 'Update Password'}
            </button>
          </div>

          <div className="st-credential-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">Two-Factor Authentication</span>
              <span className="st-toggle-desc">Add an extra layer of security to your account</span>
            </div>
            <span className="st-badge st-badge--coming-soon">Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Sessions card */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">Recent Activity</span>
          <h2 className="st-card-title">Sessions</h2>
        </div>
        {MOCK_SESSIONS.map((s, i) => (
          <div key={i} className="st-session-row">
            <div className="st-session-icon" aria-hidden="true">
              <Monitor size={15} />
            </div>
            <div className="st-session-info">
              <span className="st-session-device">{s.device}</span>
              <span className="st-session-location">{s.location}</span>
            </div>
            <span className="st-session-time">{s.time}</span>
            <span className={`st-badge ${s.active ? 'st-badge--active' : 'st-badge--expired'}`}>
              {s.active ? 'Active' : 'Expired'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
const LAYOUT_OPTIONS = [
  { value: 'editorial', label: 'Editorial',  desc: 'Full-bleed hero image' },
  { value: 'classic',   label: 'Classic',    desc: '1 large + 3 small' },
  { value: 'minimal',   label: 'Minimal',    desc: 'Text-forward grid' },
];

function DisplaySection() {
  const [prefs, setPrefs] = useState({
    watermark:   false,
    cardLayout:  'editorial',
    coverImage:  'first',
  });

  const set = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    toast.success('Display preference saved');
  };

  return (
    <div className="st-card-stack">
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">04 / Portfolio</span>
          <h2 className="st-card-title">Display</h2>
        </div>
        <div className="st-toggle-list">
          <div className="st-toggle-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">Pholio Watermark</span>
              <span className="st-toggle-desc">Add a subtle Pholio badge to portfolio images</span>
            </div>
            <label className="st-switch">
              <input
                type="checkbox"
                checked={prefs.watermark}
                onChange={() => set('watermark', !prefs.watermark)}
              />
              <span className="st-slider" />
              <span className="sr-only">Pholio watermark</span>
            </label>
          </div>
        </div>
        <div className="st-card-inner">
          <div className="st-field">
            <div className="st-label">Comp Card Layout</div>
            <div className="st-display-grid">
              {LAYOUT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`st-display-option${prefs.cardLayout === opt.value ? ' active' : ''}`}
                  onClick={() => set('cardLayout', opt.value)}
                  aria-pressed={prefs.cardLayout === opt.value}
                >
                  <span className="st-display-option-label">{opt.label}</span>
                  <span className="st-display-option-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">Portfolio Cover</span>
          <h2 className="st-card-title">Cover Image</h2>
        </div>
        <div className="st-card-inner">
          <div className="st-field">
            <label className="st-label" htmlFor="st-cover">Default Cover</label>
            <select
              id="st-cover"
              className="st-select"
              value={prefs.coverImage}
              onChange={e => set('coverImage', e.target.value)}
            >
              <option value="first">First image in gallery</option>
              <option value="latest">Most recently added</option>
              <option value="featured">Manually pinned image</option>
            </select>
            <span className="st-input-help">
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
    <div className="st-card-stack">
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">07 / Legal</span>
          <h2 className="st-card-title">Your Data</h2>
        </div>
        <div className="st-card-inner st-form-body">
          <div className="st-data-row">
            <div className="st-action-info">
              <span className="st-action-label">Download Your Data</span>
              <span className="st-action-desc">
                Export a ZIP of your profile, images, applications, and account history (GDPR / CCPA).
              </span>
            </div>
            <button
              type="button"
              className="st-btn st-btn-secondary"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? 'Requesting…' : 'Request Export'}
            </button>
          </div>
          <div className="st-data-row">
            <div className="st-action-info">
              <span className="st-action-label">Right to Erasure</span>
              <span className="st-action-desc">
                Request permanent deletion of all personal data. Separate from account deletion — processed within 30 days.
              </span>
            </div>
            <button
              type="button"
              className="st-btn st-btn-ghost"
              onClick={() => toast.info('Erasure request submitted — our team will respond within 30 days')}
            >
              Submit Request
            </button>
          </div>
        </div>
      </div>

      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">Cookie Preferences</span>
          <h2 className="st-card-title">Tracking</h2>
        </div>
        <div className="st-toggle-list">
          {[
            { key: 'essential', label: 'Essential',  desc: 'Required for authentication and core functionality', locked: true },
            { key: 'analytics', label: 'Analytics',  desc: 'Help us understand how you use Pholio to improve the product' },
            { key: 'marketing', label: 'Marketing',  desc: 'Personalised announcements and partner promotions' },
          ].map(({ key, label, desc, locked }) => (
            <div key={key} className="st-toggle-row">
              <div className="st-toggle-info">
                <span className="st-toggle-label">{label}</span>
                <span className="st-toggle-desc">{desc}</span>
              </div>
              <label className="st-switch" style={locked ? { opacity: 0.45, pointerEvents: 'none' } : {}}>
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
                <span className="st-slider" />
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
    <div className="st-card st-card--danger">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">Irreversible Actions</span>
        <h2 className="st-card-title">Danger Zone</h2>
      </div>

      <div className="st-action-row">
        <div className="st-action-info">
          <span className="st-action-label">Deactivate Account</span>
          <span className="st-action-desc">
            Temporarily hide your profile and suspend access. Reactivate any time.
          </span>
        </div>
        <button
          type="button"
          className="st-btn st-btn-danger-ghost"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Deactivate
        </button>
      </div>

      <div className="st-action-row">
        <div className="st-action-info">
          <span className="st-action-label">Delete Account</span>
          <span className="st-action-desc">
            Permanently delete all data, images, and applications. This cannot be undone.
          </span>
        </div>
        <button
          type="button"
          className="st-btn st-btn-danger"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
