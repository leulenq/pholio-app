import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { canAnswerSlotOffer, canWithdrawApplication } from '../../utils/applicationStatus';
import { boardList, countOf, longDate } from '../../lib/marketFormat';
import {
  formatTrackerDate,
  trackerChannelLabel,
  trackerStatusConfig,
} from '../../utils/submissionTracker';
import { TRACKER_STATUS } from '../../../../shared/constants/submissionTracker';

/**
 * One submission, opened.
 *
 * The section is called Submission History and until now it could answer none
 * of the questions in that phrase. Two things fix it, both of which already
 * existed and neither of which was reachable:
 *
 *   the receipt — the frozen package, so "what did they actually get" has a
 *   true answer. The old panel linked to the talent's current book and comp
 *   card, which shows what they have *now*; a book edited since is a different
 *   book, and the link quietly claimed otherwise.
 *
 *   the chronology — `application_activities`, which has recorded every status
 *   change all along and was never drawn.
 *
 * A record recorded off Pholio has neither, and says so rather than implying a
 * receipt Pholio never held.
 */

/** Matches the server's cap on `off_platform_submissions.outcome_note`. */
const MAX_OUTCOME_NOTE = 300;

const TIMELINE_WORDS = Object.freeze({
  submitted: 'Sent',
  status_change: 'Status changed',
  accepted: 'Advanced',
  declined: 'Declined',
  booked: 'Booked',
  note_added: 'Note added',
});

function timelineWord(type) {
  return TIMELINE_WORDS[type] || 'Updated';
}

