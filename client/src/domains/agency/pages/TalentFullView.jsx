import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getApplicationDetails } from '../api/agency';
import MatchScoreBadge from '../components/ui/MatchScoreBadge';
import { TalentStatusBadge } from '../components/ui/TalentStatusBadge';
import { TalentActionBar } from '../components/talent/TalentActionBar';
import { TalentThread } from '../components/talent/TalentThread';
import { PortfolioGrid } from '../components/zones/PortfolioGrid';
import '../components/zones/zones.css';
import './TalentFullView.css';

const scrollToThread = () =>
  document.getElementById('talent-thread')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

const daysAgo = (ts) => Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
const measure = (v) => (v != null ? `${v} cm` : '—');

export default function TalentFullView() {
  const { applicationId } = useParams();
  const navigate = useNavigate();

  const appQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });
  if (appQuery.isLoading) {
    return <div className="tfv"><div className="tfv-loading">Loading profile…</div></div>;
  }
  if (appQuery.isError) {
    return (
      <div className="tfv">
        <button className="tfv-back" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
        <div className="tfv-loading">Couldn't load this profile.</div>
      </div>
    );
  }

  const { application, profile } = appQuery.data || {};
  const images = profile?.images || [];
  const hero = images[0]?.path || null;
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Talent';
  const archetype = profile?.archetype || 'editorial';
  const location = profile?.city || null;
  const match = application?.match_score;
  const bio = profile?.bio_curated || profile?.bio_raw;

  const ledger = [
    { label: 'Status', value: application?.status ? application.status.charAt(0).toUpperCase() + application.status.slice(1) : '—' },
    { label: 'Match', value: match != null ? `${Math.round(match)}%` : '—' },
    { label: 'Days Active', value: application?.created_at ? daysAgo(application.created_at) : '—' },
    { label: 'Height', value: profile?.height_cm ? `${profile.height_cm}` : '—', suffix: profile?.height_cm ? 'cm' : '' },
  ];

  return (
    <motion.div className="tfv" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      {/* top bar */}
      <div className="tfv-top">
        <button className="tfv-back" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
        <div className="tfv-actions">
          <TalentActionBar
            applicationId={applicationId}
            profileId={profile?.id}
            slug={profile?.slug}
            status={application?.status}
            context="overview"
            onMessage={scrollToThread}
          />
        </div>
      </div>

      {/* hero */}
      <div className="tfv-hero">
        <div className="tfv-portrait">
          {hero ? <img src={hero} alt={name} /> : <span className="tfv-portrait-fallback">{name.charAt(0)}</span>}
        </div>
        <div className="tfv-identity">
          <div className="tfv-eyebrow">{archetype}{location ? ` · ${location}` : ''}</div>
          <h1 className="tfv-name">{name}</h1>
          <div className="tfv-id-row">
            <TalentStatusBadge status={application?.status || 'available'} />
            {match != null && (
              <MatchScoreBadge
                score={match}
                size="md"
                tone="light"
                className="tfv-match"
              />
            )}
          </div>
          {bio && <p className="tfv-lead">{bio}</p>}
          <div className="tfv-ledger">
            {ledger.map((s) => (
              <div key={s.label} className="tfv-stat">
                <span className="tfv-stat-label">{s.label}</span>
                <span className="tfv-stat-value">{s.value}{s.suffix ? <span className="tfv-stat-suffix">{s.suffix}</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* body */}
      <div className="tfv-grid">
        <div className="tfv-main">
          <section className="tfv-section">
            <h2 className="tfv-section-title">Portfolio{images.length ? <span className="tfv-section-count">{images.length}</span> : null}</h2>
            <PortfolioGrid images={images} />
          </section>
          {bio && (
            <section className="tfv-section">
              <h2 className="tfv-section-title">Bio</h2>
              <p className="zone-bio">{bio}</p>
            </section>
          )}
        </div>

        <aside className="tfv-aside">
          <section className="tfv-section">
            <h2 className="tfv-section-title">Measurements</h2>
            <div className="measure-strip">
              {[
                { label: 'Height', value: profile?.height_cm },
                { label: 'Bust', value: profile?.bust_cm },
                { label: 'Waist', value: profile?.waist_cm },
                { label: 'Hips', value: profile?.hips_cm },
              ].map(({ label, value }) => (
                <div key={label} className="measure-chip">
                  <span className="measure-label">{label}</span>
                  <span className="measure-value">{measure(value)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="tfv-section">
            <h2 className="tfv-section-title">Communication</h2>
            <TalentThread applicationId={applicationId} />
          </section>
        </aside>
      </div>
    </motion.div>
  );
}
