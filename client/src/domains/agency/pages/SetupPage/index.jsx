import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, LogOut } from 'lucide-react';
import {
  completeAgencySetup,
  createImportJob,
  getAgencySetup,
  saveSetupBoards,
  saveSetupDefaults,
  saveSetupOpenCall,
  saveSetupPrivacy,
  saveSetupProfile,
  saveSetupRoster,
  saveSetupTeam,
} from '../../api/setup';
import { postLogoutAndRedirectToMarketing } from '../../../../shared/lib/logout';
import './SetupPage.css';

const BOARD_PRESETS = ['Women', 'Men', 'New Faces', 'Commercial', 'Curve', 'E-comm', 'Fit', 'Kids/Teens'];

function statusText(status) {
  if (status === 'complete') return 'Complete';
  if (status === 'in_review') return 'In review';
  if (status === 'ready') return 'Ready';
  return 'Not started';
}

function SetupSkeleton() {
  return (
    <div className="ag-setup-shell">
      <div className="ag-setup-skeleton ag-setup-skeleton--wide" />
      <div className="ag-setup-grid">
        <div className="ag-setup-skeleton" />
        <div className="ag-setup-skeleton" />
      </div>
    </div>
  );
}

function SetupField({ label, children }) {
  return (
    <label className="ag-setup-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AgencySetupPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agency', 'setup'],
    queryFn: getAgencySetup,
  });
  const [profile, setProfile] = useState({});
  const [boards, setBoards] = useState(null);
  const [rosterPath, setRosterPath] = useState(null);
  const [openCallEnabled, setOpenCallEnabled] = useState(null);
  const [includesMinors, setIncludesMinors] = useState(null);
  const [message, setMessage] = useState({ tone: 'status', text: '' });

  const refresh = (nextData) => {
    queryClient.setQueryData(['agency', 'setup'], nextData);
    queryClient.invalidateQueries({ queryKey: ['session', 'agency'] });
  };

  const mutationOptions = {
    onSuccess: (nextData) => {
      refresh(nextData);
      setMessage({ tone: 'status', text: 'Setup step saved.' });
    },
    onError: (err) => setMessage({ tone: 'alert', text: err.message || 'Unable to save this step.' }),
  };

  const profileMutation = useMutation({ mutationFn: saveSetupProfile, ...mutationOptions });
  const boardsMutation = useMutation({ mutationFn: saveSetupBoards, ...mutationOptions });
  const teamMutation = useMutation({ mutationFn: saveSetupTeam, ...mutationOptions });
  const rosterMutation = useMutation({ mutationFn: saveSetupRoster, ...mutationOptions });
  const importMutation = useMutation({ mutationFn: createImportJob, ...mutationOptions });
  const openCallMutation = useMutation({ mutationFn: saveSetupOpenCall, ...mutationOptions });
  const defaultsMutation = useMutation({ mutationFn: saveSetupDefaults, ...mutationOptions });
  const privacyMutation = useMutation({ mutationFn: saveSetupPrivacy, ...mutationOptions });
  const completeMutation = useMutation({
    mutationFn: completeAgencySetup,
    onSuccess: (result) => {
      window.location.assign(result?.redirect || '/dashboard/agency');
    },
    onError: (err) => setMessage({ tone: 'alert', text: err.message || 'Complete the required steps first.' }),
  });

  const agency = data?.agency || {};
  const stepMap = useMemo(() => new Map((data?.steps || []).map((step) => [step.key, step])), [data]);
  const requiredComplete = Boolean(data?.requiredComplete);
  const isSavingProfile = profileMutation.isPending;
  const isSavingBoards = boardsMutation.isPending;
  const isSavingTeam = teamMutation.isPending;
  const isSavingRoster = rosterMutation.isPending || importMutation.isPending;
  const isSavingOpenCall = openCallMutation.isPending;
  const isSavingDefaults = defaultsMutation.isPending;
  const isSavingPrivacy = privacyMutation.isPending;

  const persistedControls = useMemo(() => {
    const boardStepData = stepMap.get('boards')?.data || {};
    const rosterStepData = stepMap.get('roster')?.data || {};
    const latestImport = data?.importJobs?.[0];
    const openCallStepData = stepMap.get('open_call')?.data || {};

    return {
      boards: data?.boards?.map((board) => board.name).filter(Boolean) || BOARD_PRESETS.slice(0, 4),
      rosterPath: rosterStepData.path || (latestImport ? 'import' : 'blank'),
      openCallEnabled: typeof openCallStepData.enabled === 'boolean' ? openCallStepData.enabled : true,
      includesMinors: Boolean(
        boardStepData.acceptsMinors ||
          rosterStepData.includesMinors ||
          latestImport?.includesMinors ||
          openCallStepData.acceptsMinors ||
          agency.minorDataAcknowledgedAt
      ),
    };
  }, [agency.minorDataAcknowledgedAt, data, stepMap]);

  const selectedBoards = boards ?? persistedControls.boards;
  const selectedRosterPath = rosterPath ?? persistedControls.rosterPath;
  const selectedOpenCallEnabled = openCallEnabled ?? persistedControls.openCallEnabled;
  const selectedIncludesMinors = includesMinors ?? persistedControls.includesMinors;

  async function handleLogout() {
    setMessage({ tone: 'status', text: 'Signing out…' });
    try {
      await postLogoutAndRedirectToMarketing();
    } catch (err) {
      setMessage({ tone: 'alert', text: err?.message || 'Sign-out failed. Try again.' });
    }
  }

  if (isLoading) return <SetupSkeleton />;

  if (isError) {
    return (
      <main className="ag-setup-shell">
        <section className="ag-setup-panel">
          <h1>Set up your agency workspace</h1>
          <p>{error?.message || 'Unable to load agency setup.'}</p>
        </section>
      </main>
    );
  }

  const mergedProfile = {
    agencyName: profile.agencyName ?? agency.name ?? '',
    location: profile.location ?? agency.location ?? '',
    website: profile.website ?? agency.website ?? '',
    supportEmail: profile.supportEmail ?? agency.supportEmail ?? '',
    agencyType: profile.agencyType ?? agency.agencyType ?? '',
    description: profile.description ?? agency.description ?? '',
  };

  return (
    <main className="ag-setup-shell">
      <header className="ag-setup-masthead">
        <div>
          <h1>Set up your agency workspace</h1>
          <p>
            Confirm the operating pieces your bookers need before opening the command center:
            agency profile, boards, team access, roster path, open calls, and privacy controls.
          </p>
        </div>
        <button className="ag-setup-secondary" onClick={handleLogout} type="button"><LogOut size={16} /> Sign out</button>
      </header>

      <div className="ag-setup-layout">
        <aside className="ag-setup-ledger" aria-label="Agency setup progress">
          {(data?.steps || []).map((step) => (
            <div className="ag-setup-ledger-row" key={step.key}>
              <span className="ag-setup-ledger-name">{step.label}</span>
              <span className="ag-setup-ledger-state">{statusText(step.status)}</span>
            </div>
          ))}
        </aside>

        <section className="ag-setup-panel" aria-label="Agency setup form">
          <div className="ag-setup-section">
            <div className="ag-setup-section-head">
              <h2>Agency profile</h2>
              <span>{statusText(stepMap.get('profile')?.status)}</span>
            </div>
            <div className="ag-setup-fields ag-setup-fields--two">
              <SetupField label="Agency name">
                <input value={mergedProfile.agencyName} onChange={(e) => setProfile((v) => ({ ...v, agencyName: e.target.value }))} />
              </SetupField>
              <SetupField label="Primary market">
                <input value={mergedProfile.location} onChange={(e) => setProfile((v) => ({ ...v, location: e.target.value }))} placeholder="New York, London, Paris" />
              </SetupField>
              <SetupField label="Website">
                <input type="url" autoComplete="url" value={mergedProfile.website} onChange={(e) => setProfile((v) => ({ ...v, website: e.target.value }))} />
              </SetupField>
              <SetupField label="Support / inbound email">
                <input type="email" autoComplete="email" value={mergedProfile.supportEmail} onChange={(e) => setProfile((v) => ({ ...v, supportEmail: e.target.value }))} />
              </SetupField>
              <SetupField label="Agency type">
                <input value={mergedProfile.agencyType} onChange={(e) => setProfile((v) => ({ ...v, agencyType: e.target.value }))} placeholder="Mother agency, market agency, management" />
              </SetupField>
            </div>
            <SetupField label="Public agency note">
              <textarea value={mergedProfile.description} onChange={(e) => setProfile((v) => ({ ...v, description: e.target.value }))} rows={3} />
            </SetupField>
            <button className="ag-setup-primary" disabled={isSavingProfile} onClick={() => profileMutation.mutate(mergedProfile)} type="button">{isSavingProfile ? 'Saving profile…' : 'Save profile'}</button>
          </div>

          <div className="ag-setup-section">
            <div className="ag-setup-section-head">
              <h2>Boards and routing</h2>
              <span>{statusText(stepMap.get('boards')?.status)}</span>
            </div>
            <p className="ag-setup-copy">Choose standing roster boards. Casting boards stay separate for client briefs and packages.</p>
            <div className="ag-setup-board-list">
              {BOARD_PRESETS.map((name) => (
                <label key={name} className="ag-setup-choice">
                  <input type="checkbox" checked={selectedBoards.includes(name)} onChange={(event) => {
                    setBoards((current) => {
                      const nextBoards = current ?? selectedBoards;
                      return event.target.checked ? [...new Set([...nextBoards, name])] : nextBoards.filter((board) => board !== name);
                    });
                  }} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <label className="ag-setup-choice ag-setup-choice--plain">
              <input type="checkbox" checked={selectedIncludesMinors} onChange={(e) => setIncludesMinors(e.target.checked)} />
              <span>This agency handles kids/teens or imported roster data may include minors.</span>
            </label>
            <button className="ag-setup-primary" disabled={isSavingBoards} onClick={() => boardsMutation.mutate({ boards: selectedBoards, acceptsMinors: selectedIncludesMinors })} type="button">{isSavingBoards ? 'Saving boards…' : 'Save boards'}</button>
          </div>

          <div className="ag-setup-section">
            <div className="ag-setup-section-head">
              <h2>Team and roster</h2>
              <span>{statusText(stepMap.get('team')?.status)} · {statusText(stepMap.get('roster')?.status)}</span>
            </div>
            <div className="ag-setup-actions-row">
              <button className="ag-setup-secondary" disabled={isSavingTeam} onClick={() => teamMutation.mutate({ skipped: true })} type="button">{isSavingTeam ? 'Saving team…' : 'Invite team later'}</button>
              <select value={selectedRosterPath} disabled={isSavingRoster} onChange={(e) => setRosterPath(e.target.value)}>
                <option value="blank">Start with a blank roster</option>
                <option value="manual">Add talent manually</option>
                <option value="import">Request import support</option>
              </select>
              <button className="ag-setup-secondary" disabled={isSavingRoster} onClick={() => {
                if (selectedRosterPath === 'import') importMutation.mutate({ sourceType: 'concierge', includesMinors: selectedIncludesMinors });
                else rosterMutation.mutate({ path: selectedRosterPath });
              }} type="button">{isSavingRoster ? 'Saving roster…' : 'Save roster path'}</button>
            </div>
          </div>

          <div className="ag-setup-section">
            <div className="ag-setup-section-head">
              <h2>Open calls and defaults</h2>
              <span>{statusText(stepMap.get('open_call')?.status)} · {statusText(stepMap.get('defaults')?.status)}</span>
            </div>
            <div className="ag-setup-actions-row">
              <label className="ag-setup-choice ag-setup-choice--plain">
                <input type="checkbox" checked={selectedOpenCallEnabled} onChange={(e) => setOpenCallEnabled(e.target.checked)} />
                <span>Prepare an agency open-call link after setup.</span>
              </label>
              <button className="ag-setup-secondary" disabled={isSavingOpenCall} onClick={() => openCallMutation.mutate({ enabled: selectedOpenCallEnabled, acceptsMinors: selectedIncludesMinors })} type="button">{isSavingOpenCall ? 'Saving open call…' : 'Save open-call choice'}</button>
              <button className="ag-setup-secondary" disabled={isSavingDefaults} onClick={() => defaultsMutation.mutate({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, currency: 'USD', units: 'imperial_metric' })} type="button">{isSavingDefaults ? 'Saving defaults…' : 'Use operating defaults'}</button>
            </div>
          </div>

          <div className="ag-setup-section">
            <div className="ag-setup-section-head">
              <h2>Privacy acknowledgement</h2>
              <span>{statusText(stepMap.get('privacy')?.status)}</span>
            </div>
            <p className="ag-setup-copy">Talent images, measurements, submissions, and minor records require controlled team access. Minor imports or kids/teens boards stay in review until consent and visibility handling is confirmed.</p>
            <button className="ag-setup-primary" disabled={isSavingPrivacy} onClick={() => privacyMutation.mutate({ acknowledgesMinorData: true })} type="button"><Check size={16} /> {isSavingPrivacy ? 'Saving privacy…' : 'Acknowledge privacy controls'}</button>
          </div>
        </section>

        <aside className="ag-setup-summary">
          <h2>Workspace ledger</h2>
          <p>{requiredComplete ? 'Required setup is complete. You can open the agency dashboard.' : 'Complete each required row to open the agency dashboard.'}</p>
          {message.text ? <p className="ag-setup-message" role={message.tone} aria-live={message.tone === 'alert' ? 'assertive' : 'polite'}>{message.text}</p> : null}
          <button className="ag-setup-primary ag-setup-primary--wide" disabled={!requiredComplete || completeMutation.isPending} onClick={() => completeMutation.mutate()} type="button">
            Enter agency dashboard <ArrowRight size={16} />
          </button>
        </aside>
      </div>
    </main>
  );
}
