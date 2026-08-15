import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Copy, Pause, Play, Trash2, ExternalLink, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import {
  getOpenCallLinks,
  createOpenCallLink,
  updateOpenCallLink,
} from '../../api/agency';
import OpenCallBriefFields from './OpenCallBriefFields';
import EventCallFields from './EventCallFields';
import {
  EMPTY_BRIEF,
  EMPTY_EVENT_CALL,
  briefFromLink,
  callPayload,
  cloneEventCall,
  eventCallFromLink,
  isEventCallComplete,
} from './openCallBrief';
import { CALL_KINDS, isEventCastingCallKind } from '../../../../shared/constants/eventCasting';

/*
 * Open call links — the agency's own applicant funnel routed through Pholio.
 * Talent arriving through a link submit straight to this house, and those
 * invited submissions never count against their monthly Pholio limit.
 *
 * A link is one of two kinds. A representation call is the standing "become a
 * model" door. An event cast is a dated job with compensation attached, and
 * everything downstream of it — the consent an applicant signs, the retention
 * clock, the designer pick lists — hangs off that choice, so it is made here,
 * once, at the top of the form. Ruling R10: this is the same panel, with the
 * event vocabulary appearing only when the kind is set to it.
 */

function linkUrl(code) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.pholio.studio';
  return `${origin}/opencall/${code}`;
}

function formatEventDates(event) {
  if (!event?.startsOn) return null;
  if (!event.endsOn || event.endsOn === event.startsOn) return event.startsOn;
  return `${event.startsOn} – ${event.endsOn}`;
}

const COMPENSATION_SUMMARY = {
  paid: 'Paid',
  stipend: 'Stipend',
  unpaid: 'Unpaid',
};

/*
 * The kind switch. Two AgencyButtons, the same idiom as the brief's closing
 * control — a choice with two real answers reads better as two visible
 * answers than as a dropdown that hides one of them.
 */
