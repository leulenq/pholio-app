import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { Calendar, MapPin, XCircle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import './ApplicationsList.css';

export default function ApplicationsList({ applications, isLoading }) {
  const queryClient = useQueryClient();
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [withdrawConfirmation, setWithdrawConfirmation] = useState(null);

  const withdrawMutation = useMutation({
    mutationFn: talentApi.withdrawApplication,
    onSuccess: () => {
      setWithdrawingId(null);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application withdrawn');
    },
    onError: (err) => {
        setWithdrawingId(null);
        toast.error(err?.message || 'Failed to withdraw application');
    }
  });

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      pending: {
        icon: <Clock size={18} />,
        label: 'Under Review',
        gradient: 'status-pending',
        description: 'Your application is being reviewed'
      },
      accepted: {
        icon: <CheckCircle size={18} />,
        label: 'Accepted',
        gradient: 'status-accepted',
        description: 'Congratulations! You\'ve been accepted'
      },
      declined: {
        icon: <AlertCircle size={18} />,
        label: 'Not Selected',
        gradient: 'status-declined',
        description: 'Keep applying to other opportunities'
      },
      rejected: {
        icon: <AlertCircle size={18} />,
        label: 'Not Selected',
        gradient: 'status-declined',
        description: 'Keep applying to other opportunities'
      }
    };
    return configs[status] || configs.pending;
  };

  const handleWithdraw = (app) => {
    setWithdrawConfirmation(app);
  };

  const confirmWithdraw = () => {
    if (withdrawConfirmation) {
      setWithdrawingId(withdrawConfirmation.id);
      withdrawMutation.mutate(withdrawConfirmation.id);
      setWithdrawConfirmation(null);
    }
  };

  if (isLoading) {
    return (
      <div className="applications-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="application-card-skeleton">
            <div className="skeleton-header"></div>
            <div className="skeleton-body">
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!applications || applications.length === 0) {
    return (
      <div className="applications-empty-state">
        <div className="empty-illustration">
          <div className="empty-circle">
            <Calendar size={48} />
          </div>
        </div>
        <h3>No Applications Yet</h3>
        <p>Start browsing agencies to submit your first application</p>
        <div className="empty-tip">
          <div className="tip-icon">💡</div>
          <div className="tip-text">
            <strong>Tip:</strong> Studio+ members get unlimited applications and priority review
          </div>
        </div>
      </div>
    );
  }

  const sortedApplications = [...applications].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  return (
    <div className="applications-list-container">
      <div className="applications-header">
        <div>
          <h3 className="applications-title">Your Applications</h3>
          <p className="applications-subtitle">{applications.length} total submission{applications.length !== 1 ? 's' : ''}</p>
        </div>
        
        <div className="status-legend">
          <div className="legend-item">
            <div className="legend-dot pending"></div>
            <span>Under Review</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot accepted"></div>
            <span>Accepted</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot declined"></div>
            <span>Not Selected</span>
          </div>
        </div>
      </div>

      <div className="applications-timeline">
        {sortedApplications.map((app, index) => {
          const statusConfig = getStatusConfig(app.status);
          
          return (
            <div 
              key={app.id} 
              className={`application-card ${statusConfig.gradient}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Timeline Connector */}
              {index < sortedApplications.length - 1 && (
                <div className="timeline-connector"></div>
              )}

              {/* Status Indicator */}
              <div className="status-indicator">
                <div className="status-dot"></div>
              </div>

              {/* Card Content */}
              <div className="card-body">
                <div className="card-main">
                  {/* Agency Info */}
                  <div className="agency-section">
                    <div className="agency-avatar">
                      {app.agency_logo ? (
                        <img src={app.agency_logo} alt={app.agency_name} />
                      ) : (
                        <div className="avatar-initial">
                          {app.agency_name?.[0] || 'A'}
                        </div>
                      )}
                    </div>
                    
                    <div className="agency-details">
                      <h4 className="agency-name">{app.agency_name || 'Unknown Agency'}</h4>
                      <div className="agency-meta">
                        <MapPin size={14} />
                        <span>{app.agency_location || 'Location not specified'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="status-section">
                    <div className="status-badge">
                      {statusConfig.icon}
                      <span>{statusConfig.label}</span>
                    </div>
                    <p className="status-description">{statusConfig.description}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="card-footer">
                  <div className="submission-date">
                    <Calendar size={14} />
                    <span>Applied {formatDate(app.created_at)}</span>
                  </div>

                  {app.status === 'pending' && (
                    <button 
                      onClick={() => handleWithdraw(app)}
                      disabled={withdrawingId === app.id}
                      className={`withdraw-btn ${withdrawingId === app.id ? 'loading' : ''}`}
                    >
                      {withdrawingId === app.id ? (
                        <>
                          <div className="btn-spinner-small"></div>
                          Withdrawing...
                        </>
                      ) : (
                        <>
                          <XCircle size={14} />
                          Withdraw
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Withdraw Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={withdrawConfirmation !== null}
        title="Withdraw Application?"
        message={`Are you sure you want to withdraw your application to ${withdrawConfirmation?.agency_name}? The agency will be notified.`}
        confirmLabel="Withdraw Application"
        cancelLabel="Keep Application"
        variant="warning"
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawConfirmation(null)}
      />
    </div>
  );
}
