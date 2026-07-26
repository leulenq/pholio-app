import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
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
import PholioBillingWordmark from '../../../../shared/components/billing/PholioBillingWordmark';
import SetupStage from './SetupStage';
import OptionRow from './OptionRow';
import {
  AGENCY_TYPES,
  BOARD_PRESETS,
  CHAPTERS,
  CURRENCIES,
  ROSTER_PATHS,
  UNIT_OPTIONS,
} from './chapters';
import './SetupPage.css';

const DETECTED_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="stg-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="stg-field__error">{error}</p> : null}
      {!error && hint ? <p className="stg-field__hint">{hint}</p> : null}
    </div>
  );
}

export default function AgencySetupPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['agency', 'setup'],
    queryFn: getAgencySetup,
  });

  if (isLoading) {
    return (
      <main className="stg-plain" role="status" aria-label="Opening agency setup">
        <div className="stg-skeleton" aria-hidden="true">
          <span className="stg-sk stg-sk--mark" />
          <span className="stg-sk stg-sk--title" />
          <span className="stg-sk stg-sk--line" />
          <span className="stg-sk stg-sk--block" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="stg-plain">
        <section className="stg-centered" role="alert">
          <div role="img" aria-label="Pholio">
            <PholioBillingWordmark variant="on-cream" size="sm" />
          </div>
          <h1>We couldn’t open your agency setup.</h1>
          <p>{error?.message || 'The agency workspace could not be loaded.'}</p>
          <button type="button" className="stg-button stg-button--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  return <SetupExperience key={data.agency?.id || 'agency-setup'} data={data} />;
}

function SetupExperience({ data }) {
  const queryClient = useQueryClient();
  const agency = data.agency || {};

  const persisted = useMemo(() => {
    const stepMap = new Map((data.steps || []).map((step) => [step.key, step]));
    const stepData = (key) => stepMap.get(key)?.data || {};
    const boardStep = stepData('boards');
    const rosterStep = stepData('roster');
    const openCallStep = stepData('open_call');
    const defaultsStep = stepData('defaults');
    const latestImport = data.importJobs?.[0];

    const firstIncomplete = CHAPTERS.findIndex((chapter) =>
      chapter.steps.some((key) => stepMap.get(key)?.status !== 'complete'),
    );

    return {
      // Returning bookers resume at the first unfinished beat. When every step
      // is already saved they land on the closing chapter to commission.
      firstIncomplete: firstIncomplete === -1 ? CHAPTERS.length - 1 : firstIncomplete,
      boards: (data.boards || []).map((board) => board.name).filter(Boolean),
      rosterPath: rosterStep.path || (latestImport ? 'import' : 'blank'),
      openCallEnabled: typeof openCallStep.enabled === 'boolean' ? openCallStep.enabled : true,
      currency: defaultsStep.currency || 'USD',
      units: defaultsStep.units || 'imperial_metric',
      includesMinors: Boolean(
        boardStep.acceptsMinors
          || rosterStep.includesMinors
          || openCallStep.acceptsMinors
          || latestImport?.includesMinors
          || agency.minorDataAcknowledgedAt,
      ),
    };
  }, [agency.minorDataAcknowledgedAt, data]);

  const [chapterIndex, setChapterIndex] = useState(persisted.firstIncomplete);
  const [profile, setProfile] = useState({
    agencyName: agency.name || '',
    location: agency.location || '',
    website: agency.website || '',
    supportEmail: agency.supportEmail || '',
    agencyType: agency.agencyType || '',
    description: agency.description || '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [boards, setBoards] = useState(persisted.boards);
  const [includesMinors, setIncludesMinors] = useState(persisted.includesMinors);
  const [rosterPath, setRosterPath] = useState(persisted.rosterPath);
  const [openCallEnabled, setOpenCallEnabled] = useState(persisted.openCallEnabled);
  const [currency, setCurrency] = useState(persisted.currency);
  const [units, setUnits] = useState(persisted.units);
  const [privacyAck, setPrivacyAck] = useState(false);
  const [dockError, setDockError] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [openedWorkspace, setOpenedWorkspace] = useState(null);

  const chapter = CHAPTERS[chapterIndex];

  const profileMutation = useMutation({ mutationFn: saveSetupProfile });
  const boardsMutation = useMutation({ mutationFn: saveSetupBoards });
  const rosterMutation = useMutation({ mutationFn: saveSetupRoster });
  const importMutation = useMutation({ mutationFn: createImportJob });
  const teamMutation = useMutation({ mutationFn: saveSetupTeam });
  const openCallMutation = useMutation({ mutationFn: saveSetupOpenCall });
  const defaultsMutation = useMutation({ mutationFn: saveSetupDefaults });
  const privacyMutation = useMutation({ mutationFn: saveSetupPrivacy });
  const completeMutation = useMutation({ mutationFn: completeAgencySetup });

  const setProfileField = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setDockError('');
  };

  const toggleBoard = (name, next) => {
    setDockError('');
    setBoards((current) => {
      if (next) return [...new Set([...current, name])];
      return current.filter((board) => board !== name);
    });
    // Selecting the kids/teens board means this workspace will hold minor
    // records, which the custody chapter has to account for.
    if (next && BOARD_PRESETS.find((board) => board.name === name)?.minors) {
      setIncludesMinors(true);
    }
  };

  const validateAgencyChapter = () => {
    const errors = {};
    if (!profile.agencyName.trim()) {
      errors.agencyName = 'Enter the agency name as it appears on your contracts.';
    }
    if (profile.website.trim()) {
      try {
        const url = new URL(profile.website.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      } catch {
        errors.website = 'Enter a full address, including https://';
      }
    }
    if (profile.supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.supportEmail.trim())) {
      errors.supportEmail = 'Enter a valid email address.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canContinue = useMemo(() => {
    if (chapter.id === 'agency') return Boolean(profile.agencyName.trim());
    if (chapter.id === 'boards') return boards.length > 0;
    if (chapter.id === 'custody') return privacyAck;
    return true;
  }, [boards.length, chapter.id, privacyAck, profile.agencyName]);

  /** Commits the current chapter's backend steps, then advances the beat. */
  const commitChapter = async () => {
    setDockError('');

    if (chapter.id === 'agency' && !validateAgencyChapter()) return;

    setIsCommitting(true);
    try {
      let latest = null;

      if (chapter.id === 'agency') {
        latest = await profileMutation.mutateAsync({
          agencyName: profile.agencyName.trim(),
          location: profile.location.trim(),
          website: profile.website.trim(),
          supportEmail: profile.supportEmail.trim(),
          agencyType: profile.agencyType,
          description: profile.description.trim(),
        });
      }

      if (chapter.id === 'boards') {
        latest = await boardsMutation.mutateAsync({ boards, acceptsMinors: includesMinors });
      }

      if (chapter.id === 'roster') {
        if (rosterPath === 'import') {
          await importMutation.mutateAsync({ sourceType: 'concierge', includesMinors });
        }
        // Always record the chosen path so the step lands `complete`. An import
        // job that needs review stays flagged on the job itself, not on setup.
        await rosterMutation.mutateAsync({ path: rosterPath });
        latest = await teamMutation.mutateAsync({ skipped: true });
      }

      if (chapter.id === 'intake') {
        await openCallMutation.mutateAsync({
          enabled: openCallEnabled,
          acceptsMinors: openCallEnabled && includesMinors,
        });
        latest = await defaultsMutation.mutateAsync({
          timezone: DETECTED_TIMEZONE,
          currency,
          units,
        });
      }

      if (chapter.id === 'custody') {
        await privacyMutation.mutateAsync({ acknowledgesMinorData: true });
        const result = await completeMutation.mutateAsync();
        queryClient.invalidateQueries({ queryKey: ['session', 'agency'] });
        setOpenedWorkspace(result?.redirect || '/dashboard/agency');
        return;
      }

      if (latest) queryClient.setQueryData(['agency', 'setup'], latest);
      setChapterIndex((index) => Math.min(CHAPTERS.length - 1, index + 1));
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      setDockError(err?.message || 'That step could not be saved. Try again.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleBack = () => {
    setDockError('');
    setChapterIndex((index) => Math.max(0, index - 1));
  };

  const handleSignOut = async () => {
    try {
      await postLogoutAndRedirectToMarketing();
    } catch (err) {
      setDockError(err?.message || 'Sign-out failed. Try again.');
    }
  };

  if (openedWorkspace) {
    return (
      <main className="stg-plain">
        <section className="stg-centered" role="status" aria-live="polite">
          <div role="img" aria-label="Pholio">
            <PholioBillingWordmark variant="on-cream" size="md" />
          </div>
          <h1>The workspace is open.</h1>
          <p>
            {profile.agencyName || 'Your agency'} is commissioned. Your boards are standing
            and the inbox is live.
          </p>
          <button
            type="button"
            className="stg-button stg-button--primary"
            onClick={() => window.location.assign(openedWorkspace)}
          >
            Enter the command center
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>
      </main>
    );
  }

  return (
    <SetupStage
      chapterIndex={chapterIndex}
      agencyName={profile.agencyName.trim()}
      agencyMarket={profile.location.trim()}
      isBusy={isCommitting}
      canContinue={canContinue}
      error={dockError}
      onBack={handleBack}
      onContinue={commitChapter}
      onSignOut={handleSignOut}
    >
      {chapter.id === 'agency' && (
        <>
          <div className="stg-grid">
            <Field label="Agency name" htmlFor="agency-name" error={fieldErrors.agencyName}>
              <input
                id="agency-name"
                value={profile.agencyName}
                onChange={(event) => setProfileField('agencyName', event.target.value)}
                placeholder="Northline Models"
                autoComplete="organization"
                aria-invalid={Boolean(fieldErrors.agencyName)}
                required
              />
            </Field>
            <Field label="Primary market" htmlFor="agency-market">
              <input
                id="agency-market"
                value={profile.location}
                onChange={(event) => setProfileField('location', event.target.value)}
                placeholder="New York"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Website" htmlFor="agency-website" error={fieldErrors.website}>
              <input
                id="agency-website"
                type="url"
                value={profile.website}
                onChange={(event) => setProfileField('website', event.target.value)}
                placeholder="https://northline.com"
                autoComplete="url"
                aria-invalid={Boolean(fieldErrors.website)}
              />
            </Field>
            <Field
              label="Inbound email"
              htmlFor="agency-email"
              hint="Where client and talent enquiries reach you."
              error={fieldErrors.supportEmail}
            >
              <input
                id="agency-email"
                type="email"
                value={profile.supportEmail}
                onChange={(event) => setProfileField('supportEmail', event.target.value)}
                placeholder="bookings@northline.com"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.supportEmail)}
              />
            </Field>
          </div>

          <fieldset className="stg-set">
            <legend>How the agency operates</legend>
            <div className="stg-rows">
              {AGENCY_TYPES.map((type) => (
                <OptionRow
                  key={type.value}
                  type="radio"
                  name="agency-type"
                  label={type.value}
                  hint={type.hint}
                  checked={profile.agencyType === type.value}
                  onChange={() => setProfileField('agencyType', type.value)}
                />
              ))}
            </div>
          </fieldset>

          <Field
            label="Public note"
            htmlFor="agency-note"
            hint="Shown to talent who submit to you. A few lines on what you represent."
          >
            <textarea
              id="agency-note"
              rows={3}
              value={profile.description}
              onChange={(event) => setProfileField('description', event.target.value)}
              placeholder="Northline represents editorial and runway talent across North America, with a development board for new faces."
            />
          </Field>
        </>
      )}

      {chapter.id === 'boards' && (
        <>
          <fieldset className="stg-set">
            <legend>Standing boards</legend>
            <div className="stg-rows stg-rows--split">
              {BOARD_PRESETS.map((board) => (
                <OptionRow
                  key={board.name}
                  label={board.name}
                  hint={board.hint}
                  checked={boards.includes(board.name)}
                  onChange={(next) => toggleBoard(board.name, next)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="stg-set">
            <legend>Minor records</legend>
            <div className="stg-rows">
              <OptionRow
                label="This workspace will hold minor records"
                hint="Kids and teens boards, or imported talent under 18."
                checked={includesMinors}
                onChange={(next) => setIncludesMinors(next)}
              />
            </div>
          </fieldset>
        </>
      )}

      {chapter.id === 'roster' && (
        <>
          <fieldset className="stg-set">
            <legend>Roster path</legend>
            <div className="stg-rows">
              {ROSTER_PATHS.map((path) => (
                <OptionRow
                  key={path.value}
                  type="radio"
                  name="roster-path"
                  label={path.label}
                  hint={path.hint}
                  checked={rosterPath === path.value}
                  onChange={() => { setRosterPath(path.value); setDockError(''); }}
                />
              ))}
            </div>
          </fieldset>

          <section className="stg-note">
            <h3>Who holds a key today</h3>
            <ul className="stg-keys">
              {(data.team || []).map((member) => (
                <li key={member.id}>
                  <span className="stg-keys__name">{member.name || member.email}</span>
                  <span className="stg-keys__role">{roleLabel(member.role)}</span>
                </li>
              ))}
            </ul>
            <p>
              Bookers, scouts, and admins are invited from workspace settings once you are
              inside, so you can set each person’s access against a live roster.
            </p>
          </section>
        </>
      )}

      {chapter.id === 'intake' && (
        <>
          <fieldset className="stg-set">
            <legend>Open call</legend>
            <div className="stg-rows">
              <OptionRow
                label="Prepare an open-call link"
                hint="New faces submit to you directly; everything lands in your inbox for review."
                checked={openCallEnabled}
                onChange={(next) => setOpenCallEnabled(next)}
              />
            </div>
          </fieldset>

          <fieldset className="stg-set">
            <legend>Operating defaults</legend>
            <dl className="stg-defaults">
              <div>
                <dt>Time zone</dt>
                <dd>{DETECTED_TIMEZONE.replace(/_/g, ' ')}</dd>
              </div>
            </dl>
            <div className="stg-grid">
              <Field label="Currency" htmlFor="agency-currency">
                <select
                  id="agency-currency"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </Field>
              <Field label="Measurements" htmlFor="agency-units">
                <select
                  id="agency-units"
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                >
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
        </>
      )}

      {chapter.id === 'custody' && (
        <>
          <section className="stg-note">
            <h3>What your team can reach</h3>
            <p>
              Digitals, measurements, submissions, and contact details are visible only to the
              logins you approve. Talent keep control of their own records, and every export
              leaving Pholio is attributed to the booker who made it.
            </p>
            {includesMinors ? (
              <p>
                Because this workspace will hold minor records, kids and teens boards and any
                import containing minors stay in review until guardian consent and visibility
                handling are confirmed.
              </p>
            ) : null}
          </section>

          <fieldset className="stg-set">
            <legend>Acknowledgement</legend>
            <div className="stg-rows">
              <OptionRow
                label="I accept custody of this talent data"
                hint="Access is controlled by my team, and minor records are handled under guardian consent."
                checked={privacyAck}
                onChange={(next) => { setPrivacyAck(next); setDockError(''); }}
              />
            </div>
          </fieldset>
        </>
      )}
    </SetupStage>
  );
}

function roleLabel(role) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'ADMIN') return 'Administrator';
  if (role === 'AGENT') return 'Booker';
  if (role === 'SCOUT') return 'Scout';
  if (role === 'VIEWER') return 'View only';
  return role;
}
