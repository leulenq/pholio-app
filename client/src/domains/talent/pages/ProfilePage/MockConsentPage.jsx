import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { apiClient } from '../../../../shared/lib/api-client';
import styles from './MockConsentPage.module.css';

export default function MockConsentPage() {
  const { platform } = useParams();
  const [searchParams] = useSearchParams();
  const initialHandle = searchParams.get('handle') || '';
  
  const [handle, setHandle] = useState(initialHandle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Styling attributes based on platform
  const platformConfig = {
    instagram: {
      name: 'Instagram',
      color: '#E1306C',
      gradient: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
      logoText: 'Instagram',
      permissionText: 'access your basic profile info, media count, and follower metrics.'
    },
    tiktok: {
      name: 'TikTok',
      color: '#000000',
      gradient: 'linear-gradient(90deg, #00f2fe 0%, #4facfe 100%)',
      logoText: 'TikTok',
      permissionText: 'read public profile data, video list, and monthly viewer reach.'
    },
    youtube: {
      name: 'YouTube',
      color: '#FF0000',
      gradient: 'linear-gradient(135deg, #FF0000 0%, #D30000 100%)',
      logoText: 'Google / YouTube',
      permissionText: 'view channel statistics, subscriber counts, and video metrics.'
    }
  };

  const currentPlatform = platformConfig[platform?.toLowerCase()] || {
    name: platform || 'Social Network',
    color: '#B8956A',
    gradient: 'linear-gradient(135deg, #B8956A 0%, #A6845C 100%)',
    logoText: platform || 'Social Platform',
    permissionText: 'access your public profile and audience metrics.'
  };

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!handle.trim()) {
      setError('Please enter your username/handle to connect.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // POST directly to the oauth callback API
      const response = await apiClient.post('/talent/socials/oauth/callback', {
        platform: platform.toLowerCase(),
        handle: handle.trim()
      });

      if (response && response.success) {
        setSuccess(true);
        // Post message back to parent window
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'SOCIAL_OAUTH_SUCCESS',
              platform: platform.toLowerCase(),
              handle: handle.trim(),
              metrics: response.data
            },
            window.location.origin
          );
        }
        
        // Auto close window after 1.5 seconds
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        setError(response?.error || 'Failed to authenticate with platform.');
      }
    } catch (err) {
      console.error('[MockOAuth] Connection error:', err);
      setError(err.message || 'Network connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'SOCIAL_OAUTH_CANCELLED',
          platform: platform?.toLowerCase()
        },
        window.location.origin
      );
    }
    window.close();
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Brand Header */}
        <div 
          className={styles.header}
          style={{ background: currentPlatform.gradient }}
        >
          <h1 className={styles.logoText}>{currentPlatform.logoText}</h1>
          <span className={styles.subHeader}>Security Authorization</span>
        </div>

        <div className={styles.body}>
          {success ? (
            <div className={styles.successBlock}>
              <CheckCircle size={60} className={styles.successIcon} />
              <h2>Authorization Success!</h2>
              <p>Your {currentPlatform.name} account is now verified. Connecting back to Pholio...</p>
            </div>
          ) : (
            <form onSubmit={handleApprove}>
              <div className={styles.appLink}>
                <div className={styles.avatarPholio}>P</div>
                <div className={styles.linkArrows}>
                  <div className={styles.arrowLine} />
                  <Shield size={16} className={styles.shieldIcon} />
                  <div className={styles.arrowLine} />
                </div>
                <div 
                  className={styles.avatarPlatform}
                  style={{ backgroundColor: currentPlatform.color }}
                >
                  {currentPlatform.name.charAt(0)}
                </div>
              </div>

              <h2 className={styles.title}>Connect with Pholio</h2>
              <p className={styles.subtitle}>
                Pholio is requesting permission to {currentPlatform.permissionText}
              </p>

              {error && (
                <div className={styles.errorBanner}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className={styles.inputGroup}>
                <label htmlFor="handle-input">Confirm your {currentPlatform.name} handle</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.inputPrefix}>@</span>
                  <input
                    id="handle-input"
                    type="text"
                    className={styles.input}
                    placeholder="username"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              <div className={styles.actions}>
                <PholioButton
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </PholioButton>
                <PholioButton
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  style={{ backgroundColor: currentPlatform.color, borderColor: currentPlatform.color }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className={styles.spinner} />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Authorize App</span>
                  )}
                </PholioButton>
              </div>
            </form>
          )}
        </div>
        
        <div className={styles.footer}>
          <Shield size={12} />
          <span>Secured Sandbox connection. No password will be shared with Pholio.</span>
        </div>
      </div>
    </div>
  );
}
