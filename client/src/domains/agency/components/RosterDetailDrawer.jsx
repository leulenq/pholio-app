import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Maximize2, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchRosterProfile, updateRosterMembership } from '../api/agency';
import { AgencyButton, getStatusMeta, SkeletonRow } from './ui';
import { EmptyErrorState } from '../../../shared/components/states';
import {
  STAGE_LABELS,
  normalizeStatusKey,
  heightLine,
  measurementSummary,
  measurementAge,
} from '../pages/rosterFormat';
import './RosterDetailDrawer.css';

const STAGE_ORDER = ['main', 'development', 'new_face'];

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

/**
 * Physical ledger — prefers the canonical, track-driven `stats.fields` from the
 * Pholio profile DTO; falls back to the list row's height + measurement summary
 * for private agency records that carry no canonical stats.
 */
function useLedgerRows(item, talent) {
  return useMemo(() => {
    const fields = talent?.stats?.fields;
    if (Array.isArray(fields) && fields.length) {
      return fields.map((field) => ({ label: field.label, value: field.value }));
    }
    const rows = [];
    if (item.heightCm) rows.push({ label: 'Height', value: heightLine(item.heightCm) });
    const measure = measurementSummary(item);
    if (measure !== 'Measurements incomplete') rows.push({ label: 'Measurements', value: measure });
    return rows;
  }, [item, talent]);
}

