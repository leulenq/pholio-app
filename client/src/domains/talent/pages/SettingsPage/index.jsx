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
  { id: 'account',       label: 'Account',       group: 'IDENTITY',     desc: 'Name, email, phone' },
  { id: 'notifications', label: 'Notifications',  group: 'PREFERENCES',  desc: 'Email and in-app alerts' },
  { id: 'privacy',       label: 'Privacy',        group: 'PREFERENCES',  desc: 'Visibility and portfolio URL' },
  { id: 'subscription',  label: 'Subscription',   group: 'YOUR PLAN',    desc: 'Plan and billing' },
  { id: 'security',      label: 'Security',       group: 'YOUR PLAN',    desc: 'Password and access' },
  { id: 'danger',        label: 'Danger Zone',    group: 'YOUR PLAN',    desc: 'Account actions' },
];

const GROUPS = ['IDENTITY', 'PREFERENCES', 'YOUR PLAN'];

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
                      className={`st-nav-item${activeSection === s.id ? ' active' : ''}`}
                      onClick={() => navigate(`/dashboard/talent/settings/${s.id}`)}
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
                {activeSection === 'subscription'  && <SubscriptionSection />}
                {activeSection === 'security'      && <SecuritySection />}
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
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    phone:      profile?.phone      || '',
  });
  const [isChanged, setIsChanged] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setIsChanged(true);
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
          <div className="st-avatar" title="Upload headshot">
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
              value={form.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>
      </div>

      <div className="st-card-footer">
        <button
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
function NotificationsSection(){ return null; }
function PrivacySection()      { return null; }
function SubscriptionSection() { return null; }
function SecuritySection()     { return null; }
function DangerZoneSection()   { return null; }
