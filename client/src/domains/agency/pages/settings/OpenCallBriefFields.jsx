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
    hint: 'The board, the market, the kind of applicant you want.',
    placeholder: "e.g. New faces for our women's board, London.",
    maxLength: 600,
    rows: 2,
  },
  {
    key: 'what',
    label: 'What to send',
    hint: 'Say it in your own words. Exact shot requirements live in Requirements.',
    placeholder: 'e.g. Four digitals — close-up, profile, waist-up, full length. No makeup, hair back.',
    maxLength: 1200,
    rows: 3,
  },
  {
    key: 'eligibility',
    label: 'Eligibility',
    hint: 'Leave empty if the call is open to everyone.',
    placeholder: 'e.g. 16 and over. No height requirement for the commercial board.',
    maxLength: 800,
    rows: 2,
    optional: true,
  },
  {
    key: 'nextSteps',
    label: 'What happens next',
    hint: 'What an applicant should expect after sending, and when.',
    placeholder: 'e.g. We review weekly and reply within 30 days, either way.',
    maxLength: 800,
    rows: 2,
  },
];

export default function OpenCallBriefFields({ brief, onChange, disabled = false, idPrefix }) {
  const patch = (changes) => onChange({ ...brief, ...changes });
  const fieldId = (key) => `${idPrefix}-${key}`;

  return (
    <div className="st-brief">
      {FIELDS.map((field) => (
        <div className="st-field" key={field.key}>
          <label className="st-label" htmlFor={fieldId(field.key)}>
            {field.label}
            {!field.optional && <span className="st-req"> *</span>}
          </label>
          <textarea
            id={fieldId(field.key)}
            className="st-input st-textarea"
            rows={field.rows}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={brief[field.key]}
            disabled={disabled}
            onChange={(event) => patch({ [field.key]: event.target.value })}
          />
          <span className="st-help">{field.hint}</span>
        </div>
      ))}

      <div className="st-field">
        <span className="st-label">
          When it closes<span className="st-req"> *</span>
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
            : 'After this date the link stops taking submissions and says so.'}
        </span>
      </div>
    </div>
  );
}
