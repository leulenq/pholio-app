import { AgencyButton } from '../../components/ui/AgencyButton';
import { COMPENSATION_TYPES } from '../../../../shared/constants/eventCasting';
import { COMPENSATION_DETAILS_REQUIRED } from './openCallBrief';

/*
 * The event a call is casting for, and the terms an applicant consents to.
 *
 * Sibling of OpenCallBriefFields and shared by the create form and the edit
 * form for the same reason: the applicant reads this back on the arrival page
 * and again inside the consent they sign, so there can only be one shape of it.
 *
 * Compensation is the one field here that is not a convenience. Whatever is
 * typed below is restated verbatim in the applicant's consent record — "{org}
 * states this is PAID. {details}" — which is why there is no fourth "not
 * specified" option and why paid and stipend must say what they pay.
 */

const COMPENSATION_CHOICES = [
  { value: COMPENSATION_TYPES.PAID, label: 'Paid' },
  { value: COMPENSATION_TYPES.STIPEND, label: 'Stipend' },
  { value: COMPENSATION_TYPES.UNPAID, label: 'Unpaid' },
];

const COMPENSATION_HELP = {
  [COMPENSATION_TYPES.PAID]: 'State the rate and what it covers. Applicants consent to this exact sentence.',
  [COMPENSATION_TYPES.STIPEND]: 'State the stipend and what it covers — travel, meals, a flat fee.',
  [COMPENSATION_TYPES.UNPAID]:
    'Unpaid is a legitimate answer and applicants are shown it plainly. Add what you do provide, if anything.',
};

const INTAKE_TOGGLES = [
  {
    key: 'walkVideo',
    label: 'Walk video',
    desc: 'Applicants paste a link to an unlisted walk video. Designers can play it on the pick list.',
  },
  {
    key: 'availability',
    label: 'Availability for the event dates',
    desc: 'Applicants confirm the days they can hold, defaulted to the dates above.',
  },
  {
    key: 'measurements',
    label: 'Confirm measurements at submission',
    desc: 'Applicants re-confirm bust, waist, hips and shoe before sending.',
  },
];

