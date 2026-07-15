import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  confirmCommitment,
  createCommitment,
  getCommitments,
  releaseCommitment,
  updateCommitment,
} from '../api/agency';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import { AgencyButton, AgencyModal, SkeletonRow } from '../components/ui';
import { EmptyErrorState } from '../../../shared/components/states';
import './BookingDeskPage.css';

const EMPTY_FORM = Object.freeze({
  membershipId: '',
  kind: 'option',
  optionTier: '1',
  startDate: '',
  endDate: '',
  clientRef: '',
  market: '',
  notes: '',
});

function isoDate(date) {
  return format(date, 'yyyy-MM-dd');
}

function eventTitle(event) {
  if (event.kind === 'bookout') return 'Booked out';
  if (event.kind === 'booked') return 'Booked';
  if (event.kind === 'hold') return 'Hold';
  return `${event.optionTier || 1}${event.optionTier === 1 ? 'st' : event.optionTier === 2 ? 'nd' : event.optionTier === 3 ? 'rd' : 'th'} option`;
}

function dateRange(event) {
  if (event.startDate === event.endDate) return format(parseISO(event.startDate), 'EEE, MMM d');
  return `${format(parseISO(event.startDate), 'MMM d')}–${format(parseISO(event.endDate), 'MMM d')}`;
}

function groupedRoster(roster) {
  const groups = new Map();
  for (const talent of roster) {
    const key = talent.board?.id || 'unassigned';
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: talent.board?.name || 'Unassigned', talent: [] });
    }
    groups.get(key).talent.push(talent);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === 'unassigned') return 1;
    if (b.id === 'unassigned') return -1;
    return a.name.localeCompare(b.name);
  });
}

function CalendarEvent({ event, canManage, onOpen }) {
  const content = (
    <>
      <strong>{eventTitle(event)}</strong>
      <span>{event.clientRef || (event.source === 'talent' ? 'Talent-managed bookout' : dateRange(event))}</span>
    </>
  );
  if (!canManage || !event.canEdit) {
    return <div className={`bd-event bd-event--${event.kind}`}>{content}</div>;
  }
  return (
    <button type="button" className={`bd-event bd-event--${event.kind}`} onClick={() => onOpen(event)}>
      {content}
    </button>
  );
}

