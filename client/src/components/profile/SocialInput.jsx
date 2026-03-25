import React from 'react';
import { Controller } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PholioInput } from '../../shared/components/ui/forms';
import styles from '../../routes/talent/ProfilePage.module.css';

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
  fullWidth = false
}) => {
  const handleBlur = (e) => {
    let val = e.target.value.trim();
    if (!val) return;

    // Auto-prefix logic
    if (base && !val.includes('http')) {
      if (prefix && val.startsWith(prefix)) {
        val = val.substring(prefix.length);
      }
      setValue(name, `${base}${val}`, { shouldDirty: true, shouldValidate: true });
    }
  };

  const testLink = (url) => {
    if (url && url.includes('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
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
