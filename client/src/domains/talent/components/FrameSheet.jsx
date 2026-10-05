import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import {
  expressionPickerOptions,
  imageTypePickerOptions,
  shotPickerOptions,
  stylePickerOptions,
} from '../../../shared/constants/frameTaxonomy';
import {
  BLOCKING_STATUSES,
  expiryLine,
  LIBRARY_STATES,
  LICENSE_TYPES,
  RIGHTS_STATUS_GROUPS,
  rightsSummary,
  SIGNER_ROLES,
} from './frameEditorModel';

/* ── Primitives ─────────────────────────────────────────────────────────── */

/** A native select that reads as a word. Familiar control, typographic surface. */
function WordSelect({ value, onChange, options, label, size = 'md', blank = 'Unplaced' }) {
  // Keep a stored value the picker no longer lists, so opening the sheet never rewrites it.
  const list = value && !options.some((o) => o.value === value)
    ? [...options, { value, label: value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }]
    : options;
  const current = list.find((o) => o.value === value);
  const empty = !value;
  return (
    <span className={`fe-word fe-word--${size}${empty ? ' is-empty' : ''}`}>
      <span className="fe-word__text" aria-hidden="true">{empty ? blank : current.label}</span>
      <ChevronDown className="fe-word__caret" size={size === 'lg' ? 18 : 13} aria-hidden="true" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((o) => (
          <option key={o.value || 'none'} value={o.value} title={o.hint || undefined}>
            {o.value ? o.label : blank}
          </option>
        ))}
      </select>
    </span>
  );
}

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`fe-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="fe-switch__label">{label}</span>
      <span className="fe-switch__track" aria-hidden="true"><span className="fe-switch__thumb" /></span>
    </button>
  );
}

function Field({ label, children, wide = false }) {
  return (
    <label className={`fe-field${wide ? ' fe-field--wide' : ''}`}>
      <span className="fe-field__label">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, ...rest }) {
  return <input type="text" className="fe-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function DateInput({ value, onChange, ...rest }) {
  return <input type="date" className="fe-input fe-input--date" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function PlainSelect({ value, onChange, children, ...rest }) {
  return (
    <span className="fe-select">
      <select className="fe-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>{children}</select>
      <ChevronDown size={13} aria-hidden="true" />
    </span>
  );
}

function Section({ title, children }) {
  return (
    <section className="fe-section">
      <h3 className="fe-section__title">{title}</h3>
      {children}
    </section>
  );
}

/* ── Sheet ──────────────────────────────────────────────────────────────── */

export default function FrameSheet({
  form,
  setForm,
  readSource,
  mediaSets,
  rights,
  setRights,
  rightsState,
  release,
  setRelease,
  releaseOnFile,
  rightsOpen,
  setRightsOpen,
  problem,
  clearProblem,
}) {
  const reduceMotion = useReducedMotion();
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const setCredit = (key) => (v) => setForm((p) => ({ ...p, credits: { ...p.credits, [key]: v } }));
  const setRight = (key) => (v) => { clearProblem(); setRights((p) => ({ ...p, [key]: v })); };
  const setRel = (key) => (v) => { clearProblem(); setRelease((p) => ({ ...p, [key]: v })); };

  const use = String(form.image_type || '').toLowerCase();
  const isDigital = use === 'digital';
  const isTearsheet = use === 'tearsheet';
  const suggested = readSource !== 'user' && (form.image_type || form.shot_type || form.style_type);
  const rightsLocked = rightsState !== 'ready';
  const summary = rightsSummary(rights, releaseOnFile);
  const expiry = expiryLine(rights.expires_at);
  const libraryOptions = [
    ...LIBRARY_STATES,
    ...(['retired', 'test'].includes(form.status)
      ? [{ value: form.status, label: form.status === 'retired' ? 'Archived (legacy)' : 'Test (legacy)' }]
      : []),
  ];

  return (
    <div className="fe-sheet">
      {/* What this photo is */}
      <header className="fe-read">
        <WordSelect
          size="lg"
          label="Use"
          value={form.image_type}
          onChange={(image_type) => set({ image_type })}
          options={imageTypePickerOptions(form.image_type)}
          blank="Unsorted"
        />
        <div className="fe-read__line">
          <WordSelect label="Framing" value={form.shot_type} onChange={(shot_type) => set({ shot_type })} options={shotPickerOptions(form.shot_type)} blank="Framing" />
          <span className="fe-read__sep" aria-hidden="true">·</span>
          <WordSelect label="Register" value={form.style_type} onChange={(style_type) => set({ style_type })} options={stylePickerOptions()} blank="Register" />
          <span className="fe-read__sep" aria-hidden="true">·</span>
          <WordSelect label="Expression" value={form.expression} onChange={(expression) => set({ expression })} options={expressionPickerOptions()} blank="Expression" />
        </div>
        {suggested ? <p className="fe-read__note">Suggested from the photo. Saving confirms it.</p> : null}
      </header>

      <Section title="Shown in">
        <Switch label="Public book" checked={!form.exclude_from_public} onChange={(on) => set({ exclude_from_public: !on })} />
        <Switch label="Agency submissions" checked={!form.exclude_from_agency} onChange={(on) => set({ exclude_from_agency: !on })} />
        <div className="fe-library" role="radiogroup" aria-label="Library">
          <span className="fe-library__label">Library</span>
          <div className="fe-library__opts">
            {libraryOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={form.status === o.value}
                className={`fe-library__opt${form.status === o.value ? ' is-on' : ''}`}
                onClick={() => set({ status: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Credits">
        {isTearsheet ? (
          <>
            <Field label="Publication"><TextInput value={form.credits.publication} onChange={setCredit('publication')} /></Field>
            <Field label="Issue"><TextInput value={form.credits.issue} onChange={setCredit('issue')} placeholder="March 2026" /></Field>
            <Field label="Credit line"><TextInput value={form.credits.credit} onChange={setCredit('credit')} /></Field>
          </>
        ) : null}
        <Field label="Photographer"><TextInput value={form.credits.photographer} onChange={setCredit('photographer')} /></Field>
        <Field label="Hair"><TextInput value={form.credits.hair_stylist} onChange={setCredit('hair_stylist')} /></Field>
        <Field label="Makeup"><TextInput value={form.credits.mua} onChange={setCredit('mua')} /></Field>
        <Field label="Styling"><TextInput value={form.credits.stylist} onChange={setCredit('stylist')} /></Field>
        <Field label="Notes" wide>
          <textarea
            className="fe-input fe-input--area"
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Shoot">
        <Field label="Set">
          <PlainSelect value={form.set_id} onChange={(set_id) => set({ set_id })}>
            <option value="">None</option>
            {mediaSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.kind}{s.name ? ` (${s.kind})` : ''}{s.is_current ? ', current' : ''}
              </option>
            ))}
          </PlainSelect>
        </Field>
        <Field label="Shot on"><DateInput value={form.captured_at} onChange={(captured_at) => set({ captured_at })} /></Field>
        {isDigital ? (
          <p className="fe-aside">Digitals stay unretouched, so there is no retouch date.</p>
        ) : (
          <Field label="Retouched"><DateInput value={form.retouched_at} onChange={(retouched_at) => set({ retouched_at })} /></Field>
        )}
      </Section>

      {/* Rights: rarely needed, so it waits behind one row. */}
      <section className={`fe-rights${rightsOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="fe-rights__toggle"
          aria-expanded={rightsOpen}
          onClick={() => setRightsOpen(!rightsOpen)}
        >
          <span className="fe-section__title">Rights and release</span>
          <span className={`fe-rights__summary${summary.alert ? ' is-alert' : ''}`}>
            {rightsState === 'loading' ? 'Loading…' : rightsState === 'error' ? 'Unavailable right now' : summary.text}
          </span>
          <ChevronDown className="fe-rights__caret" size={15} aria-hidden="true" />
        </button>

        <AnimatePresence initial={false}>
          {rightsOpen && (
            <motion.div
              key="rights"
              className="fe-rights__body"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
            >
              <div className="fe-rights__inner">
                {problem ? <p className="fe-problem" role="alert">{problem}</p> : null}
                {rightsState === 'error' ? (
                  <p className="fe-aside">Rights could not be loaded, so they can't be edited right now. Your other changes still save.</p>
                ) : (
                  <>
                    <Field label="Status">
                      <PlainSelect value={rights.rights_status} onChange={setRight('rights_status')} disabled={rightsLocked}>
                        <option value="">Not set</option>
                        {RIGHTS_STATUS_GROUPS.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ))}
                      </PlainSelect>
                    </Field>
                    {BLOCKING_STATUSES.has(rights.rights_status) ? (
                      <p className="fe-aside fe-aside--alert">This photo can't be sent in submissions.</p>
                    ) : null}
                    <Field label="License">
                      <PlainSelect value={rights.license_type} onChange={setRight('license_type')} disabled={rightsLocked}>
                        <option value="">Not set</option>
                        {LICENSE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </PlainSelect>
                    </Field>
                    <Field label="Copyright"><TextInput value={rights.copyright_owner} onChange={setRight('copyright_owner')} disabled={rightsLocked} placeholder="Owner name" /></Field>
                    <Field label="Usage"><TextInput value={rights.usage_scope} onChange={setRight('usage_scope')} disabled={rightsLocked} placeholder="Editorial, web" /></Field>
                    <Field label="Territory"><TextInput value={rights.territory} onChange={setRight('territory')} disabled={rightsLocked} placeholder="Worldwide" /></Field>
                    <Field label="Starts"><DateInput value={rights.start_at} onChange={setRight('start_at')} disabled={rightsLocked} /></Field>
                    <Field label="Expires"><DateInput value={rights.expires_at} onChange={setRight('expires_at')} disabled={rightsLocked} /></Field>
                    {expiry ? <p className={`fe-aside${expiry.alert ? ' fe-aside--alert' : ''}`}>{expiry.text}</p> : null}
                    <Switch label="Exclusive license" checked={rights.exclusive} onChange={setRight('exclusive')} disabled={rightsLocked} />

                    <h4 className="fe-rights__sub">
                      Model release
                      <span>{releaseOnFile ? 'On file' : 'Not on file'}</span>
                    </h4>
                    <Field label="Reference"><TextInput value={release.release_url} onChange={setRel('release_url')} disabled={rightsLocked} placeholder="Link or document ID" /></Field>
                    <Field label="Signed by"><TextInput value={release.signer_name} onChange={setRel('signer_name')} disabled={rightsLocked} /></Field>
                    <Field label="Signer is">
                      <PlainSelect value={release.signer_role} onChange={setRel('signer_role')} disabled={rightsLocked}>
                        <option value="">Choose</option>
                        {SIGNER_ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </PlainSelect>
                    </Field>
                    <Field label="Signed on"><DateInput value={release.signed_at} onChange={setRel('signed_at')} disabled={rightsLocked} /></Field>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
