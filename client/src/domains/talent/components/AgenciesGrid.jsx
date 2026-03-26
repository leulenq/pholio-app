import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { MapPin, ArrowUpRight, Sparkles } from 'lucide-react';
import { useAuth } from '../../auth/hooks/useAuth';
import { toast } from 'sonner';
import './AgenciesGrid.css';

export default function AgenciesGrid({ agencies, isLoading }) {
  const { subscription } = useAuth();
  const isPro = subscription?.isPro || false;
  const queryClient = useQueryClient();
  const [applyingId, setApplyingId] = useState(null);

  const applyMutation = useMutation({
    mutationFn: talentApi.createApplication,
    onSuccess: () => {
        setApplyingId(null);
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        toast.success('Application submitted');
    },
    onError: (err) => {
        setApplyingId(null);
        if (err.data?.upgradeRequired) {
            toast.error('Monthly application limit reached. Upgrade to Studio+ for more applications.');
            return;
        }
        toast.error(err?.message || 'Failed to submit application');
    }
  });

  if (isLoading) {
    return (
      <div className="agencies-loading">
        <div className="agencies-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="agency-card-skeleton">
              <div className="skeleton-cover"></div>
              <div className="skeleton-content">
                <div className="skeleton-avatar"></div>
                <div className="skeleton-text"></div>
                <div className="skeleton-text short"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!agencies || agencies.length === 0) {
      return (
        <div className="agencies-empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No Agencies Available</h3>
          <p>Check back soon for new agency partners</p>
        </div>
      );
  }

  const handleApply = async (agency) => {
    setApplyingId(agency.id);
    applyMutation.mutate({ agencyId: agency.id });
  };

  return (
    <div className="agencies-grid-container">
      {!isPro && (
        <div className="upgrade-banner">
          <div className="upgrade-banner-content">
            <Sparkles className="upgrade-icon" />
            <div>
              <h4>Unlock Full Agency Access</h4>
              <p>Upgrade to Studio+ for unlimited applications, detailed match scores, and priority consideration</p>
            </div>
          </div>
          <button className="upgrade-btn-inline">
            <Sparkles size={16} />
            Upgrade Now
          </button>
        </div>
      )}

      <div className="agencies-grid premium">
        {agencies.map((agency, index) => (
          <div 
            key={agency.id} 
            className="agency-card premium"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* Cover Image with Gradient Overlay */}
            <div className="agency-cover">
              <div className="cover-gradient"></div>
              
              {/* Match Score Badge (Studio+ only) */}
              {isPro && agency.matchScore && (
                <div className="match-score-badge">
                  <div className="match-circle">
                    <svg className="match-progress" viewBox="0 0 36 36">
                      <path
                        className="match-progress-bg"
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="match-progress-fill"
                        strokeDasharray={`${agency.matchScore}, 100`}
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="match-score-text">
                      <span className="match-number">{agency.matchScore}</span>
                      <span className="match-percent">%</span>
                    </div>
                  </div>
                  <span className="match-label">Match</span>
                </div>
              )}

              {!isPro && (
                <div className="locked-badge">
                  <Sparkles size={12} />
                  <span>Studio+</span>
                </div>
              )}
            </div>
            
            {/* Card Content */}
            <div className="agency-content">
              {/* Avatar */}
              <div className="agency-avatar-wrapper">
                <div className="agency-avatar">
                  {agency.profile_image ? (
                    <img src={agency.profile_image} alt={agency.name} />
                  ) : (
                    <div className="avatar-placeholder">
                      {agency.name?.[0] || 'A'}
                    </div>
                  )}
                </div>
              </div>

              {/* Agency Info */}
              <div className="agency-info">
                <h3 className="agency-name">{agency.name || 'Unnamed Agency'}</h3>
                <div className="agency-location">
                  <MapPin size={14} />
                  <span>{agency.agency_location || 'Global'}</span>
                </div>
              </div>

              {/* Description */}
              <p className="agency-description">
                {agency.agency_description || 'No public description available.'}
              </p>

              {/* Match Breakdown (Studio+ only) */}
              {isPro && agency.matchBreakdown && (
                <div className="match-breakdown">
                  <div className="breakdown-title">Compatibility</div>
                  <div className="breakdown-items">
                    <div className="breakdown-item">
                      <span className="item-label">Location</span>
                      <div className={`item-badge ${agency.matchBreakdown.location.toLowerCase()}`}>
                        {agency.matchBreakdown.location}
                      </div>
                    </div>
                    <div className="breakdown-item">
                      <span className="item-label">Style</span>
                      <div className={`item-badge ${agency.matchBreakdown.style.toLowerCase()}`}>
                        {agency.matchBreakdown.style}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isPro && (
                <div className="locked-feature">
                  <Sparkles size={14} className="lock-icon" />
                  <span>Upgrade to see match details</span>
                </div>
              )}

              {/* Apply Button */}
              <button 
                onClick={() => handleApply(agency)}
                disabled={applyingId === agency.id}
                className={`agency-apply-btn ${applyingId === agency.id ? 'loading' : ''}`}
              >
                {applyingId === agency.id ? (
                  <>
                    <div className="btn-spinner"></div>
                    Applying...
                  </>
                ) : (
                  <>
                    Apply Now
                    <ArrowUpRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