export default function EventCallFields({ call, onChange, disabled = false, idPrefix }) {
  const patch = (changes) => onChange({ ...call, ...changes });
  const patchEvent = (changes) => patch({ event: { ...call.event, ...changes } });
  const patchCompensation = (changes) =>
    patch({ compensation: { ...call.compensation, ...changes } });
  const patchIntake = (changes) => patch({ intake: { ...call.intake, ...changes } });
  const fieldId = (key) => `${idPrefix}-${key}`;

  const detailsRequired = COMPENSATION_DETAILS_REQUIRED.includes(call.compensation.type);

  return (
    <div className="st-brief">
      <div className="st-field">
        <label className="st-label" htmlFor={fieldId('event-name')}>
          Event<span className="st-req"> *</span>
        </label>
        <input
          id={fieldId('event-name')}
          className="st-input"
          type="text"
          maxLength={180}
          placeholder="e.g. Fashion Week Brooklyn — Autumn 2026"
          value={call.event.name}
          disabled={disabled}
          onChange={(e) => patchEvent({ name: e.target.value })}
        />
        <span className="st-help">
          The name applicants see on the arrival page and in their consent record.
        </span>
      </div>

      <div className="st-field">
        <span className="st-label">
          Event dates<span className="st-req"> *</span>
        </span>
        <div className="st-grid-2">
          <input
            className="st-input"
            type="date"
            value={call.event.startsOn}
            disabled={disabled}
            aria-label="Event start date"
            onChange={(e) => patchEvent({ startsOn: e.target.value })}
          />
          <input
            className="st-input"
            type="date"
            value={call.event.endsOn}
            min={call.event.startsOn || undefined}
            disabled={disabled}
            aria-label="Event end date"
            onChange={(e) => patchEvent({ endsOn: e.target.value })}
          />
        </div>
        <span className="st-help">
          These are the days you are asking applicants to hold — separate from when
          applications close. Leave the end date empty for a single-day event.
        </span>
      </div>

      <div className="st-field">
        <label className="st-label" htmlFor={fieldId('event-location')}>
          Location
        </label>
        <input
          id={fieldId('event-location')}
          className="st-input"
          type="text"
          maxLength={200}
          placeholder="e.g. Brooklyn Navy Yard, Building 77"
          value={call.event.location}
          disabled={disabled}
          onChange={(e) => patchEvent({ location: e.target.value })}
        />
        <span className="st-help">City is enough if the venue is not confirmed.</span>
      </div>

      <div className="st-field">
        <span className="st-label">
          Compensation<span className="st-req"> *</span>
        </span>
        <div className="st-brief-deadline">
          {COMPENSATION_CHOICES.map((choice) => (
            <AgencyButton
              key={choice.value}
              type="button"
              variant={call.compensation.type === choice.value ? 'primary' : 'secondary'}
              size="sm"
              disabled={disabled}
              aria-pressed={call.compensation.type === choice.value}
              onClick={() => patchCompensation({ type: choice.value })}
            >
              {choice.label}
            </AgencyButton>
          ))}
        </div>
        <textarea
          id={fieldId('compensation-details')}
          className="st-input st-textarea"
          rows={2}
          maxLength={600}
          placeholder={
            call.compensation.type === COMPENSATION_TYPES.UNPAID
              ? 'e.g. Travel within the city and meals on show days are covered.'
              : 'e.g. $350 per show day, paid within 30 days. Fittings unpaid.'
          }
          value={call.compensation.details}
          disabled={disabled}
          aria-label="What the compensation is"
          onChange={(e) => patchCompensation({ details: e.target.value })}
        />
        <span className="st-help">
          {call.compensation.type
            ? COMPENSATION_HELP[call.compensation.type]
            : 'Choose one. Applicants consent to this sentence word for word, so there is no "not specified".'}
          {detailsRequired && ' Required.'}
        </span>
      </div>

      <div className="st-field">
        <span className="st-label">What the intake asks for</span>
        <div className="st-toggles">
          {INTAKE_TOGGLES.map((toggle) => (
            <div className="st-toggle-row" key={toggle.key}>
              <div className="st-toggle-text">
                <span className="st-toggle-label">{toggle.label}</span>
                <span className="st-toggle-desc">{toggle.desc}</span>
              </div>
              <label className="st-switch">
                <input
                  type="checkbox"
                  checked={Boolean(call.intake[toggle.key])}
                  disabled={disabled}
                  aria-label={toggle.label}
                  onChange={() => patchIntake({ [toggle.key]: !call.intake[toggle.key] })}
                />
                <span className="st-switch-track" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="st-grid-2">
        <div className="st-field">
          <label className="st-label" htmlFor={fieldId('review-window')}>
            Review window
          </label>
          <input
            id={fieldId('review-window')}
            className="st-input"
            type="number"
            min={1}
            max={120}
            placeholder="Days"
            value={call.reviewWindowDays}
            disabled={disabled}
            onChange={(e) => patch({ reviewWindowDays: e.target.value })}
          />
          <span className="st-help">
            Days before an unreviewed application closes itself. Empty uses your
            agency default.
          </span>
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={fieldId('offer-window')}>
            Offer response window
          </label>
          <input
            id={fieldId('offer-window')}
            className="st-input"
            type="number"
            min={1}
            max={336}
            placeholder="Hours"
            value={call.offerResponseWindowHours}
            disabled={disabled}
            onChange={(e) => patch({ offerResponseWindowHours: e.target.value })}
          />
          <span className="st-help">
            Hours an offered applicant has to confirm or decline before the slot
            closes. Empty uses 72.
          </span>
        </div>
      </div>

      <p className="st-help">
        Event calls are open to applicants aged 18 and over only. Pholio states
        this on the arrival page and in the consent every applicant signs — do not
        publish this link anywhere it will reach minors.
      </p>
    </div>
  );
}
