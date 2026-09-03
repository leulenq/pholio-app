import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import { CardMeta, Figure, MetaLine, Notation } from '../../components/meta';
import { getStatusLabel } from '../../components/ui/StatusText';
import { eventExportUrl, getEventLineup, offerEventSlots } from '../../api/agency';
import {
  OFFERED_APPLICATION_STATUSES,
  isConfirmedApplicationStatus,
  isOfferedApplicationStatus,
  isTalentDeclinedApplicationStatus,
} from '../../../../shared/constants/applicationStatus';
import './events.css';

/**
 * The lineup — where designer opinion becomes a booking.
 *
 * Two readings of the same JOIN, because an organizer asks two questions: what
 * did each designer say, and who is claimed and by how many. The second is the
 * one an Offer sits on, sorted most-wanted first, because an applicant three
 * designers picked is the one to lock before somebody else books them.
 *
 * Offering is the only action here that touches an application. It writes the
 * ordinary `accepted` status through the ordinary notification path; the
 * applicant answers from their own dashboard, and only their answer produces a
 * confirmation.
 */

/**
 * Where the applicant stands, in the house status vocabulary.
 *
 * An offer reads exactly as it reads everywhere else in the product, because
 * it IS the same status: the organizer's "Offer slot" writes the ordinary
 * offered status through the ordinary path. The two talent answers are the
 * event's own words for what the applicant did with that slot.
 */
function standing(applicant) {
  if (isConfirmedApplicationStatus(applicant.status)) return 'Confirmed';
  if (isTalentDeclinedApplicationStatus(applicant.status)) return 'Declined the slot';
  if (applicant.offeredAt || isOfferedApplicationStatus(applicant.status)) {
    return getStatusLabel(OFFERED_APPLICATION_STATUSES[0]);
  }
  return null;
}

function claimLine(applicant) {
  const parts = [];
  if (applicant.pickedBy.length > 0) {
    parts.push(
      `Picked by ${applicant.pickedBy.map((d) => d.designerName).join(', ')}`,
    );
  }
  if (applicant.maybeBy.length > 0) {
    parts.push(`Maybe: ${applicant.maybeBy.map((d) => d.designerName).join(', ')}`);
  }
  return parts;
}

export default function LineupPanel({ linkId }) {
  const qc = useQueryClient();
  const [offering, setOffering] = useState(null);

  const lineupQuery = useQuery({
    queryKey: ['agency-event-lineup', linkId],
    queryFn: () => getEventLineup(linkId),
    staleTime: 30_000,
  });

  const offer = useMutation({
    mutationFn: (applicant) =>
      offerEventSlots(linkId, {
        applicationIds: [applicant.applicationId],
        pickListId: applicant.pickedBy[0]?.pickListId || null,
      }),
    onMutate: (applicant) => setOffering(applicant.applicationId),
    onSettled: () => setOffering(null),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agency-event-lineup', linkId] });
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['agency-event-calls'] });
      if (data.offered.length > 0) {
        toast.success('Slot offered');
        return;
      }
      const reason = data.skipped[0]?.reason;
      toast.error(
        reason === 'already_offered'
          ? 'This applicant already holds a slot on this call'
          : reason === 'already_confirmed'
            ? 'This applicant has already confirmed'
            : 'Could not offer the slot',
      );
    },
    onError: (error) => toast.error(error?.message || 'Could not offer the slot'),
  });

  const data = lineupQuery.data;
  const designers = data?.designers || [];
  const applicants = data?.applicants || [];

  return (
    <section className="ev-panel" aria-label="Lineup">
      <div className="ev-panel-head">
        <div>
          <h2 className="ev-panel-title">Lineup</h2>
          <p className="ev-panel-sub">
            Everyone a designer has picked or flagged, most-wanted first.
            Offering a slot notifies the applicant; they confirm or decline from
            their own dashboard.
          </p>
        </div>
        <div className="ev-panel-actions">
          <AgencyButton
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => {
              window.location.assign(eventExportUrl(linkId));
            }}
          >
            Export call sheet
          </AgencyButton>
        </div>
      </div>

      {lineupQuery.isLoading ? (
        <>
          <div className="ev-skel" />
          <div className="ev-skel" />
        </>
      ) : applicants.length === 0 ? (
        <p className="ev-empty">
          No designer has marked anybody yet. Once their lists come back, the
          people they want appear here.
        </p>
      ) : (
        <>
          <div className="ev-hero-figures">
            <Figure label="Claimed" value={String(data.counts.claimed)} size="sm" />
            <Figure label="Offered" value={String(data.counts.offered)} size="sm" />
            <Figure label="Confirmed" value={String(data.counts.confirmed)} size="sm" />
          </div>

          {designers.length > 0 && (
            <div className="ev-designers">
              {designers.map((designer) => (
                <div key={designer.pickListId} className="ev-designer">
                  <h3 className="ev-designer-name">{designer.designerName}</h3>
                  <MetaLine>
                    <Notation size="sm">
                      {designer.picks.length} picked
                      {designer.slotsRequested
                        ? ` of ${designer.slotsRequested} looks`
                        : ''}
                    </Notation>
                    {designer.maybes.length > 0 && (
                      <Notation size="sm">{designer.maybes.length} maybe</Notation>
                    )}
                  </MetaLine>
                  {designer.picks.length > 0 ? (
                    <ul className="ev-designer-picks">
                      {designer.picks.map((pick) => (
                        <li key={pick.applicationId}>{pick.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <Notation size="sm">Nothing marked yet</Notation>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 className="ev-subhead">Who to book</h3>
          <ul className="ev-rows">
            {applicants.map((applicant) => {
              const state = standing(applicant);
              const claims = claimLine(applicant);
              const offered = Boolean(applicant.offeredAt) || Boolean(state);
              return (
                <li key={applicant.applicationId} className="ev-row">
                  <div className="ev-row-main">
                    <span className="ev-row-name">{applicant.name}</span>
                    {/* The facts, then where they stand. The claims are the
                        reason this row exists, so they lead when nothing has
                        been offered yet and follow once something has. */}
                    <CardMeta
                      className="ev-row-spec"
                      figures={{ heightCm: applicant.heightCm, age: applicant.age }}
                      context={{ city: applicant.city }}
                      stage={{ text: state || claims.join(' · ') || null }}
                    />
                    {state && claims.length > 0 && (
                      <div className="ev-row-line">
                        <Notation size="sm">{claims.join(' · ')}</Notation>
                      </div>
                    )}
                    {applicant.notes.map((note) => (
                      <div key={`${note.designerName}-${note.note}`} className="ev-row-line">
                        <Notation attributed size="sm">
                          {note.designerName}: {note.note}
                        </Notation>
                      </div>
                    ))}
                  </div>
                  <div className="ev-row-actions">
                    {!offered && (
                      <AgencyButton
                        variant="primary"
                        size="sm"
                        loading={offering === applicant.applicationId}
                        disabled={offer.isPending}
                        onClick={() => offer.mutate(applicant)}
                      >
                        Offer slot
                      </AgencyButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