function WeekView({ days, roster, events, canManage, onOpen }) {
  const groups = groupedRoster(roster);
  const eventsByMembership = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const rows = map.get(event.membershipId) || [];
      rows.push(event);
      map.set(event.membershipId, rows);
    }
    return map;
  }, [events]);

  return (
    <div className="bd-week-scroll" tabIndex="0" aria-label="Booking calendar, horizontally scrollable">
      <div className="bd-week" style={{ '--bd-days': days.length }}>
        <div className="bd-week-head">
          <div className="bd-corner">Roster</div>
          {days.map((day) => (
            <div className={`bd-day-head${isoDate(day) === isoDate(new Date()) ? ' is-today' : ''}`} key={isoDate(day)}>
              <span>{format(day, 'EEE')}</span>
              <strong>{format(day, 'd')}</strong>
            </div>
          ))}
        </div>
        {groups.map((group) => (
          <section className="bd-division" key={group.id} aria-labelledby={`bd-division-${group.id}`}>
            <h2 id={`bd-division-${group.id}`}>{group.name}</h2>
            {group.talent.map((talent) => {
              const talentEvents = eventsByMembership.get(talent.membershipId) || [];
              return (
                <div className="bd-talent-row" key={talent.membershipId}>
                  <div className="bd-talent-name" title={talent.name}>{talent.name}</div>
                  {days.map((day) => {
                    const dayIso = isoDate(day);
                    const visible = talentEvents.filter((event) => {
                      const startsInCell = event.startDate === dayIso;
                      const carriesIntoRange = dayIso === isoDate(days[0]) && event.startDate < dayIso && event.endDate >= dayIso;
                      return startsInCell || carriesIntoRange;
                    });
                    return (
                      <div className={`bd-day-cell${dayIso === isoDate(new Date()) ? ' is-today' : ''}`} key={dayIso}>
                        {visible.map((event) => (
                          <CalendarEvent key={event.id} event={event} canManage={canManage} onOpen={onOpen} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

function FourWeekView({ roster, events, canManage, onOpen }) {
  const groups = groupedRoster(roster);
  const rosterIds = new Map(roster.map((talent) => [talent.membershipId, talent]));
  return (
    <div className="bd-agenda">
      {groups.map((group) => {
        const ids = new Set(group.talent.map((talent) => talent.membershipId));
        const groupEvents = events.filter((event) => ids.has(event.membershipId));
        return (
          <section className="bd-agenda-group" key={group.id}>
            <header>
              <h2>{group.name}</h2>
              <span>{groupEvents.length} scheduled</span>
            </header>
            {groupEvents.length ? (
              <div className="bd-agenda-list">
                {groupEvents.map((event) => (
                  <button
                    type="button"
                    key={event.id}
                    className="bd-agenda-row"
                    onClick={canManage && event.canEdit ? () => onOpen(event) : undefined}
                    disabled={!canManage || !event.canEdit}
                  >
                    <time dateTime={event.startDate}>{dateRange(event)}</time>
                    <strong>{rosterIds.get(event.membershipId)?.name || event.talentName}</strong>
                    <span>{eventTitle(event)}</span>
                    <span>{event.clientRef || event.market || (event.source === 'talent' ? 'Talent-managed' : 'Details not recorded')}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="bd-agenda-empty">No options, holds, bookings, or bookouts in this window.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CommitmentEditor({ event, roster, initialDate, onClose, onSaved }) {
  const isEdit = Boolean(event);
  const [form, setForm] = useState(() => event ? {
    membershipId: event.membershipId,
    kind: event.kind,
    optionTier: String(event.optionTier || 1),
    startDate: event.startDate,
    endDate: event.endDate,
    clientRef: event.clientRef || '',
    market: event.market || '',
    notes: event.notes || '',
  } : {
    ...EMPTY_FORM,
    membershipId: roster[0]?.membershipId || '',
    startDate: initialDate,
    endDate: initialDate,
  });
  const [conflictAction, setConflictAction] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [overlapDecision, setOverlapDecision] = useState(null);

  const captureError = (error, action) => {
    const nextConflicts = error?.data?.error?.conflicts;
    if (Array.isArray(nextConflicts) && nextConflicts.length) {
      setConflicts(nextConflicts);
      setConflictAction(action);
      return;
    }
    toast.error(error?.message || 'The calendar could not be updated');
  };

  const saveMutation = useMutation({
    mutationFn: (releaseConflictIds = []) => {
      const payload = {
        ...(isEdit ? {} : { membershipId: form.membershipId }),
        kind: form.kind,
        optionTier: form.kind === 'option' ? Number(form.optionTier) : null,
        startDate: form.startDate,
        endDate: form.endDate,
        clientRef: form.clientRef || null,
        market: form.market || null,
        notes: form.notes || null,
        releaseConflictIds,
      };
      return isEdit ? updateCommitment(event.id, payload) : createCommitment(payload);
    },
    onSuccess: (result) => {
      if (!isEdit && Array.isArray(result?.warnings) && result.warnings.length) {
        setOverlapDecision({ commitment: result.commitment, overlaps: result.warnings });
        return;
      }
      toast.success(isEdit ? 'Calendar updated' : 'Commitment added');
      onSaved();
    },
    onError: (error) => captureError(error, 'save'),
  });
  const confirmMutation = useMutation({
    mutationFn: (releaseConflictIds = []) => confirmCommitment(event.id, releaseConflictIds),
    onSuccess: () => {
      toast.success('Booking confirmed');
      onSaved();
    },
    onError: (error) => captureError(error, 'confirm'),
  });
  const releaseMutation = useMutation({
    mutationFn: () => releaseCommitment(event.id),
    onSuccess: () => {
      toast.success('Commitment released');
      onSaved();
    },
    onError: (error) => toast.error(error?.message || 'Could not release this commitment'),
  });
  const decisionConfirmMutation = useMutation({
    mutationFn: () => confirmCommitment(
      overlapDecision.commitment.id,
      overlapDecision.overlaps.filter((item) => item.releasable).map((item) => item.id),
    ),
    onSuccess: () => {
      toast.success('Overlapping options released and booking confirmed');
      onSaved();
    },
    onError: (error) => toast.error(error?.message || 'The option could not be confirmed'),
  });
  const decisionReleaseMutation = useMutation({
    mutationFn: () => releaseCommitment(overlapDecision.commitment.id),
    onSuccess: () => {
      toast.success('New option released');
      onSaved();
    },
    onError: (error) => toast.error(error?.message || 'The option could not be released'),
  });

  const update = (event_) => setForm((current) => ({ ...current, [event_.target.name]: event_.target.value }));
  const retryWithRelease = () => {
    const ids = conflicts.filter((conflict) => conflict.releasable).map((conflict) => conflict.id);
    setConflicts([]);
    if (conflictAction === 'confirm') confirmMutation.mutate(ids);
    else saveMutation.mutate(ids);
  };
  const allReleasable = conflicts.length > 0 && conflicts.every((conflict) => conflict.releasable);
  const pending = saveMutation.isPending || confirmMutation.isPending || releaseMutation.isPending
    || decisionConfirmMutation.isPending || decisionReleaseMutation.isPending;
  const decisionCanConfirm = overlapDecision?.overlaps.every((item) => item.releasable);

  return (
    <AgencyModal open onClose={pending ? undefined : onClose} title={isEdit ? `${eventTitle(event)} · ${event.talentName}` : 'Add calendar commitment'} className="bd-editor-modal">
      <form className="bd-form" onSubmit={(event_) => {
        event_.preventDefault();
        if (overlapDecision) return;
        setConflicts([]);
        saveMutation.mutate([]);
      }}>
        {!isEdit ? (
          <label>
            Talent
            <select name="membershipId" value={form.membershipId} onChange={update} required>
              {groupedRoster(roster).map((group) => (
                <optgroup label={group.name} key={group.id}>
                  {group.talent.map((talent) => <option value={talent.membershipId} key={talent.membershipId}>{talent.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}
        <div className="bd-form-row">
          <label>
            Commitment
            <select name="kind" value={form.kind} onChange={update} disabled={isEdit}>
              <option value="option">Option</option>
              <option value="hold">Hold</option>
              <option value="booked">Booked</option>
            </select>
          </label>
          {form.kind === 'option' ? (
            <label>
              Option position
              <select name="optionTier" value={form.optionTier} onChange={update}>
                <option value="1">1st option</option>
                <option value="2">2nd option</option>
                <option value="3">3rd option</option>
                <option value="4">4th option</option>
              </select>
            </label>
          ) : null}
        </div>
        <div className="bd-form-row">
          <label>
            Start date
            <input name="startDate" type="date" value={form.startDate} onChange={update} required />
          </label>
          <label>
            End date
            <input name="endDate" type="date" min={form.startDate} value={form.endDate} onChange={update} required />
          </label>
        </div>
        <label>
          Client or job
          <input name="clientRef" value={form.clientRef} onChange={update} maxLength="200" placeholder="Campaign or job reference" />
        </label>
        <label>
          Market
          <input name="market" value={form.market} onChange={update} maxLength="160" placeholder="New York, London, Paris" />
        </label>
        <label>
          Booker notes
          <textarea name="notes" value={form.notes} onChange={update} maxLength="2000" rows="3" />
        </label>

        {conflicts.length ? (
          <div className="bd-conflicts" role="alert">
            <h3>Calendar conflict</h3>
            <p>{allReleasable ? 'These options or holds must be released before this change.' : 'At least one conflict cannot be released by your agency.'}</p>
            <ul>
              {conflicts.map((conflict) => (
                <li key={`${conflict.source}:${conflict.id}`}>
                  <strong>{conflict.label}</strong>
                  <span>{format(parseISO(conflict.startDate), 'MMM d')}–{format(parseISO(conflict.endDate), 'MMM d')}</span>
                </li>
              ))}
            </ul>
            {allReleasable ? (
              <AgencyButton type="button" variant="secondary" loading={pending} onClick={retryWithRelease}>
                Release overlaps and continue
              </AgencyButton>
            ) : null}
          </div>
        ) : null}

        {overlapDecision ? (
          <div className="bd-overlap-decision" role="status">
            <h3>Ranked option overlap</h3>
            <p>
              This option was added without displacing the existing ranked options. Decide whether to keep the option order or confirm this booking now.
            </p>
            <ul>
              {overlapDecision.overlaps.map((overlap) => (
                <li key={`${overlap.source}:${overlap.id}`}>
                  <strong>{overlap.label}</strong>
                  <span>{format(parseISO(overlap.startDate), 'MMM d')}–{format(parseISO(overlap.endDate), 'MMM d')}</span>
                </li>
              ))}
            </ul>
            {!decisionCanConfirm ? (
              <p>An external option cannot be released here. Keep the ranked options or release the new option while the booker coordinates it.</p>
            ) : null}
          </div>
        ) : null}

        <div className="bd-form-actions">
          {overlapDecision ? (
            <AgencyButton type="button" variant="danger" loading={decisionReleaseMutation.isPending} onClick={() => decisionReleaseMutation.mutate()}>
              Release new option
            </AgencyButton>
          ) : isEdit ? (
            <AgencyButton type="button" variant="danger" loading={releaseMutation.isPending} onClick={() => releaseMutation.mutate()}>
              Release
            </AgencyButton>
          ) : <span />}
          <div>
            {overlapDecision ? (
              <>
                <AgencyButton type="button" variant="secondary" onClick={() => { toast.success('Ranked options kept'); onSaved(); }} disabled={pending}>
                  Keep ranked options
                </AgencyButton>
                {decisionCanConfirm ? (
                  <AgencyButton type="button" loading={decisionConfirmMutation.isPending} onClick={() => decisionConfirmMutation.mutate()}>
                    Release overlaps and confirm
                  </AgencyButton>
                ) : null}
              </>
            ) : (
              <>
                <AgencyButton type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</AgencyButton>
                {isEdit && ['option', 'hold'].includes(event.kind) ? (
                  <AgencyButton type="button" loading={confirmMutation.isPending} onClick={() => { setConflicts([]); confirmMutation.mutate([]); }}>
                    Confirm booking
                  </AgencyButton>
                ) : null}
                <AgencyButton type="submit" loading={saveMutation.isPending}>Save</AgencyButton>
              </>
            )}
          </div>
        </div>
      </form>
    </AgencyModal>
  );
}

export default function BookingDeskPage() {
  const queryClient = useQueryClient();
  const { can } = useAgencyPermissions();
  const canManage = can('calendar.manage');
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editor, setEditor] = useState(null);
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = mode === 'week'
    ? Array.from({ length: 7 }, (_, index) => addDays(start, index))
    : Array.from({ length: 28 }, (_, index) => addDays(start, index));
  const range = { start: isoDate(days[0]), end: isoDate(days[days.length - 1]) };
  const query = useQuery({
    queryKey: ['agency', 'commitments', range.start, range.end],
    queryFn: () => getCommitments(range),
  });
  const data = query.data || { roster: [], events: [] };
  const title = mode === 'week'
    ? `${format(start, 'MMMM d')}–${format(endOfWeek(start, { weekStartsOn: 1 }), 'MMMM d, yyyy')}`
    : `${format(start, 'MMMM d')}–${format(addDays(start, 27), 'MMMM d, yyyy')}`;
  const closeAfterSave = () => {
    setEditor(null);
    queryClient.invalidateQueries({ queryKey: ['agency', 'commitments'] });
    queryClient.invalidateQueries({ queryKey: ['agency', 'roster'] });
  };

  return (
    <main className="bd-page">
      <header className="bd-header">
        <div>
          <h1>Booking Desk</h1>
          <p>Options, holds, confirmed bookings, and talent-declared bookouts across the roster.</p>
        </div>
        {canManage && data.roster.length ? (
          <AgencyButton icon={CalendarPlus} onClick={() => setEditor({ event: null, initialDate: isoDate(new Date()) })}>
            Add commitment
          </AgencyButton>
        ) : null}
      </header>

      <div className="bd-toolbar" aria-label="Calendar controls">
        <div className="bd-nav-buttons">
          <button type="button" onClick={() => setAnchor((current) => addWeeks(current, mode === 'week' ? -1 : -4))} aria-label="Previous period"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
          <button type="button" onClick={() => setAnchor((current) => addWeeks(current, mode === 'week' ? 1 : 4))} aria-label="Next period"><ChevronRight size={18} /></button>
        </div>
        <strong>{title}</strong>
        <div className="bd-mode" aria-label="Calendar range">
          <button type="button" className={mode === 'week' ? 'is-active' : ''} aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Week</button>
          <button type="button" className={mode === 'four-weeks' ? 'is-active' : ''} aria-pressed={mode === 'four-weeks'} onClick={() => setMode('four-weeks')}>4 weeks</button>
        </div>
      </div>

      {query.isLoading ? <div className="bd-loading"><SkeletonRow lines={8} /></div> : null}
      {query.isError ? (
        <EmptyErrorState title="The Booking Desk could not be loaded" actionLabel="Try again" onAction={() => query.refetch()} />
      ) : null}
      {!query.isLoading && !query.isError && !data.roster.length ? (
        <div className="bd-empty">
          <h2>Your roster is empty</h2>
          <p>Add talent to the roster before recording options, holds, or bookings.</p>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && data.roster.length ? (
        mode === 'week'
          ? <WeekView days={days} roster={data.roster} events={data.events} canManage={canManage} onOpen={(event) => setEditor({ event })} />
          : <FourWeekView roster={data.roster} events={data.events} canManage={canManage} onOpen={(event) => setEditor({ event })} />
      ) : null}

      {editor ? (
        <CommitmentEditor
          event={editor.event}
          roster={data.roster}
          initialDate={editor.initialDate || range.start}
          onClose={() => setEditor(null)}
          onSaved={closeAfterSave}
        />
      ) : null}
    </main>
  );
}
