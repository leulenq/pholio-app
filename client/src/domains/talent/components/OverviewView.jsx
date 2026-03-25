import React, { useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { Download, Share2, Eye, TrendingUp, Award, ExternalLink, Sparkles, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import './OverviewView.css';

export default function OverviewView() {
  const { profile, subscription, completeness, isLoading: profileLoading } = useAuth();
  const { activities, isLoading: activitiesLoading, summary } = useAnalytics();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadCompCard = async () => {
    setIsDownloading(true);
    try {
      // TODO: Call backend PDF generator endpoint
      const response = await fetch('/api/talent/comp-card', {
        method: 'POST',
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profile?.slug || 'comp-card'}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Comp card downloaded!');
      } else {
        toast.error('Failed to generate comp card');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('An error occurred while downloading');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareProfile = () => {
    const profileUrl = `${window.location.origin}/talent/${profile?.slug}`;
    navigator.clipboard.writeText(profileUrl).then(() => {
      toast.success('Profile link copied to clipboard!');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Real stats from analytics API
  const stats = {
    views: summary?.views?.total || 0,
    downloads: summary?.downloads?.total || 0,
    applications: 0, // TODO: Add applications count to API
    profileStrength: completeness?.percentage || 0
  };

  const getProfileStrengthColor = (percentage) => {
    if (percentage >= 80) return 'strength-high';
    if (percentage >= 50) return 'strength-medium';
    return 'strength-low';
  };

  const nextSteps = [
    {
      id: 1,
      title: 'Complete your profile',
      description: 'Add your measurements and bio',
      action: 'Go to Profile',
      link: '/dashboard/talent/profile',
      completed: completeness?.percentage >= 80,
      icon: <CheckCircle size={20} />
    },
    {
      id: 2,
      title: 'Upload portfolio images',
      description: 'Showcase your best work',
      action: 'Add Media',
      link: '/dashboard/talent/media',
      completed: profile?.images?.length > 0,
      icon: <CheckCircle size={20} />
    },
    {
      id: 3,
      title: 'Download your comp card',
      description: 'Share it with agencies',
      action: 'Download',
      onClick: handleDownloadCompCard,
      completed: false,
      icon: <Download size={20} />
    }
  ];

  return (
    <div className="overview-container">
      {/* Two-Column Magazine Layout */}
      <div className="overview-grid">
        
        {/* Main Content Area (Left/Center) */}
        <div className="overview-main">
          {/* MASSIVE Editorial Hero */}
          <div className="overview-hero">
            <h1 className="hero-greeting">
              {getGreeting()},{' '}
              <span className="hero-name">{profile?.first_name || 'Talent'}</span>
            </h1>
            <p className="hero-tagline">
              Here's what's happening with your portfolio today
            </p>
          </div>

          {/* Stats Overview */}
          <div className="stats-section">
            <h2 className="section-title">At a Glance</h2>

            {profileLoading ? (
              <div className="stats-grid">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="stat-card skeleton-card">
                    <div className="stat-icon skeleton-icon"></div>
                    <div className="stat-content">
                      <div className="skeleton-value"></div>
                      <div className="skeleton-label"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon views">
                    <Eye size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.views}</div>
                    <div className="stat-label">Profile Views</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon downloads">
                    <Download size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.downloads}</div>
                    <div className="stat-label">Downloads</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon applications">
                    <TrendingUp size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.applications}</div>
                    <div className="stat-label">Applications</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className={`stat-icon profile-strength ${getProfileStrengthColor(stats.profileStrength)}`}>
                    <Award size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.profileStrength}%</div>
                    <div className="stat-label">Profile Strength</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Next Steps */}
          <div className="next-steps-section">
            <h2 className="section-title">Next Steps</h2>

            {profileLoading ? (
              <div className="next-steps-list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="next-step-card skeleton-card">
                    <div className="skeleton-icon" style={{ width: '24px', height: '24px', borderRadius: '50%' }}></div>
                    <div className="step-content">
                      <div className="skeleton-value" style={{ height: '0.9375rem', marginBottom: '0.25rem' }}></div>
                      <div className="skeleton-label" style={{ height: '0.8125rem' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="next-steps-list">
                {nextSteps.map((step) => (
                  <div key={step.id} className={`next-step-card ${step.completed ? 'completed' : ''}`}>
                    <div className={`step-checkbox ${step.completed ? 'checked' : ''}`}>
                      {step.completed && step.icon}
                    </div>

                    <div className="step-content">
                      <h3 className="step-title">{step.title}</h3>
                      <p className="step-description">{step.description}</p>
                    </div>

                    {!step.completed && (
                      step.link ? (
                        <a href={step.link} className="step-action">
                          {step.action}
                        </a>
                      ) : (
                        <button onClick={step.onClick} className="step-action">
                          {step.action}
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Utility Rail Sidebar (Right) */}
        <aside className="utility-rail">
          <div className="utility-rail-sticky">
            <h3 className="rail-title">Quick Actions</h3>
            
            <div className="rail-actions">
              <button 
                onClick={handleDownloadCompCard}
                disabled={isDownloading}
                className="action-card primary"
              >
                <div className="action-icon primary">
                  <Download size={24} />
                </div>
                <div className="action-content">
                  <h4 className="action-title">Download Comp Card</h4>
                  <p className="action-description">
                    {isDownloading ? 'Generating PDF...' : 'Professional PDF for agencies'}
                  </p>
                </div>
                {isDownloading && (
                  <div className="action-spinner"></div>
                )}
              </button>

              <button
                onClick={handleShareProfile}
                className="action-card secondary"
              >
                <div className="action-icon">
                  <Share2 size={24} />
                </div>
                <div className="action-content">
                  <h4 className="action-title">Share Profile</h4>
                  <p className="action-description">Copy your public link</p>
                </div>
              </button>

              <a 
                href={`/talent/${profile?.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="action-card secondary"
              >
                <div className="action-icon">
                  <ExternalLink size={24} />
                </div>
                <div className="action-content">
                  <h4 className="action-title">View Public Profile</h4>
                  <p className="action-description">See what others see</p>
                </div>
              </a>
            </div>

            {/* Activity Stream */}
            <div className="rail-activity">
              <h3 className="rail-title">Recent Activity</h3>

              {activitiesLoading ? (
                <div className="activity-loading">
                  <div className="loading-spinner"></div>
                </div>
              ) : activities && activities.length > 0 ? (
                <div className="activity-list">
                  {activities.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      <div className="activity-icon">
                        {activity.icon}
                      </div>
                      <div className="activity-content">
                        <p className="activity-message">{activity.message}</p>
                        <div className="activity-time">
                          <Clock size={12} />
                          <span>{activity.timeAgo}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="activity-empty">
                  <Clock size={24} />
                  <p>No recent activity</p>
                </div>
              )}
            </div>

            {!subscription?.isPro && (
              <div className="rail-upgrade">
                <a href="/pricing" className="upgrade-button">
                  <Sparkles size={16} />
                  <span>Upgrade to Studio+</span>
                </a>
              </div>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
