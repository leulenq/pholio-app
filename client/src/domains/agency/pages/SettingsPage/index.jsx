import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  User, Palette, Bell, Shield, Check, 
  CreditCard, ChevronRight,
  ExternalLink, Mail, Zap, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  getAgencyProfile,
  updateAgencyProfile,
} from '../../api/agency';
import { AgencyButton } from '../../components/ui/AgencyButton';
import LoadingSpinner from '../../../../shared/components/shared/LoadingSpinner';
import BrandingSection from './BrandingSection';
import TeamSection from './TeamSection';
import OnboardingSection from './OnboardingSection';
import './SettingsPage.css';

const TABS = [
  { id: 'profile', label: 'Agency Profile', icon: User, description: 'Basic identity and contact details' },
  { id: 'branding', label: 'Branding', icon: Palette, description: 'Logo and visual brand attributes' },
  { id: 'team', label: 'Team', icon: Users, description: 'Manage members and permissions' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Configure alerts and triggers' },
  { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Invoices and subscription' },
  { id: 'account', label: 'Security', icon: Shield, description: 'Password and access logs' },
];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const { data: profile, isLoading } = useQuery({
    queryKey: ['agency-profile'],
    queryFn: getAgencyProfile,
  });

  if (isLoading) {
    return (
      <div className="st-page">
        <div className="st-loading-wrap">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  const containerVars = {
    hidden: { opacity: 0, y: 10 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.05
      }
    }
  };

  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div className="st-page">
      <motion.div 
        className="st-container"
        initial="hidden"
        animate="show"
        variants={containerVars}
      >
        <header className="st-header">
          <div className="st-header-content">
            <h1 className="st-title">Settings</h1>
            <div className="st-breadcrumb">
              <span>Agency Dashboard</span>
              <ChevronRight size={12} />
              <span className="st-breadcrumb-active">{currentTab?.label}</span>
            </div>
          </div>
          <div className="st-header-badge">
            <Zap size={14} className="st-badge-icon" />
            <span>Enterprise Plan</span>
          </div>
        </header>

        <div className="st-layout">
          <aside className="st-aside">
            <nav className="st-nav">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`st-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <div className={`st-nav-icon-wrap ${activeTab === tab.id ? 'active' : ''}`}>
                    <tab.icon size={18} />
                  </div>
                  <div className="st-nav-text">
                    <span className="st-nav-label">{tab.label}</span>
                    <span className="st-nav-desc">{tab.description}</span>
                  </div>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="active-nav-indicator"
                      className="st-nav-indicator"
                    />
                  )}
                </button>
              ))}
            </nav>

            <div className="st-aside-promo">
              <div className="st-promo-content">
                <span className="st-promo-eyebrow">Need Help?</span>
                <p>Explore our documentation or contact priority support.</p>
                <a href="mailto:support@pholio.studio" className="st-promo-link">
                  Contact Support <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </aside>

          <main className="st-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="st-content-wrapper"
              >
                <div className="st-section-info">
                  <h2 className="st-section-title">{currentTab?.label}</h2>
                  <p className="st-section-desc">{currentTab?.description}</p>
                </div>

                {activeTab === 'profile' && <ProfileSection profile={profile} />}
                {activeTab === 'branding' && <BrandingSection profile={profile} />}
                {activeTab === 'team' && <TeamSection profile={profile} />}
                {activeTab === 'notifications' && <OnboardingSection profile={profile} />}
                {activeTab === 'billing' && <BillingSection profile={profile} />}
                {activeTab === 'account' && <AccountSection profile={profile} />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </motion.div>
      <div className="st-page-grain" />
    </div>
  );
}

function ProfileSection({ profile }) {
  const [formData, setFormData] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    agency_name: profile?.agency_name || '',
    agency_location: profile?.agency_location || '',
    agency_website: profile?.agency_website || '',
    agency_description: profile?.agency_description || '',
  });
  const [isChanged, setIsChanged] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: updateAgencyProfile,
    onSuccess: () => {
      queryClient.invalidateQueries(['agency-profile']);
      toast.success('Profile updated successfully');
      setIsChanged(false);
    },
    onError: (err) => toast.error(err.message || 'Update failed')
  });

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setIsChanged(true);
  };

  return (
    <div className="st-card">
      <div className="st-card-form">
        <div className="st-field-row">
          <div className="st-field">
            <label>First Name <span className="st-req">*</span></label>
            <input 
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              placeholder="e.g. Sarah"
              className="st-input"
            />
          </div>
          <div className="st-field">
            <label>Last Name</label>
            <input 
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              placeholder="e.g. Chen"
              className="st-input"
            />
          </div>
        </div>

        <div className="st-field">
          <label>Agency Name <span className="st-req">*</span></label>
          <input 
            name="agency_name"
            value={formData.agency_name}
            onChange={handleChange}
            placeholder="e.g. Elite Models NYC"
            className="st-input"
          />
        </div>

        <div className="st-field-row">
          <div className="st-field">
            <label>Location</label>
            <input 
              name="agency_location"
              value={formData.agency_location}
              onChange={handleChange}
              placeholder="e.g. New York, NY"
              className="st-input"
            />
          </div>
          <div className="st-field">
            <label>Website</label>
            <input 
              name="agency_website"
              value={formData.agency_website}
              onChange={handleChange}
              placeholder="https://agency.com"
              className="st-input"
            />
          </div>
        </div>

        <div className="st-field">
          <label>Description</label>
          <textarea 
            name="agency_description"
            value={formData.agency_description}
            onChange={handleChange}
            placeholder="Tell your story..."
            className="st-textarea"
          />
          <span className="st-help">Brief editorial overview of your agency mission.</span>
        </div>
      </div>

      <div className="st-card-footer">
        <AgencyButton 
          variant="primary" 
          disabled={!isChanged || updateMutation.isPending}
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate(formData)}
        >
          Save Changes
        </AgencyButton>
      </div>
    </div>
  );
}

function BillingSection() {
  const invoices = [
    { id: '#INV-001', date: 'Mar 01, 2026', amount: '$499.00', status: 'Paid' },
    { id: '#INV-000', date: 'Feb 01, 2026', amount: '$499.00', status: 'Paid' },
  ];

  return (
    <div className="st-card-stack">
      <div className="st-card billing-hero">
        <div className="st-billing-info">
          <div className="st-billing-plan">
            <span className="st-plan-name">Enterprise Plan</span>
            <span className="st-plan-price">$499 <small>/mo</small></span>
          </div>
          <div className="st-plan-details">
            <span>Next renewal: April 1, 2026</span>
            <AgencyButton variant="ghost" size="sm">Change Plan</AgencyButton>
          </div>
        </div>
        <div className="st-billing-method">
          <div className="st-card-preview">
            <CreditCard size={20} />
            <span>•••• 4242</span>
          </div>
          <AgencyButton variant="ghost" size="sm">Update</AgencyButton>
        </div>
      </div>

      <div className="st-card">
        <div className="st-card-header">
          <h3>Invoice History</h3>
        </div>
        <div className="st-invoice-list">
          {invoices.map((inv) => (
            <div key={inv.id} className="st-invoice-row">
              <div className="st-inv-main">
                <span className="st-inv-id">{inv.id}</span>
                <span className="st-inv-date">{inv.date}</span>
              </div>
              <div className="st-inv-amount">{inv.amount}</div>
              <div className="st-inv-status"><Check size={12} /> {inv.status}</div>
              <button className="st-inv-download">Download</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountSection({ profile }) {
  return (
    <div className="st-card-stack">
      <div className="st-card">
        <div className="st-card-form">
          <div className="st-field">
            <label>Master Email Address</label>
            <div className="st-input-icon-wrap">
              <Mail size={16} className="st-input-icon" />
              <input value={profile?.email} disabled className="st-input st-input--icon" />
            </div>
            <span className="st-help">Primary account for authentication and billing correspondence.</span>
          </div>
        </div>
      </div>

      <div className="st-card st-card--danger">
        <div className="st-card-header">
          <h3>Security & Privacy</h3>
        </div>
        <div className="st-security-items">
          <div className="st-sec-item">
            <div className="st-sec-info">
              <span className="st-sec-label">Account Password</span>
              <span className="st-sec-desc">Last changed 4 months ago</span>
            </div>
            <AgencyButton variant="secondary" size="sm">Update Password</AgencyButton>
          </div>
          <div className="st-divider" />
          <div className="st-sec-item">
            <div className="st-sec-info">
              <span className="st-sec-label">Delete Organization</span>
              <span className="st-sec-desc">Permanently remove all data and members.</span>
            </div>
            <AgencyButton variant="ghost" size="sm" className="text-red-500">Deactivate</AgencyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
