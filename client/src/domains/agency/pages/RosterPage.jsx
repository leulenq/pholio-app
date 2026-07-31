import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  createTalentRecord,
  fetchRoster,
  getBoards,
  updateTalentRecord,
} from '../api/agency';
import { AgencyButton, AgencyModal, SkeletonRow, StatusText } from '../components/ui';
import RosterDetailDrawer from '../components/RosterDetailDrawer';
import { EmptyErrorState } from '../../../shared/components/states';
import {
  STAGE_LABELS,
  normalizeStatusKey,
  cmToImperial,
  measurementSummary,
  measurementAge,
  measurementFreshness,
} from './rosterFormat';
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
  bustCm: '',
  chestCm: '',
  waistCm: '',
  hipsCm: '',
  inseamCm: '',
  shoeSize: '',
});

function RosterRow({ item, selected, onSelect }) {
  const division = item.board?.name || 'Unassigned';
  const stage = STAGE_LABELS[item.stage] || STAGE_LABELS.main;
  const freshness = measurementFreshness(item.measurementsUpdatedAt);
  const height = item.heightCm
    ? `${item.heightCm} cm · ${cmToImperial(item.heightCm)}`
    : 'Height missing';
  const measurements = measurementSummary(item);

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
        <span className="ag-roster-person-text">
          <strong>{item.name}</strong>
          <span>{item.location || 'Market not recorded'}</span>
        </span>
      </span>
      <span className="ag-roster-cell">
        <span className={`ag-roster-tag${item.board?.name ? '' : ' is-empty'}`} title={division}>{division}</span>
      </span>
      <span className="ag-roster-cell">
        <span className={`ag-roster-stagetag ag-roster-stagetag--${item.stage || 'main'}`}>{stage}</span>
      </span>
      <span className="ag-roster-cell">
        <StatusText className="ag-roster-avail" status={normalizeStatusKey(item.availability)} label={item.availability} />
      </span>
      <span className="ag-roster-cell">
        <span className="ag-roster-measure" title={`${height}. ${measurements}`}>
          <span className={item.heightCm ? 'ag-roster-measure-height' : 'ag-roster-measure-height is-missing'}>{height}</span>
          <small>{measurements}</small>
        </span>
      </span>
      <span className={`ag-roster-fresh ag-roster-fresh--${freshness.tone}`} title={measurementAge(item.measurementsUpdatedAt)}>
        {freshness.label}
      </span>
    </button>
  );
}

export function TalentRecordForm({ boards, onClose, onSaved, mode = 'create', recordId, initialValues }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initialValues });
  const mutation = useMutation({
    mutationFn: isEdit ? (data) => updateTalentRecord(recordId, data) : createTalentRecord,
    onSuccess: (data) => {
      onSaved(data);
      toast.success(isEdit ? 'Talent record updated' : 'Talent added to your private roster');
    },
  });
  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };
  const submit = (event) => {
    event.preventDefault();
    const measurements = {};
    if (form.bustCm !== '') measurements.bust_cm = Number(form.bustCm);
    if (form.chestCm !== '') measurements.chest_cm = Number(form.chestCm);
    if (form.waistCm !== '') measurements.waist_cm = Number(form.waistCm);
    if (form.hipsCm !== '') measurements.hips_cm = Number(form.hipsCm);
    if (form.inseamCm !== '') measurements.inseam_cm = Number(form.inseamCm);
    if (form.shoeSize !== '') measurements.shoe_size = form.shoeSize;

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || null,
      phone: form.phone || null,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
      market: form.market || null,
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      measurements: Object.keys(measurements).length ? measurements : null,
    };
    if (!isEdit) {
      payload.boardId = form.boardId || null;
      payload.stage = form.stage;
    }
    mutation.mutate(payload);
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
        {!isEdit && (
          <label>
            Division
            <select name="boardId" value={form.boardId} onChange={update}>
              <option value="">Unassigned</option>
              {boards.map((board) => <option value={board.id} key={board.id}>{board.name}</option>)}
            </select>
          </label>
        )}
        {!isEdit && (
          <label>
            Stage
            <select name="stage" value={form.stage} onChange={update}>
              <option value="main">Main</option>
              <option value="development">Development</option>
              <option value="new_face">New Face</option>
            </select>
          </label>
        )}
      </div>

      <p className="ag-roster-form-section-title">Measurements</p>
      <div className="ag-roster-form-grid">
        <label>
          Bust in cm
          <input name="bustCm" type="number" min="20" max="250" value={form.bustCm} onChange={update} />
        </label>
        <label>
          Chest in cm
          <input name="chestCm" type="number" min="20" max="250" value={form.chestCm} onChange={update} />
        </label>
        <label>
          Waist in cm
          <input name="waistCm" type="number" min="20" max="250" value={form.waistCm} onChange={update} />
        </label>
        <label>
          Hips in cm
          <input name="hipsCm" type="number" min="20" max="250" value={form.hipsCm} onChange={update} />
        </label>
        <label>
          Inseam in cm
          <input name="inseamCm" type="number" min="20" max="180" value={form.inseamCm} onChange={update} />
        </label>
        <label>
          Shoe size
          <input name="shoeSize" value={form.shoeSize} onChange={update} maxLength={30} />
        </label>
      </div>

      {mutation.isError ? (
        <p className="ag-roster-form-error" role="alert">
          {mutation.error?.message || 'Could not save this talent.'}
        </p>
      ) : null}
      <div className="ag-roster-form-actions">
        <AgencyButton variant="secondary" onClick={onClose}>Cancel</AgencyButton>
        <AgencyButton type="submit" loading={mutation.isPending}>{isEdit ? 'Save changes' : 'Add to roster'}</AgencyButton>
      </div>
    </form>
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
  // Divisions only — the roster board picker must not offer casting boards
  // ("Nike SS26") as though they were standing divisions.
  const boardsQuery = useQuery({
    queryKey: ['agency-boards', 'division'],
    queryFn: () => getBoards('division'),
    staleTime: 60000,
  });
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

      <AnimatePresence>
        {selected ? (
          <RosterDetailDrawer
            key={selected.id}
            item={selected}
            boards={boards}
            onClose={() => setSelected(null)}
            onChanged={refresh}
          />
        ) : null}
      </AnimatePresence>

      <AgencyModal open={addOpen} onClose={() => setAddOpen(false)} title="Add talent to roster">
        <TalentRecordForm
          boards={boards}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); refresh(); }}
        />
      </AgencyModal>
    </main>
  );
}
