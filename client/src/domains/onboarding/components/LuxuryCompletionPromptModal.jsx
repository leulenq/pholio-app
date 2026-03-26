import React from 'react';
import { Sparkles, ArrowUpRight, Building2, X } from 'lucide-react';
import '../styles/LuxuryCompletionPromptModal.css';

export default function LuxuryCompletionPromptModal({
  isOpen,
  mode = 'generic',
  targetAgency = null,
  isSubmitting = false,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
  errorMessage
}) {
  if (!isOpen) return null;

  const isTargeted = mode === 'targeted' && targetAgency?.id;
  const title = isTargeted
    ? 'Your profile is now agency-ready'
    : 'Your profile is now complete';
  const subtitle = isTargeted
    ? `You were invited through ${targetAgency?.name || 'an agency'} - submit your application in one click.`
    : 'Step into the spotlight - send your profile to agencies now.';
  const primaryCta = isTargeted ? 'Submit to Agency' : 'Discover Agencies';
  const secondaryCta = 'Decide Later';

  return (
    <div className="luxury-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="luxury-prompt-title">
      <div className="luxury-prompt-card">
        <button
          type="button"
          className="luxury-prompt-close"
          onClick={onClose}
          aria-label="Close prompt"
        >
          <X size={16} />
        </button>

        <div className="luxury-prompt-badge">
          <Sparkles size={14} />
          <span>Profile milestone unlocked</span>
        </div>

        <h2 id="luxury-prompt-title" className="luxury-prompt-title">{title}</h2>
        <p className="luxury-prompt-subtitle">{subtitle}</p>

        {isTargeted && (
          <div className="luxury-prompt-agency">
            <div className="luxury-prompt-agency-icon">
              <Building2 size={15} />
            </div>
            <div>
              <div className="luxury-prompt-agency-name">{targetAgency?.name}</div>
              {targetAgency?.location ? (
                <div className="luxury-prompt-agency-meta">{targetAgency.location}</div>
              ) : null}
            </div>
          </div>
        )}

        {errorMessage ? <p className="luxury-prompt-error">{errorMessage}</p> : null}

        <div className="luxury-prompt-actions">
          <button
            type="button"
            className="luxury-prompt-primary"
            onClick={onPrimaryAction}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Please wait...' : primaryCta}
            {!isSubmitting ? <ArrowUpRight size={16} /> : null}
          </button>
          <button
            type="button"
            className="luxury-prompt-secondary"
            onClick={onSecondaryAction}
            disabled={isSubmitting}
          >
            {secondaryCta}
          </button>
        </div>
      </div>
    </div>
  );
}
