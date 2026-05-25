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

function AccountSection()      { return null; }
function NotificationsSection(){ return null; }
function PrivacySection()      { return null; }
function SubscriptionSection() { return null; }
function SecuritySection()     { return null; }
function DangerZoneSection()   { return null; }
