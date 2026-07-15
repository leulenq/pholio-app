import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createTalentRecord,
  fetchRoster,
  fetchRosterProfile,
  getBoards,
  updateRosterMembership,
} from '../api/agency';
import { AgencyButton, AgencyModal, SkeletonRow, StatusText } from '../components/ui';
import { EmptyErrorState } from '../../../shared/components/states';
import './RosterPage.css';

const PAGE_SIZE = 30;
const EMPTY_ITEMS = Object.freeze([]);
const STALE_MEASUREMENT_CUTOFF_MS = Date.now() - 180 * 86400000;

const EMPTY_FORM = Object.freeze({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  heightCm: '',
  market: '',
  boardId: '',
  stage: 'main',
});

function normalizeStatusKey(value) {
  return String(value || 'unknown').trim().toLowerCase().replaceAll(' ', '_');
}

function cmToImperial(cm) {
  const numeric = Number(cm);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const inches = numeric / 2.54;
  const feet = Math.floor(inches / 12);
  return `${feet}′ ${Math.round(inches - feet * 12)}″`;
}

function measurementSummary(item) {
  const values = item.measurements || {};
  const ordered = [values.chest_cm || values.bust_cm, values.waist_cm, values.hips_cm]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!ordered.length) return 'Measurements incomplete';
  return `${ordered.join(' / ')} cm · ${ordered.map((value) => Math.round(value / 2.54)).join(' / ')} in`;
}

function measurementAge(timestamp) {
  if (!timestamp) return 'Date not recorded';
  const ageDays = Math.floor((Date.now() - new Date(timestamp).getTime()) / 86400000);
  if (!Number.isFinite(ageDays) || ageDays < 0) return 'Recently updated';
  if (ageDays < 31) return `Updated ${Math.max(1, ageDays)}d ago`;
  return `Updated ${Math.floor(ageDays / 30)}mo ago`;
}

function RosterRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`ag-roster-row${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(item)}
      aria-pressed={selected}
    >
      <span className="ag-roster-person">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="ag-roster-photo" />
        ) : (
          <span className="ag-roster-photo ag-roster-photo--empty" aria-hidden="true">
            {item.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span>
          <strong>{item.name}</strong>
          <span>{item.location || 'Market not recorded'}</span>
        </span>
      </span>
      <span>{item.board?.name || 'Unassigned'}</span>
      <span>{item.stage === 'new_face' ? 'New Face' : item.stage === 'development' ? 'Development' : 'Main'}</span>
      <StatusText status={normalizeStatusKey(item.availability)} />
      <span className="ag-roster-measurements">
        {item.heightCm ? `${item.heightCm} cm · ${cmToImperial(item.heightCm)}` : 'Height not recorded'}
        <small>{measurementSummary(item)}</small>
      </span>
      <span>{measurementAge(item.measurementsUpdatedAt)}</span>
    </button>
  );
}

function TalentRecordForm({ boards, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const mutation = useMutation({
    mutationFn: createTalentRecord,
    onSuccess: (data) => {
      onCreated(data);
      toast.success('Talent added to your private roster');
    },
  });
  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };
  const submit = (event) => {
    event.preventDefault();
    mutation.mutate({
      ...form,
      email: form.email || null,
      phone: form.phone || null,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
      market: form.market || null,
      boardId: form.boardId || null,
      heightCm: form.heightCm ? Number(form.heightCm) : null,
    });
  };

  return (
    <form id="ag-add-talent-form" className="ag-roster-form" onSubmit={submit}>
      <p className="ag-roster-private-note">
        This record stays private to your agency. It is never published to Scout or a public portfolio.
      </p>
      <div className="ag-roster-form-grid">
        <label>
          First name
          <input name="firstName" value={form.firstName} onChange={update} maxLength={120} required />
        </label>
        <label>
          Last name
          <input name="lastName" value={form.lastName} onChange={update} maxLength={120} required />
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={update} maxLength={254} />
        </label>
        <label>
          Phone
          <input name="phone" value={form.phone} onChange={update} maxLength={80} />
        </label>
        <label>
          Date of birth
          <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} />
        </label>
        <label>
          Gender
          <input name="gender" value={form.gender} onChange={update} maxLength={80} />
        </label>
        <label>
          Height in cm
          <input name="heightCm" type="number" min="50" max="260" value={form.heightCm} onChange={update} />
        </label>
        <label>
          Market
          <input name="market" value={form.market} onChange={update} maxLength={160} />
        </label>
        <label>
          Division
          <select name="boardId" value={form.boardId} onChange={update}>
            <option value="">Unassigned</option>
            {boards.map((board) => <option value={board.id} key={board.id}>{board.name}</option>)}
          </select>
        </label>
        <label>
          Stage
          <select name="stage" value={form.stage} onChange={update}>
            <option value="main">Main</option>
            <option value="development">Development</option>
            <option value="new_face">New Face</option>
          </select>
        </label>
      </div>
      {mutation.isError ? (
        <p className="ag-roster-form-error" role="alert">
          {mutation.error?.message || 'Could not add this talent.'}
        </p>
      ) : null}
      <div className="ag-roster-form-actions">
        <AgencyButton variant="secondary" onClick={onClose}>Cancel</AgencyButton>
        <AgencyButton type="submit" loading={mutation.isPending}>Add to roster</AgencyButton>
      </div>
    </form>
  );
}

function RosterDetail({ item, boards, onClose, onChanged }) {
  const detailQuery = useQuery({
    queryKey: ['agency', 'roster-detail', item.id],
    queryFn: () => fetchRosterProfile(item.id),
  });
  const mutation = useMutation({
    mutationFn: (updates) => updateRosterMembership(item.id, updates),
    onSuccess: () => {
      onChanged();
      toast.success('Roster updated');
    },
  });
  const detail = detailQuery.data;

  return (
    <aside className="ag-roster-detail" aria-label={`${item.name} roster details`}>
      <div className="ag-roster-detail-head">
        <div>
          <h2>{item.name}</h2>
          <p>{item.source === 'agency_private' ? 'Private agency record' : 'Pholio profile'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close roster details"><X size={18} /></button>
      </div>
      {detailQuery.isLoading ? <SkeletonRow lines={5} /> : null}
      {detailQuery.isError ? (
        <EmptyErrorState title="Details could not be loaded" actionLabel="Try again" onAction={() => detailQuery.refetch()} />
      ) : null}
      {detail ? (
        <div className="ag-roster-detail-body">
          <section>
            <h3>Division and stage</h3>
            <label>
              Division
              <select
                value={detail.membership?.board_id || ''}
                onChange={(event) => mutation.mutate({ boardId: event.target.value || null })}
                disabled={mutation.isPending}
              >
                <option value="">Unassigned</option>
                {boards.map((board) => <option value={board.id} key={board.id}>{board.name}</option>)}
              </select>
            </label>
            <label>
              Stage
              <select
                value={detail.membership?.stage || 'main'}
                onChange={(event) => mutation.mutate({ stage: event.target.value })}
                disabled={mutation.isPending}
              >
                <option value="main">Main</option>
                <option value="development">Development</option>
                <option value="new_face">New Face</option>
              </select>
            </label>
          </section>
          <section>
            <h3>Measurements</h3>
            <p>{item.heightCm ? `${item.heightCm} cm · ${cmToImperial(item.heightCm)}` : 'Height not recorded'}</p>
            <p>{measurementSummary(item)}</p>
            <p>{measurementAge(item.measurementsUpdatedAt)}</p>
          </section>
          {Array.isArray(detail.commitments) && detail.commitments.length ? (
            <section>
              <h3>Current and recent commitments</h3>
              <ul>
                {detail.commitments.slice(0, 6).map((commitment) => (
                  <li key={commitment.id}>
                    <strong>{commitment.kind === 'bookout' ? 'Booked out' : commitment.kind}</strong>
                    <span>{commitment.start_date || 'Date pending'} — {commitment.end_date || 'Date pending'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <AgencyButton
            variant="secondary"
            onClick={() => mutation.mutate({ status: 'inactive' })}
            loading={mutation.isPending}
          >
            Move to inactive
          </AgencyButton>
        </div>
      ) : null}
    </aside>
  );
}

export default function RosterPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [boardId, setBoardId] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const filters = { page, limit: PAGE_SIZE, search, boardId, stage, status };
  const rosterQuery = useQuery({
    queryKey: ['agency', 'roster', filters],
    queryFn: () => fetchRoster(filters),
    placeholderData: (previous) => previous,
  });
  const boardsQuery = useQuery({ queryKey: ['agency-boards'], queryFn: getBoards, staleTime: 60000 });
  const items = rosterQuery.data?.items || EMPTY_ITEMS;
  const pagination = rosterQuery.data?.pagination;
  const boards = boardsQuery.data || [];

  const signals = useMemo(() => {
    const incomplete = items.filter((item) => !item.heightCm || !Object.values(item.measurements || {}).some(Boolean)).length;
    const stale = items.filter((item) => {
      if (!item.measurementsUpdatedAt) return false;
      return new Date(item.measurementsUpdatedAt).getTime() < STALE_MEASUREMENT_CUTOFF_MS;
    }).length;
    return { incomplete, stale };
  }, [items]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agency', 'roster'] });
  const resetPage = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <main className="ag-roster-page">
      <header className="ag-roster-header">
        <div>
          <h1>Roster</h1>
          <p>Signed talent and private agency records, organized for daily booking work.</p>
        </div>
        <AgencyButton icon={Plus} onClick={() => setAddOpen(true)}>Add talent</AgencyButton>
      </header>

      <section className="ag-roster-ledger" aria-label="Roster summary">
        <div><strong>{pagination?.total ?? '—'}</strong><span>{status === 'active' ? 'Active roster' : 'In this view'}</span></div>
        <div><strong>{signals.incomplete}</strong><span>Incomplete measurements in this view</span></div>
        <div><strong>{signals.stale}</strong><span>Measurements older than six months</span></div>
      </section>

      <section className="ag-roster-toolbar" aria-label="Roster filters">
        <label className="ag-roster-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search roster</span>
          <input value={search} onChange={resetPage(setSearch)} placeholder="Search name or market" />
        </label>
        <label>
          <span className="sr-only">Division</span>
          <select value={boardId} onChange={resetPage(setBoardId)}>
            <option value="">All divisions</option>
            {boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Stage</span>
          <select value={stage} onChange={resetPage(setStage)}>
            <option value="">All stages</option>
            <option value="main">Main</option>
            <option value="development">Development</option>
            <option value="new_face">New Face</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Roster status</span>
          <select value={status} onChange={resetPage(setStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="left">Left</option>
            <option value="ended">Ended</option>
          </select>
        </label>
      </section>

      <div className={`ag-roster-workspace${selected ? ' has-detail' : ''}`}>
        <section className="ag-roster-list" aria-busy={rosterQuery.isFetching}>
          <div className="ag-roster-columns" aria-hidden="true">
            <span>Talent</span><span>Division</span><span>Stage</span><span>Availability</span><span>Measurements</span><span>Updated</span>
          </div>
          {rosterQuery.isLoading ? Array.from({ length: 6 }, (_, index) => <SkeletonRow key={index} lines={2} />) : null}
          {rosterQuery.isError ? (
            <EmptyErrorState title="Roster could not be loaded" actionLabel="Try again" onAction={() => rosterQuery.refetch()} />
          ) : null}
          {!rosterQuery.isLoading && !rosterQuery.isError && items.length === 0 ? (
            <div className="ag-roster-empty">
              <h2>{search || boardId || stage ? 'No talent match these filters' : 'Your roster is ready for its first talent'}</h2>
              <p>{search || boardId || stage ? 'Adjust the search or division filters.' : 'Add an existing agency talent record or sign someone from Submissions.'}</p>
              {!search && !boardId && !stage ? <AgencyButton onClick={() => setAddOpen(true)}>Add talent</AgencyButton> : null}
            </div>
          ) : null}
          {items.map((item) => (
            <RosterRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={setSelected} />
          ))}
          {pagination && pagination.totalPages > 1 ? (
            <nav className="ag-roster-pagination" aria-label="Roster pages">
              <button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span>Page {page} of {pagination.totalPages}</span>
              <button type="button" onClick={() => setPage((value) => value + 1)} disabled={!pagination.hasNextPage} aria-label="Next page"><ChevronRight size={16} /></button>
            </nav>
          ) : null}
        </section>
        {selected ? (
          <RosterDetail item={selected} boards={boards} onClose={() => setSelected(null)} onChanged={() => { refresh(); setSelected(null); }} />
        ) : null}
      </div>

      <AgencyModal open={addOpen} onClose={() => setAddOpen(false)} title="Add talent to roster">
        <TalentRecordForm
          boards={boards}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); refresh(); }}
        />
      </AgencyModal>
    </main>
  );
}
