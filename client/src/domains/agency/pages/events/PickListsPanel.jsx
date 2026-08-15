import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import { Figure, Moment, Notation } from '../../components/meta';
import {
  addEventPickListItems,
  createEventPickList,
  getEventPickLists,
  getEventPool,
  reissueEventPickList,
  revokeEventPickList,
} from '../../api/agency';
import './events.css';

/**
 * Designer pick lists — who has been handed a slice of this pool, what came
 * back, and whether their link is still live.
 *
 * The link row copies the OpenCallPanel idiom (settings/OpenCallPanel.jsx
 * 186-303): label, the URL itself, a plain-text funnel line, then Copy /
 * Reissue / Revoke with revoke behind an inline confirmation. What it cannot
 * copy is showing the URL: an open call code is stored in plaintext and can be
 * rendered any time, whereas only a pick token's hash is kept. The URL exists
 * in one response — the create or reissue that minted it — so this panel keeps
 * it in local state for exactly as long as the organizer is looking at it.
 */

const ASSIGN_PAGE_SIZE = 200;

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The desk's square multi-select control, ported rather than imported. */
function PickCheck({ name, picked, onToggle }) {
  return (
    <button
      type="button"
      className={`ev-check${picked ? ' is-picked' : ''}`}
      aria-label={`${picked ? 'Remove' : 'Add'} ${name}`}
      aria-pressed={picked}
      onClick={onToggle}
    >
      {picked && <Check size={12} color="var(--ag-black)" aria-hidden="true" />}
    </button>
  );
}

function marksLine(list) {
  if (!list.markedCount) return 'No marks yet';
  const parts = [];
  if (list.marks.pick) parts.push(`${list.marks.pick} picked`);
  if (list.marks.maybe) parts.push(`${list.marks.maybe} maybe`);
  if (list.marks.pass) parts.push(`${list.marks.pass} passed`);
  return parts.join(' · ');
}

/* The server resolves the status vocabulary to booleans (see
   serializePickList) so this reads facts, not a second copy of the spelling. */
function statusLine(list) {
  if (list.revoked) return 'Link revoked';
  if (list.expired) return 'Link expired';
  if (list.submittedAt) return 'List submitted';
  if (list.closed) return 'Closed — read only';
  return 'Link live';
}

