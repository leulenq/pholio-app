import React, { useState } from 'react';
import { Controller } from 'react-hook-form';
import { Instagram, PlaySquare, Trash2, Globe, Check, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Section, SocialInput } from '../../components/profile-index';
import { isMinorProfile } from '../../../../shared/utils/talentAge';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { apiClient } from '../../../../shared/lib/api-client';
import styles from './ProfilePage.module.css';

const TiktokIcon = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="-48 -48 544 608" fill="currentColor" stroke="none" className={className}>
    <path d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25V349.38A162.55 162.55 0 1 1 185 188.31V278.2a74.62 74.62 0 1 0 52.23 71.18V0l88 0a121.18 121.18 0 0 0 1.86 22.17h0A122.18 122.18 0 0 0 381 102.39a121.43 121.43 0 0 0 67 20.14Z" />
  </svg>
);

const YoutubeIcon = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const XIcon = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
    actionText: 'Add Instagram',
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
    actionText: 'Add TikTok',
    isOAuth: true
  },
  twitter: {
    id: 'twitter_handle',
    name: 'X',
    icon: XIcon,
    brandClass: styles.platformX,
    placeholder: 'x.com/username',
    base: 'https://x.com/',
    prefix: '@',
    actionText: 'Add X',
    isOAuth: false
  },
  youtube: {
    id: 'youtube_handle',
    name: 'YouTube',
    icon: YoutubeIcon,
    brandClass: styles.platformYoutube,
    placeholder: 'youtube.com/c/...',
    base: 'https://youtube.com/',
    prefix: '',
    actionText: 'Add YouTube',
    isOAuth: true
  },
  portfolio: {
    id: 'portfolio_url',
    name: 'Personal Website',
    icon: Globe,
    brandClass: styles.platformPortfolio,
    placeholder: 'https://yourwebsite.com',
    base: '',
    prefix: '',
    actionText: 'Add Website',
    isOAuth: false
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

const PlatformCard = ({ platformKey, control, setValue, errors, watch, reloadProfile }) => {
  const p = PLATFORMS[platformKey];
  const Icon = p.icon;

  const isVerified = watch ? watch(`${platformKey}_verified`) : false;
  const followersCount = watch ? watch(`${platformKey}_followers`) : null;
  const engagementRate = watch ? watch(`${platformKey}_engagement`) : null;
  const [disconnecting, setDisconnecting] = useState(false);

  const formatFollowers = (count) => {
    if (!count) return '0';
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  };

  const handleConnect = () => {
    const currentHandle = watch ? watch(p.id) || '' : '';
    const width = 500;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      `/socials/oauth/mock/${platformKey}?handle=${encodeURIComponent(currentHandle)}`,
      `Verify ${p.name}`,
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,resizable=no`
    );

    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SOCIAL_OAUTH_SUCCESS' && event.data?.platform === platformKey) {
        toast.success(`${p.name} account verified!`);
        setValue(p.id, event.data.handle, { shouldDirty: true });
        setValue(`${platformKey}_verified`, true);
        setValue(`${platformKey}_followers`, event.data.metrics.follower_count);
        setValue(`${platformKey}_engagement`, event.data.metrics.engagement_rate);
        if (reloadProfile) await reloadProfile();
        window.removeEventListener('message', handleMessage);
      } else if (event.data?.type === 'SOCIAL_OAUTH_CANCELLED' && event.data?.platform === platformKey) {
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await apiClient.post(`/talent/socials/oauth/disconnect/${platformKey}`);
      if (response && response.success) {
        toast.success(`${p.name} disconnected successfully.`);
        setValue(p.id, null, { shouldDirty: true });
        setValue(`${platformKey}_verified`, false);
        setValue(`${platformKey}_followers`, null);
        setValue(`${platformKey}_engagement`, null);
        if (reloadProfile) await reloadProfile();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to disconnect account.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Controller
      name={p.id}
      control={control}
      render={({ field }) => {
        const isConnected = !!field.value;

        return (
          <div className={`${styles.platformCard} ${p.brandClass} ${isConnected ? styles.platformConnected : ''} ${isVerified ? styles.platformVerifiedCard : ''}`}>
             <div className={styles.platformHeader}>
               <div className={styles.platformIconWrapper}>
                 <Icon size={20} />
               </div>
               <div className={styles.platformInfo}>
                 <span className={styles.platformName}>
                   {p.name}
                   {isVerified && (
                     <span className={styles.verifiedLabelText}>
                       <Check size={12} strokeWidth={3} className={styles.verifiedCheckIcon} />
                       Verified
                     </span>
                   )}
                 </span>
               </div>
               {isConnected && (
                 isVerified ? (
                   <PholioButton
                     type="button"
                     variant="meta"
                     onClick={handleDisconnect}
                     disabled={disconnecting}
                     title="Disconnect OAuth Account"
                   >
                     <Trash2 size={14} />
                     <span>Disconnect</span>
                   </PholioButton>
                 ) : (
                   <PholioButton
                     type="button"
                     variant="meta"
                     onClick={() => { setValue(p.id, null, {shouldDirty: true}); }}
                     title="Remove link"
                   >
                     <Trash2 size={14} />
                     <span>Remove</span>
                   </PholioButton>
                 )
               )}
             </div>

             {isVerified ? (
               <div className={styles.platformVerifiedContent}>
                 <div className={styles.verifiedHandleRow}>
                   <span className={styles.verifiedHandleText}>@{field.value}</span>
                 </div>
                 <div className={styles.metricsGrid}>
                   <div className={styles.metricItem}>
                     <span className={styles.metricVal}>{formatFollowers(followersCount)}</span>
                     <span className={styles.metricLabel}>Followers</span>
                   </div>
                   <div className={styles.metricItem}>
                     <span className={styles.metricVal}>{engagementRate}%</span>
                     <span className={styles.metricLabel}>Engagement</span>
                   </div>
                 </div>
               </div>
             ) : (
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

                 {p.isOAuth && (
                   <div className={styles.oauthVerifyRow}>
                     <PholioButton
                       type="button"
                       variant="meta"
                       className={styles.oauthVerifyBtn}
                       onClick={handleConnect}
                     >
                       <Link2 size={12} />
                       <span>Connect & Verify Account</span>
                     </PholioButton>
                   </div>
                 )}
               </div>
             )}
          </div>
        );
      }}
    />
  );
};

export function SocialSection({ control, setValue, errors, dateOfBirth, watch, reloadProfile }) {
  const hideOnlyFans = isMinorProfile({ date_of_birth: dateOfBirth });
  return (
    <Section
      id="socials"
      title="Socials & Media"
      titleEmphasis="Media"
      description="Link your profiles and portfolio."
    >
      <div className={styles.socialGrid}>
        <PlatformCard platformKey="instagram" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        <PlatformCard platformKey="tiktok" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        <PlatformCard platformKey="twitter" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        <PlatformCard platformKey="youtube" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        <PlatformCard platformKey="portfolio" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        {!hideOnlyFans && (
          <PlatformCard platformKey="onlyfans" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
        )}
        <PlatformCard platformKey="reel" control={control} setValue={setValue} errors={errors} watch={watch} reloadProfile={reloadProfile} />
      </div>
    </Section>
  );
}
