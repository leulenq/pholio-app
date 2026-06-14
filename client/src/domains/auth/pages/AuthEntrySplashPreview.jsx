/**
 * Temporary dev preview for AuthEntrySplash.
 * Access at: /dev/preview/auth-entry
 * Dev-only — not registered in production builds.
 */

import React, { useCallback, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AuthEntrySplash from '../components/AuthEntrySplash';
import './AuthEntrySplashPreview.css';

const VARIANTS = [
  { id: 'talent', label: 'Talent' },
  { id: 'agency', label: 'Agency' },
];

const PREVIEW_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&h=240&fit=crop&auto=format&q=80';

const PREVIEW_DATA = {
  talent: {
    talentName: 'Lena',
    agencyName: undefined,
    avatarUrl: PREVIEW_AVATAR,
    avatarInitials: 'LM',
  },
  agency: {
    agencyName: 'Sterling Model Management',
    avatarUrl: null,
    avatarInitials: 'AQ',
  },
};

export default function AuthEntrySplashPreview() {
  const [variant, setVariant] = useState('talent');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [runKey, setRunKey] = useState(0);

  const restart = useCallback(() => {
    setStartedAt(Date.now());
    setRunKey((k) => k + 1);
  }, []);

  if (!import.meta.env.DEV) {
    return <Navigate to="/login" replace />;
  }

  const preview = PREVIEW_DATA[variant];

  return (
    <div className="auth-entry-preview">
      <AuthEntrySplash
        key={`${variant}-${runKey}`}
        variant={variant}
        startedAt={startedAt}
        talentName={preview.talentName}
        agencyName={preview.agencyName}
        avatarUrl={preview.avatarUrl}
        avatarInitials={preview.avatarInitials}
      />

      <aside className="auth-entry-preview__panel" aria-label="Preview controls">
        <p className="auth-entry-preview__label">Dev preview</p>
        <p className="auth-entry-preview__path">/dev/preview/auth-entry</p>

        <div className="auth-entry-preview__variants" role="group" aria-label="Variant">
          {VARIANTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`auth-entry-preview__variant${
                variant === item.id ? ' auth-entry-preview__variant--active' : ''
              }`}
              onClick={() => {
                setVariant(item.id);
                restart();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button type="button" className="auth-entry-preview__restart" onClick={restart}>
          Restart animation
        </button>
      </aside>
    </div>
  );
}
