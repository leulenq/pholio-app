import React from 'react';
import { Controller } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PholioInput } from '../../../shared/components/ui/forms';
import styles from '../pages/ProfilePage/ProfilePage.module.css';

/**
 * Smart Social Input Component
 * Auto-prefixes social media URLs and provides link testing
 */
export const SocialInput = ({
  label,
  name,
  placeholder,
  base,
  prefix,
  control,
  setValue,
  error,
  fullWidth = false,
  type = 'text',
  inputMode,
  autoComplete
}) => {
  const looksLikeUrl = (input) =>
    /:\/\//.test(input) || /^www\./i.test(input) || /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(input);

  const normalizeUrl = (input) => {
    const trimmed = input.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^\/+/, '')}`;
  };

  const handleBlur = (e) => {
    let val = e.target.value.trim();
    if (!val) return;

    // If the user pasted a URL-like value, normalize scheme instead of prepending base + slug.
    if (looksLikeUrl(val)) {
      setValue(name, normalizeUrl(val), { shouldDirty: true, shouldValidate: true });
      return;
    }

    // Auto-prefix logic for plain handles/slugs.
    if (base) {
      if (prefix && val.startsWith(prefix)) {
        val = val.substring(prefix.length);
      }
      const merged = `${base}${val}`.replace(/([^:]\/)\/+/g, '$1');
      setValue(name, merged, { shouldDirty: true, shouldValidate: true });
    }
  };

  const testLink = (url) => {
    if (url) {
      const normalized = normalizeUrl(String(url));
      if (/^https?:\/\//i.test(normalized)) {
        window.open(normalized, '_blank', 'noopener,noreferrer');
        return;
      }
    }
    {
      toast.error('Please enter a valid URL to test');
    }
  };

  return (
    <div className={fullWidth ? styles.fullWidth : ''}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <div className={styles.socialInputWrapper}>
            <PholioInput
              {...field}
              type={type}
              inputMode={inputMode}
              autoComplete={autoComplete}
              label={label}
              placeholder={placeholder}
              error={error}
              onBlur={(e) => {
                field.onBlur(e);
                handleBlur(e);
              }}
              className={styles.socialInput}
            />
            {field.value && (
              <button
                type="button"
                className={styles.testLinkBtn}
                onClick={() => testLink(field.value)}
                title="Test Link"
              >
                <ExternalLink size={16} />
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
};
