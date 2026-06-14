import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Instagram, Twitter, Youtube, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  normalizeSocialFieldValue,
  normalizeUrl,
} from '../../../../shared/lib/normalize-social-field';
import './AgencySocialSection.css';

const TiktokIcon = ({ size = 20, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const PLATFORMS = {
  instagram: {
    id: 'agency_instagram_handle',
    name: 'Instagram',
    icon: Instagram,
    brandClass: 'st-platform-card--instagram',
    placeholder: 'instagram.com/username',
    base: 'https://instagram.com/',
    prefix: '@',
    actionText: 'Connect Instagram',
    isOAuth: true,
  },
  tiktok: {
    id: 'agency_tiktok_handle',
    name: 'TikTok',
    icon: TiktokIcon,
    brandClass: 'st-platform-card--tiktok',
    placeholder: 'tiktok.com/@username',
    base: 'https://tiktok.com/@',
    prefix: '@',
    actionText: 'Connect TikTok',
    isOAuth: true,
  },
  twitter: {
    id: 'agency_twitter_handle',
    name: 'X (Twitter)',
    icon: Twitter,
    brandClass: 'st-platform-card--twitter',
    placeholder: 'x.com/username',
    base: 'https://x.com/',
    prefix: '@',
    actionText: 'Connect X',
    isOAuth: true,
  },
  youtube: {
    id: 'agency_youtube_handle',
    name: 'YouTube',
    icon: Youtube,
    brandClass: 'st-platform-card--youtube',
    placeholder: 'youtube.com/c/...',
    base: 'https://youtube.com/',
    prefix: '',
    actionText: 'Connect YouTube',
    isOAuth: true,
  },
};

function AgencySocialInput({ value, onChange, onBlur, placeholder, base, prefix, disabled }) {
  const testLink = (url) => {
    if (!url) return;
    const normalized = normalizeUrl(String(url));
    if (/^https?:\/\//i.test(normalized)) {
      window.open(normalized, '_blank', 'noopener,noreferrer');
      return;
    }
    toast.error('Please enter a valid URL to test');
  };

  const handleBlur = (e) => {
    const normalized = normalizeSocialFieldValue(e.target.value, { base, prefix });
    const next = normalized || '';
    if (next !== (value || '')) {
      onChange(next || null);
    }
    onBlur?.(e);
  };

  return (
    <div className="st-social-input-wrap">
      <input
        className="st-input"
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
      {value && (
        <button
          type="button"
          className="st-social-test"
          onClick={() => testLink(value)}
          title="Test link"
          disabled={disabled}
        >
          <ExternalLink size={15} />
        </button>
      )}
    </div>
  );
}

function PlatformCard({ platformKey, values, onChange, disabled }) {
  const [isManual, setIsManual] = useState(false);
  const p = PLATFORMS[platformKey];
  const Icon = p.icon;
  const value = values[p.id];
  const isConnected = !!value;
  const showInput = isManual || isConnected || !p.isOAuth;

  const handleChange = (next) => onChange(p.id, next);
  const handleRemove = () => {
    onChange(p.id, null);
    setIsManual(false);
  };

  const displayHandle = value
    ? String(value).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    : '';

  const href = value
    ? (String(value).startsWith('http') ? value : `${p.base}${String(value).replace(/^@/, '')}`)
    : null;

  return (
    <motion.div
      className={`st-platform-card ${p.brandClass}${isConnected ? ' st-platform-card--connected' : ''}`}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16 }}
    >
      <div className="st-platform-head">
        <div className="st-platform-icon">
          <Icon size={18} />
        </div>
        <div className="st-platform-info">
          <span className="st-platform-name">{p.name}</span>
          {isConnected && !isManual && p.isOAuth && href && (
            <a href={href} target="_blank" rel="noreferrer" className="st-platform-handle">
              {displayHandle}
            </a>
          )}
        </div>
        {isConnected ? (
          <button
            type="button"
            className="st-platform-disconnect"
            onClick={handleRemove}
            title="Remove link"
            disabled={disabled}
          >
            <Trash2 size={14} />
            <span>Remove</span>
          </button>
        ) : (
          p.isOAuth && !showInput && (
            <button
              type="button"
              className="st-platform-connect"
              onClick={() => toast.info(`${p.name} OAuth connection coming soon. Please use manual entry.`)}
              disabled={disabled}
            >
              {p.actionText}
            </button>
          )
        )}
      </div>

      {showInput && (
        <div className="st-platform-input-area">
          <AgencySocialInput
            value={value}
            onChange={handleChange}
            placeholder={p.placeholder}
            base={p.base}
            prefix={p.prefix}
            disabled={disabled}
          />
        </div>
      )}

      {!showInput && !isConnected && p.isOAuth && (
        <button
          type="button"
          className="st-platform-manual"
          onClick={() => setIsManual(true)}
          disabled={disabled}
        >
          Add profile link manually
        </button>
      )}
    </motion.div>
  );
}

const PLATFORM_ORDER = ['instagram', 'tiktok', 'twitter', 'youtube'];

export default function AgencySocialSection({ values, onChange, disabled = false }) {
  const handleFieldChange = (field, next) => onChange(field, next);

  return (
    <div className="st-social-grid">
      {PLATFORM_ORDER.map((key, i) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 55, damping: 16, delay: i * 0.04 }}
        >
          <PlatformCard platformKey={key} values={values} onChange={handleFieldChange} disabled={disabled} />
        </motion.div>
      ))}
    </div>
  );
}

export const AGENCY_SOCIAL_FIELDS = Object.values(PLATFORMS).map((p) => p.id);
