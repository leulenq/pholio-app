import React, { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Instagram, Twitter, Youtube, PlaySquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Section, SocialInput } from '../../components/profile-index';
import { isMinorProfile } from '../../../shared/utils/talentAge';
import styles from './ProfilePage.module.css';

const TiktokIcon = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const OnlyFansIcon = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M24 4.003h-4.015c-3.45 0-5.3.197-6.748 1.957a7.996 7.996 0 1 0 2.103 9.211c3.182-.231 5.39-2.134 6.085-5.173 0 0-2.399.585-4.43 0 4.018-.777 6.333-3.037 7.005-5.995zM5.61 11.999A2.391 2.391 0 0 1 9.28 9.97a2.966 2.966 0 0 1 2.998-2.528h.008c-.92 1.778-1.407 3.352-1.998 5.263A2.392 2.392 0 0 1 5.61 12Zm2.386-7.996a7.996 7.996 0 1 0 7.996 7.996 7.996 7.996 0 0 0-7.996-7.996Zm0 10.394A2.399 2.399 0 1 1 10.395 12a2.396 2.396 0 0 1-2.399 2.398Z" />
  </svg>
);

const PLATFORMS = {
  instagram: {
    id: 'instagram_handle',
    name: 'Instagram',
    icon: Instagram,
    brandClass: styles.platformInstagram,
    placeholder: 'instagram.com/username',
    base: 'https://instagram.com/',
    prefix: '@',
    actionText: 'Connect Instagram',
    isOAuth: true
  },
  tiktok: {
    id: 'tiktok_handle',
    name: 'TikTok',
    icon: TiktokIcon,
    brandClass: styles.platformTiktok,
    placeholder: 'tiktok.com/@username',
    base: 'https://tiktok.com/@',
    prefix: '@',
    actionText: 'Connect TikTok',
    isOAuth: true
  },
  twitter: {
    id: 'twitter_handle',
    name: 'X (Twitter)',
    icon: Twitter,
    brandClass: styles.platformTwitter,
    placeholder: 'x.com/username',
    base: 'https://x.com/',
    prefix: '@',
    actionText: 'Connect X',
    isOAuth: true
  },
  youtube: {
    id: 'youtube_handle',
    name: 'YouTube',
    icon: Youtube,
    brandClass: styles.platformYoutube,
    placeholder: 'youtube.com/c/...',
    base: 'https://youtube.com/',
    prefix: '',
    actionText: 'Connect YouTube',
    isOAuth: true
  },
  onlyfans: {
    id: 'onlyfans_url',
    name: 'OnlyFans',
    icon: OnlyFansIcon,
    brandClass: styles.platformOnlyfans,
    placeholder: 'onlyfans.com/username',
    base: 'https://onlyfans.com/',
    prefix: '',
    actionText: 'Add OnlyFans',
    isOAuth: false
  },
  reel: {
    id: 'video_reel_url',
    name: 'Video Reel',
    icon: PlaySquare,
    brandClass: styles.platformReel,
    placeholder: 'https://vimeo.com/... or YouTube',
    base: '',
    prefix: '',
    actionText: 'Add Reel',
    isOAuth: false
  }
};

const PlatformCard = ({ platformKey, control, setValue, errors }) => {
  const [isManual, setIsManual] = useState(false);
  const p = PLATFORMS[platformKey];
  const Icon = p.icon;

  return (
    <Controller
      name={p.id}
      control={control}
      render={({ field }) => {
        const isConnected = !!field.value;
        const showInput = isManual || isConnected || !p.isOAuth;

        return (
          <div className={`${styles.platformCard} ${p.brandClass} ${isConnected ? styles.platformConnected : ''}`}>
             <div className={styles.platformHeader}>
               <div className={styles.platformIconWrapper}>
                 <Icon size={20} />
               </div>
               <div className={styles.platformInfo}>
                 <span className={styles.platformName}>{p.name}</span>
                 {isConnected && !isManual && p.isOAuth && (
                    <a href={field.value.startsWith('http') ? field.value : `${p.base}${field.value.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className={styles.platformHandle}>
                      {String(field.value).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                 )}
               </div>
               {isConnected ? (
                 <button type="button" className={styles.platformDisconnect} onClick={() => { setValue(p.id, null, {shouldDirty: true}); setIsManual(false); }} title="Remove link">
                   <Trash2 size={14} />
                   <span>Remove</span>
                 </button>
               ) : (
                 p.isOAuth && !showInput && (
                   <button type="button" className={styles.platformConnect} onClick={() => toast.info(`${p.name} OAuth connection coming soon. Please use manual entry.`)}>
                     {p.actionText}
                   </button>
                 )
               )}
             </div>
             
             {showInput && (
               <div className={styles.platformInputArea}>
                 <SocialInput 
                   name={p.id}
                   placeholder={p.placeholder}
                   base={p.base}
                   prefix={p.prefix}
                   control={control}
                   setValue={setValue}
                   error={errors[p.id]}
                 />
               </div>
             )}
             
             {!showInput && !isConnected && p.isOAuth && (
               <button type="button" className={styles.platformManualBtn} onClick={() => setIsManual(true)}>
                 Add profile link manually
               </button>
             )}
          </div>
        );
      }}
    />
  );
};

export function SocialSection({ control, setValue, errors, dateOfBirth }) {
  const hideOnlyFans = isMinorProfile({ date_of_birth: dateOfBirth });
  return (
    <Section
      id="socials"
      title="Socials & Media"
      titleEmphasis="Media"
      description="Link your profiles and portfolio."
    >
      <div className={styles.socialGrid}>
        <PlatformCard platformKey="instagram" control={control} setValue={setValue} errors={errors} />
        <PlatformCard platformKey="tiktok" control={control} setValue={setValue} errors={errors} />
        <PlatformCard platformKey="twitter" control={control} setValue={setValue} errors={errors} />
        <PlatformCard platformKey="youtube" control={control} setValue={setValue} errors={errors} />
        {!hideOnlyFans && (
          <PlatformCard platformKey="onlyfans" control={control} setValue={setValue} errors={errors} />
        )}
        <PlatformCard platformKey="reel" control={control} setValue={setValue} errors={errors} />
      </div>
    </Section>
  );
}