function Timeline({ events }) {
  if (!events?.length) return null;
  return (
    <ol className="sr-time">
      {events.map((event) => (
        <li key={event.id} className="sr-time__row">
          <span className="sr-time__date">{longDate(event.at)}</span>
          <span className="sr-time__mark" aria-hidden />
          <span className="sr-time__what">
            <b>{timelineWord(event.type)}</b>
            {event.description ? <span>{event.description}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The receipt half — only ever what the frozen package actually holds. */
function Receipt({ sent }) {
  if (!sent) {
    return (
      <p className="sr-body">
        Pholio holds no package for this submission. It predates submission receipts.
      </p>
    );
  }
  if (!sent.available) {
    return (
      <p className="sr-body">
        The package was {sent.reason === 'redacted' ? 'redacted' : 'withdrawn'} and is no
        longer held. It was sent on {longDate(sent.at)}.
      </p>
    );
  }
  const boards = boardList(sent.boards, 4);
  return (
    <>
      <p className="sr-lede">
        {sent.frameCount != null ? countOf(sent.frameCount, 'frame') : 'A package'} sent on{' '}
        {longDate(sent.at)}.
      </p>
      <dl className="sr-facts">
        {sent.mediaSetName ? (
          <div>
            <dt>Set</dt>
            <dd>{sent.mediaSetName}</dd>
          </div>
        ) : null}
        {sent.compCardName ? (
          <div>
            <dt>Comp card</dt>
            <dd>{sent.compCardName}</dd>
          </div>
        ) : null}
        {boards.length ? (
          <div>
            <dt>Boards</dt>
            <dd>{boards.join(' · ')}</dd>
          </div>
        ) : null}
      </dl>
      <p className="sr-note">
        This is the package as it left — frozen on the day. Your book has kept changing
        since.
      </p>
    </>
  );
}

/** An on-Pholio submission: Pholio carried it, so Pholio can account for it. */
function PholioRecord({ app, onWithdraw, isWithdrawing, onMessage, onAnswerSlot, isAnsweringSlot }) {
  const canWithdraw = canWithdrawApplication(app.status);
  const canAnswer = canAnswerSlotOffer(app);
  const query = useQuery({
    queryKey: ['application-record', app.id],
    queryFn: () => talentApi.getApplicationRecord(app.id),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const record = query.data?.data ?? query.data ?? null;

  return (
    <div className="sr">
      {query.isLoading ? (
        <p className="sr-waiting" role="status">
          <Loader2 size={14} className="app-spin" aria-hidden /> Opening the record…
        </p>
      ) : (
        <div className="sr-grid">
          <section className="sr-col">
            <h4 className="sr-label">What they received</h4>
            <Receipt sent={record?.sent} />
          </section>

          <section className="sr-col">
            <h4 className="sr-label">Since then</h4>
            {record?.timeline?.length ? (
              <Timeline events={record.timeline} />
            ) : (
              <p className="sr-body">
                Nothing has moved yet. Pholio will record it here the moment it does.
              </p>
            )}
          </section>

          {app.note ? (
            <section className="sr-col">
              <h4 className="sr-label">Your message</h4>
              <p className="sr-quote">{app.note}</p>
            </section>
          ) : null}
        </div>
      )}

      {/* A live slot offer is the only thing here with a clock on it, so it
          leads the actions rather than sitting among them. */}
      {canAnswer ? (
        <div className="sr-acts sr-acts--offer">
          <button
            type="button"
            className="sr-act"
            onClick={() => onAnswerSlot?.(app, true)}
            disabled={isAnsweringSlot}
          >
            {isAnsweringSlot ? 'Sending…' : 'Confirm the slot'}
          </button>
          <button
            type="button"
            className="sr-act sr-act--quiet"
            onClick={() => onAnswerSlot?.(app, false)}
            disabled={isAnsweringSlot}
          >
            Decline it
          </button>
        </div>
      ) : null}

      <div className="sr-acts">
        <button type="button" className="sr-act" onClick={() => onMessage?.(app)}>
          Message them <ArrowUpRight size={13} aria-hidden />
        </button>
        {canWithdraw ? (
          <button
            type="button"
            className="sr-act sr-act--quiet"
            onClick={() => onWithdraw?.(app)}
            disabled={isWithdrawing}
          >
            {isWithdrawing ? 'Withdrawing…' : 'Withdraw this submission'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A submission the talent made themselves and recorded here.
 *
 * Pholio never saw it leave, so it never claims to know what was in it beyond
 * what the talent logged. Saying that plainly is the difference between a
 * record and a pretence of one.
 *
 * It is also the only kind of record the talent can move themselves: nobody
 * else can report an answer that arrived in their own inbox, so recording a
 * reply and closing a record both live here.
 */
function LoggedRecord({ row, onDelete }) {
  const queryClient = useQueryClient();
  const [answering, setAnswering] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState(row.outcomeNote || '');
  const files = row.sentSummary?.fileCount ?? null;

  const update = useMutation({
    mutationFn: (payload) => talentApi.updateTrackedSubmission(row.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
      setAnswering(false);
    },
    onError: (err) => toast.error(err?.message || 'That change could not be saved.'),
  });

  /*
    The router rejects a PATCH whose every field already holds the value being
    sent, so only what genuinely changes goes over the wire.
  */
  const recordReply = () => {
    const payload = {};
    if (row.status !== TRACKER_STATUS.HEARD_BACK) payload.status = TRACKER_STATUS.HEARD_BACK;
    const next = outcomeDraft.trim();
    if (next !== (row.outcomeNote || '')) payload.outcomeNote = next || null;
    if (Object.keys(payload).length === 0) {
      setAnswering(false);
      return;
    }
    update.mutate(payload);
  };

  const closeRecord = () => {
    if (row.status === TRACKER_STATUS.CLOSED_BY_TALENT) return;
    update.mutate({ status: TRACKER_STATUS.CLOSED_BY_TALENT });
  };

  const open = row.status !== TRACKER_STATUS.CLOSED_BY_TALENT;

  return (
    <div className="sr">
      <div className="sr-grid">
        <section className="sr-col">
          <h4 className="sr-label">What you sent</h4>
          <p className="sr-lede">
            {files != null ? countOf(files, 'image') : 'A package'} on{' '}
            {formatTrackerDate(row.submittedOn)}.
          </p>
          <p className="sr-note">
            You sent this yourself, {trackerChannelLabel(row.channel).toLowerCase()}. Pholio
            recorded it on your word — it never held the package.
          </p>
        </section>

        <section className="sr-col">
          <h4 className="sr-label">Since then</h4>
          {row.status === TRACKER_STATUS.HEARD_BACK ? (
            <p className="sr-body">You recorded a reply.</p>
          ) : row.status === TRACKER_STATUS.CLOSED_BY_TALENT ? (
            <p className="sr-body">You closed this record.</p>
          ) : (
            /*
              The lapse and waiting sentences come from `trackerStatusConfig`,
              not from here. That vocabulary is shared with the row's own status
              and with ruling R1's lapse computation; writing a second version
              of it on this surface is how two screens start disagreeing about
              what silence means.
            */
            <p className="sr-body">{trackerStatusConfig(row).next}</p>
          )}
          {row.outcomeNote ? <p className="sr-quote">{row.outcomeNote}</p> : null}
        </section>

        {row.note ? (
          <section className="sr-col">
            <h4 className="sr-label">Your note</h4>
            <p className="sr-quote">{row.note}</p>
          </section>
        ) : null}
      </div>

      {answering ? (
        <div className="sr-answer">
          <label className="sr-answer__label" htmlFor={`outcome-${row.id}`}>
            What they said
          </label>
          <textarea
            id={`outcome-${row.id}`}
            className="sr-answer__field"
            value={outcomeDraft}
            maxLength={MAX_OUTCOME_NOTE}
            rows={3}
            onChange={(event) => setOutcomeDraft(event.target.value)}
            placeholder="Optional — a line for your own record"
          />
          <div className="sr-acts">
            <button
              type="button"
              className="sr-act"
              onClick={recordReply}
              disabled={update.isPending}
            >
              {update.isPending ? 'Saving…' : 'Record reply'}
            </button>
            <button
              type="button"
              className="sr-act sr-act--quiet"
              onClick={() => setAnswering(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="sr-acts">
          {open ? (
            <button type="button" className="sr-act" onClick={() => setAnswering(true)}>
              Heard back
            </button>
          ) : null}
          {open ? (
            <button
              type="button"
              className="sr-act sr-act--quiet"
              onClick={closeRecord}
              disabled={update.isPending}
            >
              Close record
            </button>
          ) : null}
          {row.destinationUrl ? (
            <a
              className="sr-act sr-act--quiet"
              href={row.destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open where you sent it <ArrowUpRight size={13} aria-hidden />
            </a>
          ) : null}
          <button
            type="button"
            className="sr-act sr-act--quiet"
            onClick={() => onDelete?.(row)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function SubmissionRecord({ entry, ...handlers }) {
  return entry.kind === 'application' ? (
    <PholioRecord app={entry.app} {...handlers} />
  ) : (
    <LoggedRecord row={entry.row} {...handlers} />
  );
}