export default function RosterDetailDrawer({ item, boards, onClose, onChanged }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [carouselIdx, setCarouselIdx] = useState(0);

  const detailQuery = useQuery({
    queryKey: ['agency', 'roster-detail', item.id],
    queryFn: () => fetchRosterProfile(item.id),
  });
  const detail = detailQuery.data;
  const talent = detail?.talent || null;
  const membership = detail?.membership || null;

  const mutation = useMutation({
    mutationFn: (updates) => updateRosterMembership(item.id, updates),
    onSuccess: (_data, updates) => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'roster-detail', item.id] });
      onChanged?.();
      if (updates?.status && updates.status !== 'active') {
        toast.success('Moved out of the active roster');
        onClose?.();
      } else {
        toast.success('Roster updated');
      }
    },
    onError: () => toast.error('Could not update this talent'),
  });

  const images = useMemo(() => {
    const fromProfile = Array.isArray(talent?.images)
      ? talent.images.map((img) => img.url || img.path).filter(Boolean)
      : [];
    if (fromProfile.length) return fromProfile;
    return item.imageUrl ? [item.imageUrl] : [];
  }, [talent, item.imageUrl]);
  const multi = images.length > 1;
  const activeImage = images[Math.min(carouselIdx, images.length - 1)];

  const ledger = useLedgerRows(item, talent);
  const division = item.board?.name || 'Unassigned';
  const availabilityMeta = getStatusMeta(normalizeStatusKey(item.availability));
  const bio = talent?.bio_curated || null;
  const social = Array.isArray(talent?.social) ? talent.social.filter((s) => s?.url || s?.handle) : [];
  const sourceApplicationId = membership?.source_application_id || null;

  const identityFacts = useMemo(() => {
    const facts = [];
    if (item.location) facts.push(item.location);
    if (talent?.gender) facts.push(talent.gender);
    if (talent?.age != null) facts.push(`${talent.age}`);
    if (talent?.nationality) facts.push(talent.nationality);
    return facts;
  }, [item.location, talent]);

  const isActive = item.membershipStatus === 'active';

  return (
    <>
      <motion.div
        className="rd-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.aside
        className="rd-panel"
        role="dialog"
        aria-label={`${item.name} roster detail`}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 240, damping: 30, mass: 0.9 }}
      >
        <header className="rd-hero">
          {activeImage ? (
            <>
              <motion.img
                key={activeImage}
                src={activeImage}
                className="rd-hero-img"
                alt={item.name}
                initial={{ scale: 1.05, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
              <div className="rd-hero-veil" />
            </>
          ) : (
            <div className="rd-hero-fallback" aria-hidden="true">{getInitials(item.name)}</div>
          )}

          {multi && (
            <>
              <button
                type="button"
                className="rd-arrow rd-arrow--prev"
                onClick={() => setCarouselIdx((i) => (i - 1 + images.length) % images.length)}
                aria-label="Previous photo"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                className="rd-arrow rd-arrow--next"
                onClick={() => setCarouselIdx((i) => (i + 1) % images.length)}
                aria-label="Next photo"
              >
                <ChevronRight size={17} />
              </button>
              <div className="rd-ticks">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={`rd-tick${i === carouselIdx ? ' is-active' : ''}`}
                    onClick={() => setCarouselIdx(i)}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="rd-hero-controls">
            {sourceApplicationId && (
              <button
                type="button"
                className="rd-ctl"
                onClick={() => navigate(`/dashboard/agency/talent/${sourceApplicationId}`)}
                aria-label="Open full profile"
                title="Open full profile"
              >
                <Maximize2 size={15} strokeWidth={1.8} />
              </button>
            )}
            <button type="button" className="rd-ctl" onClick={onClose} aria-label="Close detail">
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>

          <div className="rd-identity">
            <h2 className="rd-name">{item.name}</h2>
            <p className="rd-facts">
              {STAGE_LABELS[item.stage] || STAGE_LABELS.main} · {division}
              {identityFacts.length ? ` · ${identityFacts.join(' · ')}` : ''}
            </p>
            {availabilityMeta && (
              <p className="rd-availability" style={{ color: availabilityMeta.color }}>
                {availabilityMeta.label}
              </p>
            )}
          </div>
        </header>

        <div className="rd-body">
          {detailQuery.isLoading ? <SkeletonRow lines={5} /> : null}
          {detailQuery.isError ? (
            <EmptyErrorState
              title="Details could not be loaded"
              actionLabel="Try again"
              onAction={() => detailQuery.refetch()}
            />
          ) : null}

          {bio ? <p className="rd-bio">{bio}</p> : null}

          <section className="rd-section">
            <h3 className="rd-label">Placement</h3>
            <label className="rd-field">
              <span>Division</span>
              <select
                value={membership?.board_id || ''}
                onChange={(event) => mutation.mutate({ boardId: event.target.value || null })}
                disabled={mutation.isPending || !membership}
              >
                <option value="">Unassigned</option>
                {boards.map((board) => (
                  <option value={board.id} key={board.id}>{board.name}</option>
                ))}
              </select>
            </label>
            <div className="rd-field">
              <span>Stage</span>
              <div className="rd-segmented" role="group" aria-label="Stage">
                {STAGE_ORDER.map((key) => {
                  const active = (membership?.stage || item.stage || 'main') === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`rd-segment${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      disabled={mutation.isPending || !membership}
                      onClick={() => !active && mutation.mutate({ stage: key })}
                    >
                      {STAGE_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {ledger.length ? (
            <section className="rd-section">
              <h3 className="rd-label">Measurements</h3>
              <dl className="rd-ledger">
                {ledger.map((row) => (
                  <div className="rd-ledger-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="rd-note">{measurementAge(item.measurementsUpdatedAt)}</p>
            </section>
          ) : null}

          {Array.isArray(detail?.commitments) && detail.commitments.length ? (
            <section className="rd-section">
              <h3 className="rd-label">Current &amp; recent commitments</h3>
              <ul className="rd-commitments">
                {detail.commitments.slice(0, 6).map((commitment) => (
                  <li key={commitment.id}>
                    <strong>{commitment.kind === 'bookout' ? 'Booked out' : commitment.kind}</strong>
                    <span>
                      {commitment.start_date || 'Date pending'} — {commitment.end_date || 'Date pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {social.length ? (
            <section className="rd-section">
              <h3 className="rd-label">Links</h3>
              <div className="rd-links">
                {social.map((account) => (
                  <a
                    key={`${account.platform}-${account.handle}`}
                    className="rd-link"
                    href={account.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>{account.handle ? `@${account.handle.replace(/^@/, '')}` : account.platform}</span>
                    <ArrowUpRight size={14} strokeWidth={1.9} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="rd-foot">
          {isActive ? (
            <AgencyButton
              variant="secondary"
              onClick={() => mutation.mutate({ status: 'inactive' })}
              loading={mutation.isPending}
            >
              Move to inactive
            </AgencyButton>
          ) : (
            <AgencyButton
              variant="secondary"
              onClick={() => mutation.mutate({ status: 'active' })}
              loading={mutation.isPending}
            >
              Return to active roster
            </AgencyButton>
          )}
          {sourceApplicationId ? (
            <AgencyButton onClick={() => navigate(`/dashboard/agency/talent/${sourceApplicationId}`)}>
              Open full profile
            </AgencyButton>
          ) : null}
        </footer>
      </motion.aside>
    </>
  );
}
