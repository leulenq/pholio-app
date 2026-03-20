import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Bell, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams();
  const activeSection = section || 'account';

  const [formData, setFormData] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    profileViews: true,
    applications: true,
    marketing: false,
  });

  const [privacy, setPrivacy] = useState({
    profileVisibility: 'public',
    showContactInfo: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNotificationChange = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrivacyChange = (key, value) => {
    setPrivacy(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveAccount = async () => {
    setIsSaving(true);
    try {
      await updateProfile(formData);
      toast.success('Account settings saved!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'account', label: 'Account', icon: <User size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'privacy', label: 'Privacy', icon: <Lock size={18} /> },
  ];

  const renderAccountSection = () => (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>
        Account Information
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '0.5rem' }}>
            First Name
          </label>
          <input
            type="text"
            name="first_name"
            value={formData.first_name}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '0.5rem' }}>
            Last Name
          </label>
          <input
            type="text"
            name="last_name"
            value={formData.last_name}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '0.5rem' }}>
            Email
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '0.5rem' }}>
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none'
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSaveAccount}
          disabled={isSaving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.875rem 1.75rem',
            background: '#C9A55A',
            color: 'white',
            borderRadius: '8px',
            fontWeight: 500,
            fontSize: '0.9rem',
            border: 'none',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.6 : 1,
            transition: 'all 0.2s'
          }}
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  const renderNotificationsSection = () => (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>
        Notification Preferences
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {[
          { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive email updates about your account' },
          { key: 'profileViews', label: 'Profile View Alerts', description: 'Get notified when someone views your profile' },
          { key: 'applications', label: 'Application Updates', description: 'Receive updates about your agency applications' },
          { key: 'marketing', label: 'Marketing Emails', description: 'Receive tips and updates about Pholio features' },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#0f172a', marginBottom: '0.25rem' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                {item.description}
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifications[item.key]}
                onChange={() => handleNotificationChange(item.key)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: notifications[item.key] ? '#C9A55A' : '#cbd5e1',
                borderRadius: '24px',
                transition: 'background 0.3s'
              }}>
                <span style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: notifications[item.key] ? '27px' : '3px',
                  bottom: '3px',
                  background: 'white',
                  borderRadius: '50%',
                  transition: 'left 0.3s'
                }} />
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPrivacySection = () => (
    <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>
        Privacy Settings
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#64748b', marginBottom: '0.75rem' }}>
            Profile Visibility
          </label>
          <select
            value={privacy.profileVisibility}
            onChange={(e) => handlePrivacyChange('profileVisibility', e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="public">Public - Anyone can view</option>
            <option value="agencies">Agencies Only</option>
            <option value="private">Private - Hidden from search</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#0f172a', marginBottom: '0.25rem' }}>
              Show Contact Information
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Display email and phone on your public profile
            </div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={privacy.showContactInfo}
              onChange={() => handlePrivacyChange('showContactInfo', !privacy.showContactInfo)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: privacy.showContactInfo ? '#C9A55A' : '#cbd5e1',
              borderRadius: '24px',
              transition: 'background 0.3s'
            }}>
              <span style={{
                position: 'absolute',
                content: '',
                height: '18px',
                width: '18px',
                left: privacy.showContactInfo ? '27px' : '3px',
                bottom: '3px',
                background: 'white',
                borderRadius: '50%',
                transition: 'left 0.3s'
              }} />
            </span>
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: '#faf9f7',
      padding: '3rem 2rem',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <button
            onClick={() => navigate('/dashboard/talent')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#64748b',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '1.5rem',
              padding: 0
            }}
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>

          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Settings
          </h1>
          <p style={{ fontSize: '0.9375rem', color: '#64748b', margin: 0 }}>
            Manage your account preferences
          </p>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Sidebar Navigation */}
          <nav style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            {sections.map(sec => (
              <button
                key={sec.id}
                onClick={() => navigate(`/dashboard/talent/settings/${sec.id}`)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem',
                  background: activeSection === sec.id ? '#faf9f7' : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: activeSection === sec.id ? '#C9A55A' : '#64748b',
                  fontSize: '0.9375rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left',
                  marginBottom: '0.5rem'
                }}
              >
                {sec.icon}
                {sec.label}
              </button>
            ))}
          </nav>

          {/* Content Area */}
          <div>
            {activeSection === 'account' && renderAccountSection()}
            {activeSection === 'notifications' && renderNotificationsSection()}
            {activeSection === 'privacy' && renderPrivacySection()}
          </div>
        </div>
      </div>
    </div>
  );
}
