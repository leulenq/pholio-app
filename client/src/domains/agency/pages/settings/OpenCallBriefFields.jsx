import { AgencyButton } from '../../components/ui/AgencyButton';

/*
 * The open-call brief an agency writes once per link.
 *
 * Shared by the create form and the edit form on an existing link so the two
 * cannot drift — an applicant should never see a brief shaped differently from
 * the one the agency thought it was writing.
 *
 * The closing date is a required decision rather than a required date: agencies
 * run permanent open calls, so "runs continuously" is a real answer and forcing
 * an arbitrary date would only manufacture a deadline nobody means.
 */

const FIELDS = [
  {
    key: 'who',
    label: 'Who this call is for',
    eventLabel: 'Who you are casting',
    hint: 'The board, the market, the kind of applicant you want.',
    eventHint: 'The look, the category, the market you are casting from.',
    placeholder: "e.g. New faces for our women's board, London.",
    eventPlaceholder: 'e.g. Runway models, 5’10" and over, New York based.',
    maxLength: 600,
    rows: 2,
  },
  {
    key: 'what',
    label: 'What to send',
    hint: 'Say it in your own words. Exact shot requirements live in Requirements.',
    eventHint: 'Say it in your own words. Walk video and availability are toggled below.',
    placeholder: 'e.g. Four digitals — close-up, profile, waist-up, full length. No makeup, hair back.',
    maxLength: 1200,
    rows: 3,
  },
  {
    key: 'eligibility',
    label: 'Eligibility',
    hint: 'Leave empty if the call is open to everyone.',
    eventHint: 'Applicants are already told the call is 18+. Add anything else that rules someone in or out.',
    placeholder: 'e.g. 16 and over. No height requirement for the commercial board.',
    eventPlaceholder: 'e.g. Must be able to attend fittings in person the week before.',
    maxLength: 800,
    rows: 2,
    optional: true,
  },
  {
    key: 'nextSteps',
    label: 'What happens next',
    hint: 'What an applicant should expect after sending, and when.',
    eventHint: 'What an applicant should expect after sending, and when you decide.',
    placeholder: 'e.g. We review weekly and reply within 30 days, either way.',
    eventPlaceholder: 'e.g. We shortlist in the first week of August and offer slots by the 15th.',
    maxLength: 800,
    rows: 2,
  },
];

/**
 * `eventMode` switches label vocabulary only (ruling R10 — same surface,
 * org-aware words). The fields, limits and validation are identical.
 */
export default function OpenCallBriefFields({
  brief,
  onChange,
  disabled = false,
  idPrefix,
  eventMode = false,
}) {
  const patch = (changes) => onChange({ ...brief, ...changes });
  const fieldId = (key) => `${idPrefix}-${key}`;
  const pick = (field, key) => (eventMode && field[key] ? field[key] : null);

  return (
    <div className="st-brief">
      {FIELDS.map((field) => (
        <div className="st-field" key={field.key}>
          <label className="st-label" htmlFor={fieldId(field.key)}>
            {pick(field, 'eventLabel') || field.label}
            {!field.optional && <span className="st-req"> *</span>}
          </label>
          <textarea
            id={fieldId(field.key)}
            className="st-input st-textarea"
            rows={field.rows}
            maxLength={field.maxLength}
            placeholder={pick(field, 'eventPlaceholder') || field.placeholder}
            value={brief[field.key]}
            disabled={disabled}
            onChange={(event) => patch({ [field.key]: event.target.value })}
          />
          <span className="st-help">{pick(field, 'eventHint') || field.hint}</span>
        </div>
      ))}

      <div className="st-field">
        <span className="st-label">
          {eventMode ? 'When applications close' : 'When it closes'}
          <span className="st-req"> *</span>
        </span>
        <div className="st-brief-deadline">
          <AgencyButton
            type="button"
            variant={brief.ongoing ? 'primary' : 'secondary'}
            size="sm"
            disabled={disabled}
            onClick={() => patch({ ongoing: true, deadline: '' })}
          >
            Runs continuously
          </AgencyButton>
          <AgencyButton
            type="button"
            variant={brief.ongoing ? 'secondary' : 'primary'}
            size="sm"
            disabled={disabled}
            onClick={() => patch({ ongoing: false })}
          >
            Closes on a date
          </AgencyButton>
          {!brief.ongoing && (
            <input
              className="st-input st-brief-date"
              type="date"
              value={brief.deadline}
              disabled={disabled}
              aria-label="Closing date"
              onChange={(event) => patch({ deadline: event.target.value, ongoing: false })}
            />
          )}
        </div>
        <span className="st-help">
          {brief.ongoing
            ? 'Applicants are told the call has no closing date.'
            : eventMode
              ? 'After this date the link stops taking submissions. This is the application deadline, not the event.'
              : 'After this date the link stops taking submissions and says so.'}
        </span>
      </div>
    </div>
  );
}