export default function PickListsPanel({ linkId }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    designerName: '',
    designerEmail: '',
    label: '',
    slotsRequested: '',
    organizerNote: '',
  });
  const [selected, setSelected] = useState(() => new Set());
  const [assigningTo, setAssigningTo] = useState(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);
  /** pickListId → the raw URL, held only for this session on this screen. */
  const [revealed, setRevealed] = useState({});

  const listsQuery = useQuery({
    queryKey: ['agency-event-pick-lists', linkId],
    queryFn: () => getEventPickLists(linkId),
    staleTime: 30_000,
  });

  const poolQuery = useQuery({
    queryKey: ['agency-event-pool', linkId, 'assignable'],
    queryFn: () => getEventPool(linkId, { limit: ASSIGN_PAGE_SIZE }),
    enabled: creating || Boolean(assigningTo),
    staleTime: 30_000,
  });

  const lists = useMemo(() => listsQuery.data || [], [listsQuery.data]);
  const pool = poolQuery.data?.applicants || [];
  const poolTotal = poolQuery.data?.total || 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['agency-event-pick-lists', linkId] });
    qc.invalidateQueries({ queryKey: ['agency-event-lineup', linkId] });
  };

  const resetForm = () => {
    setForm({
      designerName: '',
      designerEmail: '',
      label: '',
      slotsRequested: '',
      organizerNote: '',
    });
    setSelected(new Set());
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createEventPickList(linkId, {
        ...form,
        slotsRequested: form.slotsRequested || null,
        applicationIds: [...selected],
      }),
    onSuccess: (data) => {
      setRevealed((prev) => ({ ...prev, [data.pickList.id]: data.url }));
      setCreating(false);
      resetForm();
      invalidate();
      toast.success(`List created for ${data.pickList.designerName}`);
    },
    onError: (error) => toast.error(error?.message || 'Could not create the list'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ pickListId, applicationIds }) =>
      addEventPickListItems(pickListId, applicationIds),
    onSuccess: (data) => {
      setAssigningTo(null);
      setSelected(new Set());
      invalidate();
      toast.success(
        data.added === 1 ? '1 applicant added' : `${data.added} applicants added`,
      );
    },
    onError: (error) => toast.error(error?.message || 'Could not add applicants'),
  });

  const reissueMutation = useMutation({
    mutationFn: (pickListId) => reissueEventPickList(pickListId),
    onSuccess: (data) => {
      setRevealed((prev) => ({ ...prev, [data.pickList.id]: data.url }));
      invalidate();
      toast.success('New link issued — the old one no longer works');
    },
    onError: (error) => toast.error(error?.message || 'Could not reissue the link'),
  });

  const revokeMutation = useMutation({
    mutationFn: (pickListId) => revokeEventPickList(pickListId),
    onSuccess: (data) => {
      setConfirmRevokeId(null);
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[data.id];
        return next;
      });
      invalidate();
      toast.success('Link revoked');
    },
    onError: (error) => toast.error(error?.message || 'Could not revoke the link'),
  });

  const toggleSelected = (applicationId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  };

  const setField = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const busy =
    createMutation.isPending || assignMutation.isPending || reissueMutation.isPending;

  const totalPicked = useMemo(
    () => lists.reduce((sum, list) => sum + (list.marks?.pick || 0), 0),
    [lists],
  );

  const assignPanel = (
    <div className="ev-assign">
      <div className="ev-assign-head">
        <span className="ev-subhead">
          Who this designer sees {selected.size > 0 ? `· ${selected.size} selected` : ''}
        </span>
        <Notation size="sm">
          {poolTotal > pool.length
            ? `Showing the ${pool.length} most recent of ${poolTotal}`
            : `${poolTotal} in this call`}
        </Notation>
      </div>
      {poolQuery.isLoading ? (
        <div className="ev-skel" />
      ) : pool.length === 0 ? (
        <p className="ev-empty">
          Nobody has applied to this call yet. A list can be created now and
          filled once submissions arrive.
        </p>
      ) : (
        <ul className="ev-assign-list">
          {pool.map((applicant) => (
            <li key={applicant.applicationId} className="ev-assign-row">
              <PickCheck
                name={applicant.name}
                picked={selected.has(applicant.applicationId)}
                onToggle={() => toggleSelected(applicant.applicationId)}
              />
              <span className="ev-assign-name">{applicant.name}</span>
              {applicant.city && <Notation size="sm">{applicant.city}</Notation>}
              <span className="ev-assign-meta">
                {applicant.marks.pick > 0
                  ? `Picked by ${applicant.marks.pick}`
                  : applicant.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="ev-panel" aria-label="Designer pick lists">
      <div className="ev-panel-head">
        <div>
          <h2 className="ev-panel-title">Designers</h2>
          <p className="ev-panel-sub">
            Each designer gets a read-only link to the applicants you choose.
            They see digitals, measurements, availability and walk video — never
            contact details — and they mark pick, maybe or pass. Nothing they do
            moves an application; only your offer does.
          </p>
        </div>
        <div className="ev-panel-actions">
          <AgencyButton
            variant="primary"
            size="sm"
            icon={UserPlus}
            disabled={busy}
            onClick={() => {
              setCreating((open) => !open);
              setAssigningTo(null);
              setSelected(new Set());
            }}
          >
            {creating ? 'Cancel' : 'New list'}
          </AgencyButton>
        </div>
      </div>

      {creating && (
        <form
          className="ev-form"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="ev-fields">
            <div className="ev-field">
              <label htmlFor="ev-designer-name">Designer</label>
              <input
                id="ev-designer-name"
                value={form.designerName}
                onChange={setField('designerName')}
                placeholder="Studio Nomi"
                maxLength={160}
                required
              />
            </div>
            <div className="ev-field">
              <label htmlFor="ev-designer-email">Email (optional)</label>
              <input
                id="ev-designer-email"
                type="email"
                value={form.designerEmail}
                onChange={setField('designerEmail')}
                placeholder="casting@studionomi.com"
                maxLength={254}
              />
            </div>
            <div className="ev-field">
              <label htmlFor="ev-list-label">Show or slot (optional)</label>
              <input
                id="ev-list-label"
                value={form.label}
                onChange={setField('label')}
                placeholder="Day 2, 7pm"
                maxLength={120}
              />
            </div>
            <div className="ev-field">
              <label htmlFor="ev-slots">Looks to cast (optional)</label>
              <input
                id="ev-slots"
                type="number"
                min="1"
                max="120"
                value={form.slotsRequested}
                onChange={setField('slotsRequested')}
                placeholder="18"
              />
            </div>
            <div className="ev-field ev-field--wide">
              <label htmlFor="ev-note">Note to the designer (optional)</label>
              <textarea
                id="ev-note"
                value={form.organizerNote}
                onChange={setField('organizerNote')}
                placeholder="Pick your openers first. Marks are due Friday."
                maxLength={2000}
              />
            </div>
          </div>

          {assignPanel}

          <div className="ev-form-foot">
            <span className="ev-form-hint">
              The link is shown once, right after it is created. Only its hash is
              stored, so it cannot be looked up again — reissue instead.
            </span>
            <AgencyButton
              type="submit"
              variant="primary"
              size="sm"
              loading={createMutation.isPending}
              disabled={!form.designerName.trim()}
            >
              Create list
            </AgencyButton>
          </div>
        </form>
      )}

      {listsQuery.isLoading ? (
        <>
          <div className="ev-skel" />
          <div className="ev-skel" />
        </>
      ) : lists.length === 0 ? (
        <p className="ev-empty">
          No designer has a list yet. Create one to hand over a slice of this
          pool without giving anybody a Pholio account.
        </p>
      ) : (
        <>
          <ul className="ev-rows">
            {lists.map((list) => {
              const revoked = list.revoked;
              const url = revealed[list.id];
              const confirming = confirmRevokeId === list.id;
              const assigning = assigningTo === list.id;
              return (
                <li
                  key={list.id}
                  className={`ev-row${revoked ? ' ev-row--muted' : ''}`}
                >
                  <div className="ev-row-main">
                    <span className="ev-row-name">{list.designerName}</span>
                    <div className="ev-row-line">
                      {list.label && <span>{list.label}</span>}
                      {list.label && <span aria-hidden="true">·</span>}
                      <span>
                        {list.itemCount === 1
                          ? '1 applicant'
                          : `${list.itemCount} applicants`}
                        {list.slotsRequested ? ` for ${list.slotsRequested} looks` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{marksLine(list)}</span>
                    </div>
                    <div className="ev-row-line">
                      <span>{statusLine(list)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {list.openCount === 0
                          ? 'Not opened yet'
                          : list.openCount === 1
                            ? 'Opened once'
                            : `Opened ${list.openCount} times`}
                      </span>
                      {list.lastOpenedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <Moment value={list.lastOpenedAt} />
                        </>
                      )}
                    </div>

                    {url && (
                      <div className="ev-reveal">
                        <Link2 size={13} aria-hidden="true" />
                        <code>{url}</code>
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
                        <span className="ev-reveal-note">
                          Send this now. Leaving this page loses it, and only a
                          reissued link can replace it.
                        </span>
                      </div>
                    )}

                    {assigning && assignPanel}
                  </div>

                  <div className="ev-row-actions">
                    {!revoked && (
                      <AgencyButton
                        variant="secondary"
                        size="sm"
                        icon={UserPlus}
                        disabled={busy}
                        onClick={() => {
                          setAssigningTo(assigning ? null : list.id);
                          setCreating(false);
                          setSelected(new Set());
                        }}
                      >
                        {assigning ? 'Done' : 'Add applicants'}
                      </AgencyButton>
                    )}
                    {assigning && selected.size > 0 && (
                      <AgencyButton
                        variant="primary"
                        size="sm"
                        loading={assignMutation.isPending}
                        onClick={() =>
                          assignMutation.mutate({
                            pickListId: list.id,
                            applicationIds: [...selected],
                          })
                        }
                      >
                        Add {selected.size}
                      </AgencyButton>
                    )}
                    {!revoked && (
                      <AgencyButton
                        variant="secondary"
                        size="sm"
                        icon={RefreshCw}
                        disabled={busy}
                        onClick={() => reissueMutation.mutate(list.id)}
                      >
                        Reissue
                      </AgencyButton>
                    )}
                    {!revoked &&
                      (confirming ? (
                        <>
                          <AgencyButton
                            variant="destructive"
                            size="sm"
                            loading={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(list.id)}
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
                        </>
                      ) : (
                        <AgencyButton
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => setConfirmRevokeId(list.id)}
                        >
                          Revoke
                        </AgencyButton>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="ev-hero-figures">
            <Figure label="Lists out" value={String(lists.length)} size="sm" />
            <Figure label="Picks in" value={String(totalPicked)} size="sm" />
          </div>
        </>
      )}
    </section>
  );
}