function CallKindChoice({ value, onChange, disabled }) {
  return (
    <div className="st-field">
      <span className="st-label">
        What kind of call<span className="st-req"> *</span>
      </span>
      <div className="st-brief-deadline">
        <AgencyButton
          type="button"
          variant={isEventCastingCallKind(value) ? 'secondary' : 'primary'}
          size="sm"
          disabled={disabled}
          aria-pressed={!isEventCastingCallKind(value)}
          onClick={() => onChange(CALL_KINDS.REPRESENTATION)}
        >
          Representation
        </AgencyButton>
        <AgencyButton
          type="button"
          variant={isEventCastingCallKind(value) ? 'primary' : 'secondary'}
          size="sm"
          disabled={disabled}
          aria-pressed={isEventCastingCallKind(value)}
          onClick={() => onChange(CALL_KINDS.EVENT_CASTING)}
        >
          Event cast
        </AgencyButton>
      </div>
      <span className="st-help">
        {isEventCastingCallKind(value)
          ? 'A dated job with compensation. Applicants consent to different terms, designers can be sent a pick list, and packages are deleted 90 days after the event ends.'
          : 'A standing call for new faces. Applicants consent to representation review and the submission does not count against their monthly Pholio allowance.'}
      </span>
    </div>
  );
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function OpenCallPanel({ canManage = true }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [brief, setBrief] = useState({ ...EMPTY_BRIEF });
  const [call, setCall] = useState(() => cloneEventCall(EMPTY_EVENT_CALL));
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);
  // Which existing link is having its brief edited. Links published before the
  // brief existed keep working and are prompted to add one.
  const [editingBriefId, setEditingBriefId] = useState(null);
  const [editingBrief, setEditingBrief] = useState({ ...EMPTY_BRIEF });
  const [editingCall, setEditingCall] = useState(() => cloneEventCall(EMPTY_EVENT_CALL));

  const linksQuery = useQuery({
    queryKey: ['agency-open-call-links'],
    queryFn: getOpenCallLinks,
    staleTime: 30_000,
    retry: (failureCount, error) => error?.status !== 503 && failureCount < 2,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['agency-open-call-links'] });

  const createMutation = useMutation({
    mutationFn: () => createOpenCallLink(label.trim(), brief, callPayload(call)),
    onSuccess: () => {
      setLabel('');
      setBrief({ ...EMPTY_BRIEF });
      setCall(cloneEventCall(EMPTY_EVENT_CALL));
      invalidate();
      toast.success(
        isEventCastingCallKind(call.callKind) ? 'Event call created' : 'Open call link created',
      );
    },
    onError: (e) => toast.error(e?.data?.message || e?.message || 'Could not create the link'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateOpenCallLink(id, payload),
    onSuccess: (_data, variables) => {
      invalidate();
      if (variables.payload.status === 'revoked') {
        setConfirmRevokeId(null);
        toast.success('Link revoked');
      }
      if (variables.payload.brief) {
        setEditingBriefId(null);
        toast.success('Brief saved');
      }
    },
    onError: (e) => toast.error(e?.data?.message || e?.message || 'Could not update the link'),
  });

  const unavailable = linksQuery.error?.status === 503;
  const links = linksQuery.data || [];
  const isEventCall = isEventCastingCallKind(call.callKind);

  if (unavailable) {
    return (
      <div className="st-fieldset st-fieldset--last">
        <div className="st-empty-inline">
          <Link2 size={20} />
          <span>Open call links are not available yet.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="st-notice">
        <span className="st-notice-icon"><Link2 size={18} /></span>
        <div>
          <span className="st-notice-title">Your applicant funnel, routed through Pholio</span>
          <span className="st-notice-text">
            Put an open call link on your website or in scouting emails. Talent arriving
            through it submit straight to your house — and those invited submissions never
            count against their monthly Pholio limit.
          </span>
        </div>
      </div>

      {canManage && (
        <div className="st-fieldset">
          <div className="st-fieldset-head">
            <h3 className="st-fieldset-title">{isEventCall ? 'New event call' : 'New link'}</h3>
            <p className="st-fieldset-sub">
              {isEventCall
                ? 'Name it for the edition it belongs to — the label is only visible to your team.'
                : 'Name it for the channel it lives on — the label is only visible to your team.'}
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!label.trim() || createMutation.isPending) return;
              createMutation.mutate();
            }}
          >
            <div className="st-opencall-create">
              <input
                className="st-input"
                type="text"
                maxLength={120}
                placeholder='e.g. "Website — Become a model", "Spring scouting email"'
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                aria-label="Link label"
              />
            </div>

            <div className="st-brief">
              <CallKindChoice
                value={call.callKind}
                disabled={createMutation.isPending}
                onChange={(callKind) => setCall({ ...call, callKind })}
              />
            </div>

            {isEventCall && (
              <>
                <p className="st-help st-brief-lead">
                  The event, and the terms applicants consent to when they send.
                </p>
                <EventCallFields
                  call={call}
                  onChange={setCall}
                  disabled={createMutation.isPending}
                  idPrefix="new-event"
                />
              </>
            )}

            <p className="st-help st-brief-lead">
              {isEventCall
                ? 'Every call carries a brief. Applicants read it before they apply, so they arrive knowing what you are casting and how you decide.'
                : 'Every open call carries a brief. Applicants read it before they apply, so they arrive knowing who the call is for and what happens after they send.'}
            </p>
            <OpenCallBriefFields
              brief={brief}
              onChange={setBrief}
              disabled={createMutation.isPending}
              idPrefix="new-brief"
              eventMode={isEventCall}
            />

            <AgencyButton
              type="submit"
              variant="primary"
              size="sm"
              loading={createMutation.isPending}
              disabled={!label.trim() || !isEventCallComplete(call)}
            >
              {isEventCall ? 'Create event call' : 'Create link'}
            </AgencyButton>
          </form>
        </div>
      )}

      <div className="st-fieldset st-fieldset--last">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Live links</h3>
          <p className="st-fieldset-sub">
            Each link tracks its own funnel: arrivals, invitations claimed, submissions received.
          </p>
        </div>

        {linksQuery.isLoading ? (
          <div className="st-panel-loading">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="st-skel" />)}
          </div>
        ) : links.length === 0 ? (
          <div className="st-empty-inline">
            <Link2 size={20} />
            <span>No open call links yet. Create one and publish it on your site.</span>
          </div>
        ) : (
          <ul className="st-opencall-list">
            {links.map((link) => {
              const url = linkUrl(link.code);
              const paused = link.status === 'paused';
              const confirming = confirmRevokeId === link.id;
              const editing = editingBriefId === link.id;
              const linkIsEvent = isEventCastingCallKind(link.callKind);
              const eventDates = formatEventDates(link.event);
              return (
                <li key={link.id} className={`st-opencall-row${editing ? ' st-opencall-row--editing' : ''}`}>
                  <div className="st-opencall-main">
                    <div className="st-opencall-head">
                      <span className="st-opencall-label">{link.label}</span>
                      <span className={`st-opencall-badge ${paused ? 'st-opencall-badge--paused' : 'st-opencall-badge--active'}`}>
                        {paused ? 'Paused' : 'Active'}
                      </span>
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="st-opencall-url"
                      title="Open link in new tab"
                    >
                      <Link2 size={13} />
                      <code>{url}</code>
                      <ExternalLink size={12} className="st-opencall-ext" />
                    </a>
                    {linkIsEvent && (
                      <span className="st-opencall-brief-state">
                        {[
                          link.event?.name,
                          eventDates,
                          link.event?.location,
                          COMPENSATION_SUMMARY[link.compensation?.type],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                    <span className="st-opencall-funnel">
                      {link.arrivals || 0} arrivals · {link.claims || 0} invitations claimed ·{' '}
                      {link.submissions || 0} submissions
                    </span>
                    {link.brief ? (
                      <span className="st-opencall-brief-state">
                        {link.closedByDeadline
                          ? `Closed ${link.brief.deadline} — this link no longer takes submissions`
                          : link.brief.ongoing
                            ? 'Brief published · runs continuously'
                            : `Brief published · closes ${link.brief.deadline}`}
                      </span>
                    ) : (
                      <span className="st-opencall-brief-state st-opencall-brief-state--missing">
                        No brief yet. Applicants arriving here are told nothing
                        about the call.
                      </span>
                    )}
                  </div>
                  <div className="st-opencall-actions">
                    <AgencyButton
                      variant="secondary"
                      size="sm"
                      icon={Copy}
                      onClick={async () => {
                        const ok = await copyToClipboard(url);
                        if (ok) toast.success('Link copied');
                        else toast.error('Could not copy — select the URL manually');
                      }}
                    >
                      Copy
                    </AgencyButton>
                    {canManage && (
                      <>
                        <AgencyButton
                          variant="secondary"
                          size="sm"
                          icon={FileText}
                          onClick={() => {
                            setEditingBriefId(editing ? null : link.id);
                            setEditingBrief(briefFromLink(link));
                            setEditingCall(eventCallFromLink(link));
                          }}
                        >
                          {link.brief ? 'Edit brief' : 'Add brief'}
                        </AgencyButton>
                        <AgencyButton
                          variant="secondary"
                          size="sm"
                          icon={paused ? Play : Pause}
                          disabled={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              id: link.id,
                              payload: { status: paused ? 'active' : 'paused' },
                            })
                          }
                        >
                          {paused ? 'Resume' : 'Pause'}
                        </AgencyButton>
                        {confirming ? (
                          <span className="st-opencall-confirm">
                            <span className="st-opencall-confirm-text">
                              Revoking breaks this link everywhere it&apos;s published and
                              cancels unclaimed invitations. This can&apos;t be undone.
                            </span>
                            <AgencyButton
                              variant="danger"
                              size="sm"
                              disabled={updateMutation.isPending}
                              onClick={() =>
                                updateMutation.mutate({
                                  id: link.id,
                                  payload: { status: 'revoked' },
                                })
                              }
                            >
                              Revoke permanently
                            </AgencyButton>
                            <AgencyButton
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRevokeId(null)}
                            >
                              Keep it
                            </AgencyButton>
                          </span>
                        ) : (
                          <AgencyButton
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setConfirmRevokeId(link.id)}
                          >
                            Revoke
                          </AgencyButton>
                        )}
                      </>
                    )}
                  </div>

                  {editing && (
                    <form
                      className="st-opencall-brief-edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (updateMutation.isPending) return;
                        updateMutation.mutate({
                          id: link.id,
                          payload: { brief: editingBrief, ...callPayload(editingCall) },
                        });
                      }}
                    >
                      {/*
                        A live call keeps its kind. Switching a representation
                        link into an event cast after people have submitted to
                        it would retro-fit a consent they never signed; the
                        organizer creates a new call instead.
                      */}
                      {isEventCastingCallKind(editingCall.callKind) && (
                        <EventCallFields
                          call={editingCall}
                          onChange={setEditingCall}
                          disabled={updateMutation.isPending}
                          idPrefix={`event-${link.id}`}
                        />
                      )}
                      <OpenCallBriefFields
                        brief={editingBrief}
                        onChange={setEditingBrief}
                        disabled={updateMutation.isPending}
                        idPrefix={`brief-${link.id}`}
                        eventMode={isEventCastingCallKind(editingCall.callKind)}
                      />
                      <div className="st-opencall-brief-edit-actions">
                        <AgencyButton
                          type="submit"
                          variant="primary"
                          size="sm"
                          loading={updateMutation.isPending}
                          disabled={!isEventCallComplete(editingCall)}
                        >
                          Save brief
                        </AgencyButton>
                        <AgencyButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingBriefId(null)}
                        >
                          Cancel
                        </AgencyButton>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
