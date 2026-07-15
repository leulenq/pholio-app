import React from 'react';
import { Controller } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PholioInput } from '../../../shared/components/ui/forms';
import PholioButton from '../../../shared/components/ui/PholioButton';
import {
  normalizeSocialFieldValue,
  normalizeUrl,
} from '../../../shared/lib/normalize-social-field';
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
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
}) => {
  const fieldConfig = {
    base: base || '',
    prefix: prefix || '',
  };

  const applyNormalization = (raw) => {
    const val = String(raw ?? '').trim();
    if (!val) return null;
    return normalizeSocialFieldValue(val, fieldConfig);
  };

  const handleBlur = (e) => {
    const normalized = applyNormalization(e.target.value);
    if (normalized == null) return;
    if (normalized !== e.target.value) {
      setValue(name, normalized, { shouldDirty: true, shouldValidate: true });
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
    toast.error('Please enter a valid URL to test');
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
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              spellCheck={spellCheck}
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
              <PholioButton
                variant="meta"
                aria-label="Test link"
                className={styles.testLinkBtn}
                onClick={() => testLink(field.value)}
                title="Test Link"
              >
                <ExternalLink size={16} />
              </PholioButton>
            )}
          </div>
        )}
      />
    </div>
  );
};
