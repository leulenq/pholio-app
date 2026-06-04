import React, { useState } from 'react';
import { MapPin, ArrowUpRight, Lock } from 'lucide-react';
import { useAuth } from '../../auth/hooks/useAuth';
import ApplyModal from './ApplyModal';
import './AgenciesGrid.css';

export default function AgenciesGrid({ agencies, isLoading }) {
  const { subscription } = useAuth();
  const isPro = subscription?.isPro || false;
  const [applyTarget, setApplyTarget] = useState(null);

  if (isLoading) {
    return (
      <div className="agcy-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="agcy-card agcy-card--skel" />
        ))}
      </div>
    );
  }

  if (!agencies || agencies.length === 0) {
    return (
      <div className="agcy-empty">
        <p>No agencies available right now.</p>
      </div>
    );
  }

  return (
    <>
      {applyTarget && (
        <ApplyModal agency={applyTarget} onClose={() => setApplyTarget(null)} />
      )}

      <div className="agcy-grid">
        {agencies.map((agency, idx) => (
          <article key={agency.id} className="agcy-card">
            <div className="agcy-card__mark" aria-hidden>
              {agency.profile_image
                ? <img src={agency.profile_image} alt="" />
                : <span>{agency.name?.[0]?.toUpperCase() ?? 'A'}</span>}
            </div>

            <div className="agcy-card__body">
              <h3 className="agcy-card__name">{agency.name || 'Unnamed Agency'}</h3>
              <p className="agcy-card__loc">
                <MapPin size={12} aria-hidden />
                {agency.agency_location || 'Global'}
              </p>
              {agency.agency_description && (
                <p className="agcy-card__desc">{agency.agency_description}</p>
              )}
            </div>

            <div className="agcy-card__action">
              <span className="agcy-card__idx">{String(idx + 1).padStart(2, '0')}</span>
              <button
                type="button"
                className="agcy-card__apply"
                onClick={() => setApplyTarget(agency)}
                disabled={!isPro && idx >= 2}
                aria-label={`Apply to ${agency.name}`}
              >
                {!isPro && idx >= 2 ? (
                  <>
                    <Lock size={12} aria-hidden />
                    Studio+
                  </>
                ) : (
                  <>
                    Compose
                    <ArrowUpRight size={13} aria-hidden />
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
