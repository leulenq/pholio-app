import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getPickList, savePickSelection, submitPickList } from '../api/picks';
import PickCard from '../components/PickCard';
import './PickListPage.css';

/**
 * The designer's pick list — a public page reached only by an emailed token.
 *
 * Shape follows `domains/messaging/pages/ReplyPage.jsx` (loading / invalid /
 * ready, useQuery + useMutation, sonner, its own stylesheet, no dashboard
 * chrome) because the situation is the same: someone outside Pholio doing one
 * job through one link.
 *
 * It wears the AGENCY design system, not the talent one. The reader is a
 * professional buyer looking at a lineup, so the surface is the cream editorial
 * ledger — Playfair on the event name and nowhere else, Inter for every control
 * and figure, gold reserved for the pick they have actually made.
 *
 * Every failure to resolve the token lands in one identical state. The server
 * refuses to say whether a link was revoked, expired or never real, and this
 * page must not invent the distinction.
 */

const COMPENSATION_LABELS = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  stipend: 'Stipend',
};

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function eventDates(event) {
  const from = formatDate(event?.startsOn);
  const to = formatDate(event?.endsOn);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || null;
}

export default function PickListPage() {
  const { token } = useParams();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['pick-list', token], [token]);
  const [savingId, setSavingId] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => getPickList(token),
    enabled: !!token,
    retry: false,
  });

  /**
   * Write straight into the cache instead of invalidating. A refetch would
   * re-download up to 120 applicants and their media for every single mark,
   * and the server has already told us the selection it stored.
   */
  const applySelection = (applicationId, selection) => {
    queryClient.setQueryData(queryKey, (previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        applicants: previous.applicants.map((applicant) =>
          applicant.applicationId === applicationId
            ? { ...applicant, selection }
            : applicant,
        ),
      };
    });
  };

  const save = useMutation({
    mutationFn: ({ applicationId, mark, note }) =>
      savePickSelection(token, applicationId, { mark, note }),
    onMutate: ({ applicationId }) => setSavingId(applicationId),
    onSuccess: (result, variables) => {
      applySelection(
        variables.applicationId,
        result?.selection
          ? {
              mark: result.selection.mark,
              note: result.selection.note ?? null,
              markedAt: new Date().toISOString(),
            }
          : null,
      );
    },
    onError: (err) => {
      toast.error(err.message || 'Could not save that pick');
    },
    onSettled: () => setSavingId(null),
  });

  const submit = useMutation({
    mutationFn: () => submitPickList(token),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, (previous) =>
        previous
          ? { ...previous, list: { ...previous.list, submittedAt: result.submittedAt } }
          : previous,
      );
      toast.success('Your list was sent to the organizer');
    },
    onError: (err) => {
      toast.error(err.message || 'Could not send your list');
    },
  });

  const applicants = useMemo(() => data?.applicants || [], [data?.applicants]);
  const counts = useMemo(() => {
    const tally = { pick: 0, maybe: 0, pass: 0 };
    for (const applicant of applicants) {
      const mark = applicant.selection?.mark;
      if (mark && tally[mark] !== undefined) tally[mark] += 1;
    }
    return tally;
  }, [applicants]);

  if (isLoading) {
    return (
      <div className="pk-page">
        <div className="pk-page__center">
          <Loader2 className="pk-page__spinner" aria-hidden="true" />
          <p>Loading the lineup…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="pk-page">
        <div className="pk-page__center pk-page__center--error">
          <AlertCircle size={32} aria-hidden="true" />
          <h1>This link is no longer available</h1>
          <p>
            {error?.message ||
              'Ask the organizer to send you a new link to this list.'}
          </p>
        </div>
      </div>
    );
  }

  const { event, list } = data;
  const readOnly = Boolean(list.readOnly);
  const dates = eventDates(event);
  const compensation = event?.compensation;

  return (
    <div className="pk-page">
      <motion.header
        className="pk-masthead"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="pk-masthead__inner">
          <h1 className="pk-masthead__event">{event?.name || 'Casting'}</h1>
          <p className="pk-masthead__meta">
            {[event?.organizerName, dates, event?.location]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {compensation && (
            <p className="pk-masthead__compensation">
              {COMPENSATION_LABELS[compensation.type] || compensation.type}
              {compensation.details ? ` — ${compensation.details}` : ''}
            </p>
          )}
          {list.organizerNote && (
            <p className="pk-masthead__note">{list.organizerNote}</p>
          )}
          <p className="pk-masthead__brief">
            {list.designerName ? `${list.designerName}, ` : ''}
            {list.slotsRequested
              ? `pick up to ${list.slotsRequested} from these ${applicants.length}.`
              : `${applicants.length} to review.`}
          </p>
          {readOnly && (
            <p className="pk-masthead__closed">
              This list is closed. Your picks are shown as you left them.
            </p>
          )}
        </div>
      </motion.header>

      <main className="pk-main">
        {applicants.length === 0 ? (
          <div className="pk-page__center">
            <p>The organizer has not added anyone to this list yet.</p>
          </div>
        ) : (
          <div className="pk-grid">
            {applicants.map((applicant) => (
              <PickCard
                key={applicant.applicationId}
                applicant={applicant}
                readOnly={readOnly}
                saving={savingId === applicant.applicationId}
                onMark={(mark) =>
                  save.mutate({
                    applicationId: applicant.applicationId,
                    mark,
                    note: applicant.selection?.note || null,
                  })
                }
                onNote={(note) =>
                  save.mutate({
                    applicationId: applicant.applicationId,
                    mark: applicant.selection?.mark,
                    note,
                  })
                }
              />
            ))}
          </div>
        )}
      </main>

      {applicants.length > 0 && (
        <motion.footer
          className="pk-dock"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="pk-dock__inner">
            <p className="pk-dock__tally">
              <span className="pk-dock__count">{counts.pick}</span> picked
              <span className="pk-dock__sep">·</span>
              <span className="pk-dock__count">{counts.maybe}</span> maybe
              <span className="pk-dock__sep">·</span>
              <span className="pk-dock__count">{counts.pass}</span> passed
            </p>
            {list.submittedAt && (
              <p className="pk-dock__sent">
                <Check size={14} aria-hidden="true" />
                Sent to the organizer
              </p>
            )}
            <button
              type="button"
              className="pk-dock__submit"
              disabled={readOnly || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending
                ? 'Sending…'
                : list.submittedAt
                  ? 'Send updates'
                  : 'Send my list'}
            </button>
          </div>
        </motion.footer>
      )}
    </div>
  );
}
