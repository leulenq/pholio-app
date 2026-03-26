import React, { useState } from 'react';

/** Notifications tab — file name from Phase 4 Task 4.5 layout. */
export default function OnboardingSection({ profile }) {
  const [settings, setSettings] = useState({
    push_applications: true,
    email_status: true,
    weekly_digest: false,
    marketing: true
  });

  const toggles = [
    { id: 'push_applications', label: 'New Applications', desc: 'Real-time alerts for incoming talent submissions' },
    { id: 'email_status', label: 'Status Updates', desc: 'Email digest of application transitions' },
    { id: 'weekly_digest', label: 'Agency Performance', desc: 'Weekly metrics and roster growth summary' },
    { id: 'marketing', label: 'Feature Announcements', desc: 'Stay updated with Pholio platform releases' },
  ];

  return (
    <div className="st-card">
      <div className="st-toggle-list">
        {toggles.map((t) => (
          <div key={t.id} className="st-toggle-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">{t.label}</span>
              <span className="st-toggle-desc">{t.desc}</span>
            </div>
            <label className="st-switch">
              <input 
                type="checkbox" 
                checked={settings[t.id]} 
                onChange={() => setSettings(p => ({ ...p, [t.id]: !p[t.id] }))} 
              />
              <span className="st-slider" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
