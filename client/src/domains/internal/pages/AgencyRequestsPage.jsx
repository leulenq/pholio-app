import { useCallback, useEffect, useState } from 'react';
import {
  approveAgencyRequest,
  declineAgencyRequest,
  getAgencyRequest,
  listAgencyRequests,
  scheduleAgencyQualificationCall,
} from '../api/internal';
import './AgencyRequestsPage.css';

const FILTERS = [
  ['', 'All requests'],
  ['submitted', 'Submitted'],
  ['triage', 'Triage'],
  ['needs_info', 'Needs information'],
  ['qualification_call', 'Qualification call'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
];

function readableStatus(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function readableDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString();
}

export default function AgencyRequestsPage() {
  const [status, setStatus] = useState('');
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');
  const [callAt, setCallAt] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listAgencyRequests(status);
      setRequests(result.items || []);
      setSelectedId((current) => {
        if (current && result.items?.some((item) => item.id === current)) return current;
        return result.items?.[0]?.id || null;
      });
    } catch (requestError) {
      setError(
        requestError.status === 403
          ? 'This workspace is restricted to authorized Pholio staff.'
          : requestError.message,
      );
      setRequests([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    getAgencyRequest(selectedId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function runAction(action) {
    if (!detail) return;
    setActionPending(true);
    setError('');
    setNotice('');
    try {
      let result;
      if (action === 'approve') {
        result = await approveAgencyRequest(detail.id, { notes });
        setDetail(result.request);
        setNotice(
          result.invitationDelivered
            ? 'Workspace provisioned and the owner invitation was sent.'
            : 'Workspace provisioned, but the owner invitation could not be delivered. Review the event history before following up.',
        );
      } else if (action === 'decline') {
        result = await declineAgencyRequest(detail.id, { notes });
        setDetail(result);
        setNotice('Request declined and the reason was recorded.');
      } else {
        result = await scheduleAgencyQualificationCall(detail.id, {
          callAt: new Date(callAt).toISOString(),
          notes,
        });
        setDetail(result);
        setNotice('Qualification call recorded.');
      }
      setNotes('');
      await loadList();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionPending(false);
    }
  }

  return (
    <main className="internal-review">
      <header className="internal-review__header">
        <div>
          <h1>Agency access review</h1>
          <p>Review agency credentials, record qualification calls, and provision approved workspaces.</p>
        </div>
        <label>
          <span>Request status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </header>

      {error ? <p className="internal-review__error" role="alert">{error}</p> : null}
      {notice ? <p className="internal-review__notice" role="status">{notice}</p> : null}

      <div className="internal-review__workspace">
        <section className="internal-review__queue" aria-label="Agency requests">
          {loading ? <p className="internal-review__muted">Loading requests…</p> : null}
          {!loading && requests.length === 0 ? (
            <p className="internal-review__muted">No requests match this view.</p>
          ) : null}
          {requests.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === selectedId ? 'is-selected' : ''}
              onClick={() => setSelectedId(item.id)}
              aria-pressed={item.id === selectedId}
            >
              <strong>{item.agencyName}</strong>
              <span>{item.primaryMarketCity} · {item.contactName}</span>
              <span>{readableStatus(item.status)} · {readableDate(item.createdAt)}</span>
            </button>
          ))}
        </section>

        <section className="internal-review__detail" aria-live="polite">
          {!detail ? <p className="internal-review__muted">Select a request to review it.</p> : (
            <>
              <div className="internal-review__title-row">
                <div>
                  <h2>{detail.agencyName}</h2>
                  <p>{readableStatus(detail.status)}</p>
                </div>
                <a href={detail.websiteUrl} target="_blank" rel="noreferrer">Visit agency website</a>
              </div>

              <dl className="internal-review__facts">
                <div><dt>Market</dt><dd>{[detail.primaryMarketCity, detail.primaryMarketCountry].filter(Boolean).join(', ')}</dd></div>
                <div><dt>Agency type</dt><dd>{detail.agencyType}</dd></div>
                <div><dt>Roster</dt><dd>{detail.rosterSizeRange}</dd></div>
                <div><dt>Team</dt><dd>{detail.teamSizeRange}</dd></div>
                <div><dt>Contact</dt><dd>{detail.contactName}, {detail.contactRole}</dd></div>
                <div><dt>Email</dt><dd><a href={`mailto:${detail.contactEmail}`}>{detail.contactEmail}</a></dd></div>
                <div><dt>Current system</dt><dd>{detail.currentSystem || 'Not provided'}</dd></div>
                <div><dt>Migration interest</dt><dd>{detail.migrationInterest || 'Not provided'}</dd></div>
              </dl>

              {detail.notes ? <div className="internal-review__submitted-notes"><h3>Submitted notes</h3><p>{detail.notes}</p></div> : null}

              <div className="internal-review__action-form">
                <label>
                  <span>Internal review notes</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} />
                </label>
                <label>
                  <span>Qualification call</span>
                  <input type="datetime-local" value={callAt} onChange={(event) => setCallAt(event.target.value)} />
                </label>
                <div className="internal-review__actions">
                  <button type="button" onClick={() => runAction('call')} disabled={!callAt || actionPending || ['approved', 'declined'].includes(detail.status)}>
                    Record call
                  </button>
                  <button type="button" onClick={() => runAction('decline')} disabled={!notes.trim() || actionPending || ['approved', 'declined'].includes(detail.status)}>
                    Decline
                  </button>
                  <button className="is-primary" type="button" onClick={() => runAction('approve')} disabled={actionPending || ['approved', 'declined'].includes(detail.status)}>
                    Approve and provision
                  </button>
                </div>
              </div>

              <div className="internal-review__history">
                <h3>Review history</h3>
                {detail.events?.map((event) => (
                  <div key={event.id}>
                    <strong>{readableStatus(event.eventType)}</strong>
                    <span>{readableDate(event.createdAt)}{event.actorEmail ? ` · ${event.actorEmail}` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
