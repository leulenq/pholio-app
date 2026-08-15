import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Info, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import {
  getSpecBuilder,
  publishSpecDraft,
  saveSpecDraft,
} from '../../api/agency';
import './SpecBuilderPanel.css';

/*
 * Spec Builder — an agency states what its open-call applicants should send.
 *
 * Published requirements are advisory by design. A1 invariant 3 keeps the
 * open-call path free and unlimited, so what an agency writes here tells an
 * applicant what is missing; it never blocks a submission. The panel says so
 * plainly rather than letting the agency infer enforcement it does not have.
 *
 * The vocabulary is served by the API, not hardcoded here: the taxonomy is the
 * source of truth for which fields exist and which values each one accepts, and
 * fields an agency may not require come back with the reason they are absent.
 */

const GROUPS = [
  {
    key: 'shots',
    title: 'Shots',
    blurb: 'The pictures you want. Each row is one required frame.',
    add: 'Add a shot',
  },
  {
    key: 'presentation',
    title: 'How the pictures should look',
    blurb: 'Rules about the photograph — hair, makeup, background, filters.',
    add: 'Add a rule',
  },
  {
    key: 'files',
    title: 'File limits',
    blurb: 'Size and format limits your systems need.',
    add: 'Add a limit',
  },
  {
    key: 'eligibility',
    title: 'Who this is for',
    blurb:
      'Facts about the applicant. Stated up front so nobody applies into a requirement they cannot meet.',
    add: 'Add a requirement',
  },
];

const MODALITIES = [
  { id: 'required', label: 'Required' },
  { id: 'requested', label: 'Requested' },
  { id: 'preferred', label: 'Preferred' },
  { id: 'encouraged', label: 'Encouraged' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'not_required', label: 'Not required' },
  { id: 'prohibited', label: 'Not allowed' },
];

const OPERATORS = [
  { id: 'equals', label: 'is' },
  { id: 'not_equals', label: 'is not' },
  { id: 'in', label: 'is one of' },
  { id: 'gte', label: 'is at least' },
  { id: 'lte', label: 'is at most' },
  { id: 'gt', label: 'is over' },
  { id: 'lt', label: 'is under' },
];

function emptyRow(group) {
  if (group === 'shots') {
    return {
      label: '',
      field: 'shot.frame',
      value: '',
      minimum: 1,
      maximum: 1,
      modality: 'required',
    };
  }
  if (group === 'files') {
    return {
      label: '',
      field: 'file.size_bytes',
      operator: 'lte',
      value: '',
      unit: 'byte',
      scope: 'per_file',
      modality: 'required',
    };
  }
  if (group === 'eligibility') {
    return { label: '', field: '', operator: 'gte', value: '', unit: null, modality: 'required' };
  }
  return { label: '', field: '', operator: 'equals', value: '', modality: 'required' };
}

/** Values are typed by the taxonomy, so the control follows the field. */
function ValueControl({ field, value, onChange, disabled }) {
  const options = field?.allowedValues || [];

  if (options.length > 0) {
    return (
      <select
        className="st-input sb-control"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label="Value"
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field?.valueType === 'boolean') {
    return (
      <select
        className="st-input sb-control"
        value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : event.target.value === 'true')
        }
        disabled={disabled}
        aria-label="Value"
      >
        <option value="">Choose…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <input
      className="st-input sb-control"
      type={field?.valueType === 'number' ? 'number' : 'text'}
      value={value ?? ''}
      onChange={(event) =>
        onChange(
          field?.valueType === 'number'
            ? event.target.value === ''
              ? null
              : Number(event.target.value)
            : event.target.value,
        )
      }
      disabled={disabled}
      aria-label="Value"
    />
  );
}

