import React from 'react';
import { Controller } from 'react-hook-form';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PholioInput } from '../../../../shared/components/ui/forms';
import { Section, SocialInput } from '../../components/profile-index';
import styles from './ProfilePage.module.css';

function normalizeVideoReelUrl(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function SocialSection({ control, setValue, errors }) {
  return (
    <Section id="socials" title="Socials & Media" description="Link your profiles and portfolio.">
      <div className={styles.socialGrid}>
        <SocialInput
          label="Instagram"
          name="instagram_handle"
          placeholder="e.g. https://instagram.com/username"
          base="https://instagram.com/"
          prefix="@"
          control={control}
          setValue={setValue}
          error={errors.instagram_handle}
        />
        <SocialInput
          label="TikTok"
          name="tiktok_handle"
          placeholder="e.g. https://tiktok.com/@username"
          base="https://tiktok.com/@"
          prefix="@"
          control={control}
          setValue={setValue}
          error={errors.tiktok_handle}
        />
      </div>
      <div className={`${styles.socialGrid} ${styles.formRow}`}>
        <SocialInput
          label="Twitter / X"
          name="twitter_handle"
          placeholder="e.g. https://x.com/username"
          base="https://x.com/"
          prefix="@"
          control={control}
          setValue={setValue}
          error={errors.twitter_handle}
        />
        <SocialInput
          label="YouTube Channel"
          name="youtube_handle"
          placeholder="e.g. https://youtube.com/channel/..."
          base="https://youtube.com/"
          control={control}
          setValue={setValue}
          error={errors.youtube_handle}
        />
      </div>
      <div className={`${styles.socialGrid} ${styles.formRow}`}>
        <SocialInput
          label="Website / Portfolio"
          name="portfolio_url"
          placeholder="https://yourwebsite.com"
          type="url"
          inputMode="url"
          autoComplete="url"
          control={control}
          setValue={setValue}
          error={errors.portfolio_url}
        />
        <Controller
          name="video_reel_url"
          control={control}
          render={({ field }) => (
            <div className={styles.socialInputWrapper}>
              <PholioInput
                {...field}
                value={field.value ?? ''}
                label="Video reel URL"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://vimeo.com/… or YouTube link"
                error={errors.video_reel_url}
                onBlur={(e) => {
                  field.onBlur();
                  const next = normalizeVideoReelUrl(e.target.value);
                  if (next !== (field.value ?? null)) {
                    setValue('video_reel_url', next, { shouldDirty: true, shouldValidate: true });
                  }
                }}
                className={styles.socialInput}
              />
              {field.value && (
                <button
                  type="button"
                  className={styles.testLinkBtn}
                  onClick={() => {
                    const u = field.value;
                    if (u && String(u).includes('http')) {
                      window.open(String(u), '_blank', 'noopener,noreferrer');
                    } else {
                      toast.error('Please enter a valid URL to test');
                    }
                  }}
                  title="Open reel"
                >
                  <ExternalLink size={16} />
                </button>
              )}
            </div>
          )}
        />
      </div>
    </Section>
  );
}
