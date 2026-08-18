import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import {
  completeAgencySetup,
  getAgencySetup,
  saveSetupBoards,
  saveSetupDefaults,
  saveSetupOpenCall,
  saveSetupPrivacy,
  saveSetupProfile,
  saveSetupTeam,
} from '../../api/setup';
import { addAgencyTeamMember } from '../../api/agency';
import { postLogoutAndRedirectToMarketing } from '../../../../shared/lib/logout';
import SetupStage from './SetupStage';
import WelcomeScreen from './WelcomeScreen';
import OptionRow from './OptionRow';
import {
  AGENCY_TYPES,
  BOARD_PRESETS,
  CHAPTERS,
  CURRENCIES,
  TEAM_ROLES,
  UNIT_OPTIONS,
} from './chapters';
import './SetupPage.css';

const BROWSER_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const MINORS_BOARD = BOARD_PRESETS.find((board) => board.minors)?.name;

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
  const onFile = data.onFile || null;

  const persisted = useMemo(() => {
    const stepMap = new Map((data.steps || []).map((step) => [step.key, step]));
    const stepData = (key) => stepMap.get(key)?.data || {};
    const boardStep = stepData('boards');
    const openCallStep = stepData('open_call');
    const defaultsStep = stepData('defaults');
    const teamStep = stepData('team');

    const firstIncomplete = CHAPTERS.findIndex((chapter) =>
      chapter.steps.some((key) => stepMap.get(key)?.status !== 'complete'),
    );

    // Saved boards win; otherwise pre-select the boards the agency named in
    // the request Pholio approved. Only fall back to nothing if neither exists.
    const savedBoards = (data.boards || []).map((board) => board.name).filter(Boolean);
    const declaredBoards = matchDeclaredBoards(onFile?.boards);

    return {
      // Returning bookers resume at the first unfinished beat. When every step
      // is saved they land on the closing chapter to commission.
      firstIncomplete: firstIncomplete === -1 ? CHAPTERS.length - 1 : firstIncomplete,
      hasStarted: (data.steps || []).some((step) => step.status === 'complete'),
      boards: savedBoards.length ? savedBoards : declaredBoards,
      teamSkipped: teamStep.skipped,
      openCallEnabled: typeof openCallStep.enabled === 'boolean' ? openCallStep.enabled : true,
      timezone: defaultsStep.timezone || onFile?.timezone || BROWSER_TIMEZONE,
      currency: defaultsStep.currency || 'USD',
      units: defaultsStep.units || 'imperial_metric',
      holdsMinors: Boolean(
        boardStep.acceptsMinors
          || openCallStep.acceptsMinors
          || agency.minorDataAcknowledgedAt,
      ),
    };
  }, [agency.minorDataAcknowledgedAt, data, onFile]);

  // An agency that has already saved a step has been past the welcome.
  const [hasEntered, setHasEntered] = useState(persisted.hasStarted);
  const [chapterIndex, setChapterIndex] = useState(persisted.firstIncomplete);
  const [record, setRecord] = useState({
    agencyName: agency.name || onFile?.agencyName || '',
    location: agency.location || onFile?.market || '',
    website: agency.website || onFile?.website || '',
    agencyType: agency.agencyType || onFile?.agencyType || '',
  });
  const [timezone, setTimezone] = useState(persisted.timezone);
  const [currency, setCurrency] = useState(persisted.currency);
  const [units, setUnits] = useState(persisted.units);
  const [fieldErrors, setFieldErrors] = useState({});
  const [boards, setBoards] = useState(persisted.boards);
  const [invites, setInvites] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('AGENT');
  const [openCallEnabled, setOpenCallEnabled] = useState(persisted.openCallEnabled);
  const [publicNote, setPublicNote] = useState(agency.description || '');
  const [inboundEmail, setInboundEmail] = useState(agency.supportEmail || '');
  const [minorsDeclared, setMinorsDeclared] = useState(persisted.holdsMinors);
  const [custodyAck, setCustodyAck] = useState(false);
  const [dockError, setDockError] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [openedWorkspace, setOpenedWorkspace] = useState(null);

  const chapter = CHAPTERS[chapterIndex];

  // A kids/teens board is itself a declaration that the workspace holds minors.
  const holdsMinorRecords = minorsDeclared || boards.includes(MINORS_BOARD);

  const profileMutation = useMutation({ mutationFn: saveSetupProfile });
  const defaultsMutation = useMutation({ mutationFn: saveSetupDefaults });
  const boardsMutation = useMutation({ mutationFn: saveSetupBoards });
  const teamMutation = useMutation({ mutationFn: saveSetupTeam });
  const inviteMutation = useMutation({ mutationFn: addAgencyTeamMember });
  const openCallMutation = useMutation({ mutationFn: saveSetupOpenCall });
  const privacyMutation = useMutation({ mutationFn: saveSetupPrivacy });
  const completeMutation = useMutation({ mutationFn: completeAgencySetup });

  /**
   * The profile endpoint writes every column it reads, so a partial payload
   * would null out fields saved by another chapter. Always send the whole
   * record.
   */
  const profilePayload = () => ({
    agencyName: record.agencyName.trim(),
    location: record.location.trim(),
    website: record.website.trim(),
    agencyType: record.agencyType,
    description: publicNote.trim(),
    supportEmail: inboundEmail.trim(),
  });

  const setRecordField = (key, value) => {
    setRecord((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setDockError('');
  };

  const toggleBoard = (name, next) => {
    setDockError('');
    setBoards((current) => (next
      ? [...new Set([...current, name])]
      : current.filter((board) => board !== name)));
  };

  const validateRecord = () => {
    const errors = {};
    if (!record.agencyName.trim()) {
      errors.agencyName = 'Enter the agency name as it appears on your contracts.';
    }
    if (record.website.trim() && !isHttpUrl(record.website.trim())) {
      errors.website = 'Enter a full address, including https://';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateIntake = () => {
    const errors = {};
    if (inboundEmail.trim() && !isEmail(inboundEmail.trim())) {
      errors.inboundEmail = 'Enter a valid email address.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canContinue = useMemo(() => {
    if (chapter.id === 'record') return Boolean(record.agencyName.trim());
    if (chapter.id === 'boards') return boards.length > 0;
    if (chapter.id === 'custody') return custodyAck;
    return true;
  }, [boards.length, chapter.id, custodyAck, record.agencyName]);

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!isEmail(email)) {
      setFieldErrors((current) => ({ ...current, inviteEmail: 'Enter a valid email address.' }));
      return;
    }
    if (invites.some((invite) => invite.email === email)) {
      setFieldErrors((current) => ({ ...current, inviteEmail: 'That person is already invited.' }));
      return;
    }
    setFieldErrors((current) => ({ ...current, inviteEmail: undefined }));
    setDockError('');
    try {
      await inviteMutation.mutateAsync({ email, membership_role: inviteRole });
      setInvites((current) => [...current, { email, role: inviteRole }]);
      setInviteEmail('');
    } catch (err) {
      setFieldErrors((current) => ({
        ...current,
        inviteEmail: err?.message || 'That invitation could not be sent.',
      }));
    }
  };

  /** Commits the current chapter's backend steps, then advances the beat. */
  const commitChapter = async () => {
    setDockError('');
    if (chapter.id === 'record' && !validateRecord()) return;
    if (chapter.id === 'intake' && !validateIntake()) return;

    setIsCommitting(true);
    try {
      let latest = null;

      if (chapter.id === 'record') {
        await profileMutation.mutateAsync(profilePayload());
        latest = await defaultsMutation.mutateAsync({ timezone, currency, units });
      }

      if (chapter.id === 'boards') {
        latest = await boardsMutation.mutateAsync({
          boards,
          acceptsMinors: boards.includes(MINORS_BOARD),
        });
      }

      if (chapter.id === 'team') {
        latest = await teamMutation.mutateAsync({ skipped: invites.length === 0 });
      }

      if (chapter.id === 'intake') {
        await profileMutation.mutateAsync(profilePayload());
        latest = await openCallMutation.mutateAsync({
          enabled: openCallEnabled,
          acceptsMinors: openCallEnabled && holdsMinorRecords,
        });
      }

      if (chapter.id === 'custody') {
        await privacyMutation.mutateAsync({ acknowledgesMinorData: holdsMinorRecords });
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

  const handleSignOut = async () => {
    try {
      await postLogoutAndRedirectToMarketing();
    } catch (err) {
      setDockError(err?.message || 'Sign-out failed. Try again.');
    }
  };

  if (!hasEntered) {
    return (
      <WelcomeScreen
        agencyName={record.agencyName}
        contactFirstName={firstNameOf(onFile?.contactName)}
        approvedAt={onFile?.approvedAt}
        onBegin={() => setHasEntered(true)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (openedWorkspace) {
    return (
      <main className="stg-plain">
        <section className="stg-centered" role="status" aria-live="polite">
          <h1>The workspace is open.</h1>
          <p>
            {record.agencyName || 'Your agency'} is commissioned. Your intake boards and
            inbox are live.
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
      agencyName={record.agencyName.trim()}
      isBusy={isCommitting}
      canContinue={canContinue}
      error={dockError}
      onBack={() => { setDockError(''); setChapterIndex((i) => Math.max(0, i - 1)); }}
      onContinue={commitChapter}
      onSignOut={handleSignOut}
    >
      {chapter.id === 'record' && (
        <>
          {onFile ? (
            <p className="stg-onfile">
              Taken from the access request approved for {onFile.contactName || 'your agency'}
              {onFile.contactRole ? `, ${onFile.contactRole}` : ''}.
            </p>
          ) : null}

          <div className="stg-grid">
            <Field label="Agency name" htmlFor="agency-name" error={fieldErrors.agencyName}>
              <input
                id="agency-name"
                value={record.agencyName}
                onChange={(e) => setRecordField('agencyName', e.target.value)}
                autoComplete="organization"
                aria-invalid={Boolean(fieldErrors.agencyName)}
                required
              />
            </Field>
            <Field label="Primary market" htmlFor="agency-market">
              <input
                id="agency-market"
                value={record.location}
                onChange={(e) => setRecordField('location', e.target.value)}
                placeholder="New York"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Website" htmlFor="agency-website" error={fieldErrors.website}>
              <input
                id="agency-website"
                type="url"
                value={record.website}
                onChange={(e) => setRecordField('website', e.target.value)}
                placeholder="https://northline.com"
                autoComplete="url"
                aria-invalid={Boolean(fieldErrors.website)}
              />
            </Field>
            <Field label="Time zone" htmlFor="agency-timezone" hint="Used for call times, castings, and reminders.">
              <input
                id="agency-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </Field>
            <Field label="Currency" htmlFor="agency-currency">
              <select id="agency-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
            <Field label="Measurements" htmlFor="agency-units">
              <select id="agency-units" value={units} onChange={(e) => setUnits(e.target.value)}>
                {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
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
                  checked={record.agencyType === type.value}
                  onChange={() => setRecordField('agencyType', type.value)}
                />
              ))}
            </div>
          </fieldset>
        </>
      )}

      {chapter.id === 'boards' && (
        <fieldset className="stg-set">
          <legend>Intake boards</legend>
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
      )}

      {chapter.id === 'team' && (
        <>
          <div className="stg-grid">
            <Field label="Work email" htmlFor="invite-email" error={fieldErrors.inviteEmail}>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setFieldErrors((c) => ({ ...c, inviteEmail: undefined })); }}
                placeholder="booker@youragency.com"
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.inviteEmail)}
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          <p className="stg-field__hint stg-onfile">
            {TEAM_ROLES.find((r) => r.value === inviteRole)?.hint}
          </p>
          <div>
            <button
              type="button"
              className="stg-button stg-button--secondary"
              onClick={sendInvite}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
            >
              {inviteMutation.isPending ? 'Sending…' : 'Send invitation'}
            </button>
          </div>

          <section className="stg-note">
            <h3>Who holds a key</h3>
            <ul className="stg-keys">
              {(data.team || []).map((member) => (
                <li key={member.id}>
                  <span className="stg-keys__name">{member.name || member.email}</span>
                  <span className="stg-keys__role">{roleLabel(member.role)}</span>
                </li>
              ))}
              {invites.map((invite) => (
                <li key={invite.email}>
                  <span className="stg-keys__name">{invite.email}</span>
                  <span className="stg-keys__role">{roleLabel(invite.role)} · invited</span>
                </li>
              ))}
            </ul>
            <p>
              Invitations are sent immediately and expire if unused. You can invite the rest
              of the team, change roles, or revoke access from workspace settings at any time.
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
                onChange={setOpenCallEnabled}
              />
            </div>
          </fieldset>

          <Field
            label="Inbound email"
            htmlFor="agency-inbound"
            hint="Where client and talent enquiries reach you. This is published, so use an agency address rather than a personal one."
            error={fieldErrors.inboundEmail}
          >
            <input
              id="agency-inbound"
              type="email"
              value={inboundEmail}
              onChange={(e) => { setInboundEmail(e.target.value); setFieldErrors((c) => ({ ...c, inboundEmail: undefined })); }}
              placeholder="bookings@youragency.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.inboundEmail)}
            />
          </Field>

          <Field
            label="What talent see"
            htmlFor="agency-note"
            hint="Shown on your open call. A few lines on what you represent and who you are looking for."
          >
            <textarea
              id="agency-note"
              rows={3}
              value={publicNote}
              onChange={(e) => setPublicNote(e.target.value)}
              placeholder="Northline represents editorial and runway talent across North America, with a development board for new faces."
            />
          </Field>
        </>
      )}

      {chapter.id === 'custody' && (
        <>
          <fieldset className="stg-set">
            <legend>Minor records</legend>
            <div className="stg-rows">
              <OptionRow
                label="This workspace will hold minor records"
                hint="A kids or teens board, or imported talent under 18."
                checked={holdsMinorRecords}
                disabled={boards.includes(MINORS_BOARD)}
                onChange={setMinorsDeclared}
              />
            </div>
            {boards.includes(MINORS_BOARD) ? (
              <p className="stg-field__hint stg-onfile">
                Set by your {MINORS_BOARD} board. Remove that board to change this.
              </p>
            ) : null}
          </fieldset>

          <section className="stg-note">
            <h3>What your team can reach</h3>
            <p>
              Digitals, measurements, submissions, and contact details are visible only to the
              logins you approve. Talent keep control of their own records, and every export
              leaving Pholio is attributed to the booker who made it.
            </p>
            {holdsMinorRecords ? (
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
                hint={holdsMinorRecords
                  ? 'Access is controlled by my team, and minor records are handled under guardian consent.'
                  : 'Access is controlled by my team, and talent records stay behind it.'}
                checked={custodyAck}
                onChange={(next) => { setCustodyAck(next); setDockError(''); }}
              />
            </div>
          </fieldset>
        </>
      )}
    </SetupStage>
  );
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

/** Maps free-text board names from the access request onto Pholio's presets. */
function matchDeclaredBoards(declared) {
  if (!Array.isArray(declared)) return [];
  const presets = BOARD_PRESETS.map((board) => board.name);
  const normalize = (value) => String(value).toLowerCase().replace(/[^a-z]/g, '');
  return presets.filter((preset) =>
    declared.some((entry) => normalize(entry) === normalize(preset)),
  );
}

function roleLabel(role) {
  const known = TEAM_ROLES.find((entry) => entry.value === role);
  if (known) return known.label;
  return role === 'OWNER' ? 'Owner' : role;
}