function RuleRow({ group, row, index, fields, scopeFields, onChange, onRemove, disabled }) {
  const field = fields.find((candidate) => candidate.id === row.field) || null;
  const scopeField = scopeFields.find((candidate) => candidate.id === row.appliesWhen?.field) || null;
  const patch = (changes) => onChange(index, { ...row, ...changes });

  return (
    <li className="sb-row">
      <div className="sb-row-main">
        <input
          className="st-input sb-label"
          type="text"
          value={row.label || ''}
          maxLength={160}
          placeholder={
            group === 'shots' ? 'e.g. Close-up, hair back' : 'Describe it in your own words'
          }
          onChange={(event) => patch({ label: event.target.value })}
          disabled={disabled}
          aria-label="Your wording"
        />

        <div className="sb-row-controls">
          <select
            className="st-input sb-control"
            value={row.field || ''}
            onChange={(event) => patch({ field: event.target.value, value: '' })}
            disabled={disabled}
            aria-label="Field"
          >
            <option value="">Choose a field…</option>
            {fields.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>

          {group !== 'shots' && (
            <select
              className="st-input sb-control sb-control--narrow"
              value={row.operator || 'equals'}
              onChange={(event) => patch({ operator: event.target.value })}
              disabled={disabled}
              aria-label="Comparison"
            >
              {OPERATORS.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.label}
                </option>
              ))}
            </select>
          )}

          <ValueControl
            field={field}
            value={row.value}
            onChange={(value) => patch({ value })}
            disabled={disabled}
          />

          {group === 'shots' ? (
            <label className="sb-inline-field">
              <span>How many</span>
              <input
                className="st-input sb-control sb-control--tiny"
                type="number"
                min={1}
                value={row.minimum ?? 1}
                onChange={(event) => {
                  const next = Number(event.target.value) || 1;
                  patch({ minimum: next, maximum: next });
                }}
                disabled={disabled}
              />
            </label>
          ) : (
            <select
              className="st-input sb-control sb-control--narrow"
              value={row.modality || 'required'}
              onChange={(event) => patch({ modality: event.target.value })}
              disabled={disabled}
              aria-label="Strength"
            >
              {MODALITIES.map((modality) => (
                <option key={modality.id} value={modality.id}>
                  {modality.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {group === 'eligibility' && (
          <div className="sb-row-scope">
            <span className="sb-scope-lead">Applies to</span>
            <select
              className="st-input sb-control sb-control--narrow"
              value={row.appliesWhen?.field || ''}
              onChange={(event) =>
                patch({
                  appliesWhen: event.target.value
                    ? { field: event.target.value, operator: 'equals', value: '' }
                    : null,
                })
              }
              disabled={disabled}
              aria-label="Applies to"
            >
              <option value="">Everyone</option>
              {scopeFields.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
            {row.appliesWhen?.field && (
              <ValueControl
                field={scopeField}
                value={row.appliesWhen.value}
                onChange={(value) =>
                  patch({ appliesWhen: { ...row.appliesWhen, value } })
                }
                disabled={disabled}
              />
            )}
          </div>
        )}
      </div>

      {!disabled && (
        <button
          type="button"
          className="sb-remove"
          onClick={() => onRemove(index)}
          aria-label="Remove this rule"
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}

export default function SpecBuilderPanel({ canManage = true }) {
  const queryClient = useQueryClient();
  // Local edits shadow the server copy only while they are in flight, so no
  // effect is needed to seed state — the server draft is the fallback until the
  // agency touches something, and publishing clears the shadow again.
  const [pendingDraft, setPendingDraft] = useState(null);
  const [issues, setIssues] = useState([]);
  const [showRefused, setShowRefused] = useState(false);
  const saveTimer = useRef(null);

  const builderQuery = useQuery({
    queryKey: ['agency-spec-builder'],
    queryFn: getSpecBuilder,
    staleTime: 30_000,
    retry: (failureCount, error) => error?.status !== 503 && failureCount < 2,
  });

  const draft = pendingDraft ?? builderQuery.data?.draft ?? null;

  const saveMutation = useMutation({
    mutationFn: saveSpecDraft,
    onSuccess: (data) => {
      setIssues(data?.issues || []);
      queryClient.setQueryData(['agency-spec-builder'], (previous) => ({
        ...(previous || {}),
        ...data,
      }));
    },
    onError: (error) =>
      toast.error(error?.data?.message || error?.message || 'Could not save your changes'),
  });

  const publishMutation = useMutation({
    mutationFn: publishSpecDraft,
    onSuccess: (data) => {
      setPendingDraft(null);
      setIssues([]);
      queryClient.invalidateQueries({ queryKey: ['agency-spec-builder'] });
      toast.success(
        data?.published === false
          ? 'Already published — nothing has changed since'
          : `Requirements published (revision ${data?.revision ?? ''})`.trim(),
      );
    },
    onError: (error) => {
      const details = error?.data?.details;
      if (Array.isArray(details) && details.length) setIssues(details);
      toast.error(error?.data?.message || error?.message || 'Could not publish');
    },
  });

  // Debounced so a save follows a pause in typing rather than every keystroke.
  const queueSave = useCallback(
    (next) => {
      setPendingDraft(next);
      if (!canManage) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveMutation.mutate(next), 600);
    },
    [canManage, saveMutation],
  );

  useEffect(() => () => saveTimer.current && clearTimeout(saveTimer.current), []);

  const state = builderQuery.data;
  const vocabulary = state?.vocabulary;

  const rowsFor = useCallback(
    (group) => (group === 'shots' ? draft?.shots?.slots || [] : draft?.[group] || []),
    [draft],
  );

  const setRows = useCallback(
    (group, rows) => {
      if (!draft) return;
      queueSave(
        group === 'shots'
          ? { ...draft, shots: { ...(draft.shots || {}), slots: rows } }
          : { ...draft, [group]: rows },
      );
    },
    [draft, queueSave],
  );

  const issuesByLocation = useMemo(() => {
    const map = new Map();
    for (const issue of issues) {
      const key = String(issue.location || '').split('/').filter(Boolean)[1] || 'general';
      map.set(key, [...(map.get(key) || []), issue]);
    }
    return map;
  }, [issues]);

  // 503 covers both "this build reached the environment before its migration"
  // and "the registry is not published here". Neither is the agency's doing.
  const unavailable =
    builderQuery.error?.status === 503 ||
    ['SPEC_BUILDER_UNAVAILABLE', 'SPEC_REGISTRY_UNAVAILABLE'].includes(
      builderQuery.error?.data?.error,
    );

  if (unavailable) {
    return (
      <div className="st-fieldset st-fieldset--last">
        <div className="st-empty-inline">
          <ClipboardList size={20} />
          <span>Requirements are not available in this environment yet.</span>
        </div>
      </div>
    );
  }

  if (builderQuery.isLoading || !draft) {
    return (
      <div className="st-panel-loading">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="st-skel" />
        ))}
      </div>
    );
  }

  const blocked = state?.openCall === null;

  return (
    <>
      <div className="st-notice">
        <span className="st-notice-icon"><ClipboardList size={18} /></span>
        <div>
          <span className="st-notice-title">What your applicants should send</span>
          <span className="st-notice-text">
            Applicants see this before they apply, and Pholio tells them which of your
            requirements their current pictures already meet. It is guidance, not a gate —
            anyone can still submit, and nothing here can turn an applicant away.
          </span>
        </div>
      </div>

      {blocked && (
        <div className="st-fieldset">
          <div className="st-empty-inline">
            <Info size={20} />
            <span>
              Create an open call link first. Requirements describe what applicants arriving
              through that link should send.
            </span>
          </div>
        </div>
      )}

      {GROUPS.map((group) => {
        const fields = vocabulary?.groups?.[group.key] || [];
        const rows = rowsFor(group.key);
        const groupIssues = issuesByLocation.get(group.key) || [];

        return (
          <div className="st-fieldset" key={group.key}>
            <div className="st-fieldset-head">
              <h3 className="st-fieldset-title">{group.title}</h3>
              <p className="st-fieldset-sub">{group.blurb}</p>
            </div>

            {rows.length === 0 ? (
              <p className="sb-empty">Nothing set. Applicants will see no requirement here.</p>
            ) : (
              <ul className="sb-list">
                {rows.map((row, index) => (
                  <RuleRow
                    key={row.id || `${group.key}-${index}`}
                    group={group.key}
                    row={row}
                    index={index}
                    fields={fields}
                    scopeFields={vocabulary?.scopeFields || []}
                    disabled={!canManage}
                    onChange={(position, next) =>
                      setRows(
                        group.key,
                        rows.map((existing, cursor) => (cursor === position ? next : existing)),
                      )
                    }
                    onRemove={(position) =>
                      setRows(
                        group.key,
                        rows.filter((_, cursor) => cursor !== position),
                      )
                    }
                  />
                ))}
              </ul>
            )}

            {groupIssues.length > 0 && (
              <ul className="sb-issues">
                {groupIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            )}

            {canManage && (
              <AgencyButton
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => setRows(group.key, [...rows, emptyRow(group.key)])}
              >
                {group.add}
              </AgencyButton>
            )}

            {group.key === 'eligibility' && vocabulary?.refused?.length > 0 && (
              <div className="sb-refused">
                <button
                  type="button"
                  className="st-textlink"
                  onClick={() => setShowRefused((open) => !open)}
                >
                  {showRefused ? 'Hide' : 'Why can’t I require hair colour or nationality?'}
                </button>
                {showRefused && (
                  <ul className="sb-refused-list">
                    {vocabulary.refused.map((entry) => (
                      <li key={entry.id}>{entry.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="st-fieldset st-fieldset--last">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Publishing</h3>
          <p className="st-fieldset-sub">
            Publishing records a dated, unchangeable version. Applicants already reviewed
            against an earlier version keep the version they were actually measured against.
          </p>
        </div>

        <dl className="st-terms">
          <div className="st-term">
            <dt className="st-term-label">Published</dt>
            <dd className="st-term-value">
              {state?.published
                ? `Revision ${state.published.revision} on ${state.published.publishedOn}`
                : 'Not published yet'}
            </dd>
          </div>
          {state?.published?.nextReviewOn && (
            <div className="st-term">
              <dt className="st-term-label">Confirm again by</dt>
              <dd className="st-term-value">{state.published.nextReviewOn}</dd>
            </div>
          )}
          <div className="st-term">
            <dt className="st-term-label">Unsaved changes</dt>
            <dd className="st-term-value">
              {state?.hasUnpublishedChanges ? 'Yes — publish to make them live' : 'None'}
            </dd>
          </div>
        </dl>

        {canManage && (
          <AgencyButton
            variant="primary"
            size="sm"
            loading={publishMutation.isPending}
            disabled={blocked || saveMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            Publish requirements
          </AgencyButton>
        )}

        {issues.length > 0 && (
          <div className="sb-issues sb-issues--summary">
            <span className="sb-issues-head">
              <X size={14} /> Fix these before publishing
            </span>
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.code}-summary-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
