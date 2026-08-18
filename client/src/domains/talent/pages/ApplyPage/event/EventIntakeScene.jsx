import React, { useId } from 'react';
import { ArrowUpRight, Calendar, Check, Film, Ruler } from 'lucide-react';
import PholioButton from '../../../../../shared/components/ui/PholioButton';
import {
  WALK_VIDEO_HOST_HINT,
  WALK_VIDEO_MAX_LENGTH,
  availabilityIssue,
  toDateInputValue,
  walkVideoIssue,
} from './eventIntake';
import './event.css';

const COMPENSATION_LABELS = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  stipend: 'Stipend',
};

function formatDate(value) {
  const iso = toDateInputValue(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function eventRunLabel(event) {
  const from = formatDate(event?.startsOn);
  const to = formatDate(event?.endsOn);
  if (!from) return null;
  return to && to !== from ? `${from} – ${to}` : from;
}

/**
 * The one scene an event casting adds to the dossier.
 *
 * It asks only for what a representation submission has no reason to collect:
 * the days the applicant can actually work, how they move, and — when the
 * organizer asks for it — an explicit statement that the measurements on file
 * are current for those dates. Everything else in the package is unchanged,
 * which is the whole argument for a single apply flow rather than two.
 *
 * Requirements are stated plainly and advised here; the submit is what enforces
 * them, so a half-finished scene never traps someone mid-flow.
 */
export default function EventIntakeScene({
  call,
  organizerName,
  availability,
  onAvailabilityChange,
  walkVideoUrl,
  onWalkVideoChange,
  measurementsConfirmed,
  onMeasurementsConfirmedChange,
  stats,
  onOpenProfile,
}) {
  const fieldId = useId();
  const intake = call?.intake || {};
  const event = call?.event || null;
  const compensation = call?.compensation || null;
  const organizer = organizerName || 'The organizer';
  const run = eventRunLabel(event);
  const from = toDateInputValue(availability?.from);
  const to = toDateInputValue(availability?.to);
  const dateIssue = availabilityIssue(availability);
  const videoIssue = walkVideoIssue(walkVideoUrl);
  const compensationLabel = compensation
    ? COMPENSATION_LABELS[compensation.type] || compensation.type
    : null;

  const setRange = (patch) =>
    onAvailabilityChange({ from, to, ...patch });

  return (
    <div className="apply-event">
      <section className="apply-event__brief" aria-label="Casting details">
        <dl className="apply-event__facts">
          {event?.name && (
            <div>
              <dt>Event</dt>
              <dd>{event.name}</dd>
            </div>
          )}
          {run && (
            <div>
              <dt>Runs</dt>
              <dd>{run}</dd>
            </div>
          )}
          {event?.location && (
            <div>
              <dt>Where</dt>
              <dd>{event.location}</dd>
            </div>
          )}
          {compensationLabel && (
            <div>
              <dt>Compensation</dt>
              <dd>
                {compensationLabel}
                {compensation.details ? (
                  <span className="apply-event__compdetail">{compensation.details}</span>
                ) : null}
              </dd>
            </div>
          )}
        </dl>
        <p className="apply-event__stated">
          {organizer} stated this. Pholio does not verify it, and applying does
          not guarantee selection, a booking, or payment.
        </p>
      </section>

      {intake.availability && (
        <section className="apply-event__block" aria-labelledby={`${fieldId}-avail`}>
          <header className="apply-event__blockhead">
            <Calendar size={16} strokeWidth={1.6} aria-hidden />
            <h2 id={`${fieldId}-avail`}>The days you can work</h2>
          </header>
          <p className="apply-event__blocklede">
            {run
              ? `Pre-filled with the full run. Narrow it if you can only make part of it — casting is built around who is actually there on the day.`
              : 'Give the first and last day you can work this casting.'}
          </p>
          <div className="apply-event__dates">
            <label className="apply-event__field">
              <span className="apply-event__label">First day</span>
              <input
                type="date"
                className="apply-event__input"
                value={from}
                max={to || undefined}
                onChange={(e) => setRange({ from: e.target.value })}
              />
            </label>
            <label className="apply-event__field">
              <span className="apply-event__label">Last day</span>
              <input
                type="date"
                className="apply-event__input"
                value={to}
                min={from || undefined}
                onChange={(e) => setRange({ to: e.target.value })}
              />
            </label>
          </div>
          {dateIssue && (
            <p className="apply-event__issue" role="alert">
              {dateIssue}
            </p>
          )}
        </section>
      )}

      {intake.walkVideo && (
        <section className="apply-event__block" aria-labelledby={`${fieldId}-walk`}>
          <header className="apply-event__blockhead">
            <Film size={16} strokeWidth={1.6} aria-hidden />
            <h2 id={`${fieldId}-walk`}>Your walk</h2>
          </header>
          <p className="apply-event__blocklede">
            A single unedited take, head to toe, no music. Paste the link —
            Pholio stores the address, not the file, and only the organizer and
            the designers they share with can open it.
          </p>
          <label className="apply-event__field apply-event__field--wide">
            <span className="apply-event__label">Walk video link</span>
            <input
              type="url"
              inputMode="url"
              className="apply-event__input"
              placeholder="https://"
              maxLength={WALK_VIDEO_MAX_LENGTH}
              value={walkVideoUrl || ''}
              onChange={(e) => onWalkVideoChange(e.target.value)}
              aria-invalid={videoIssue ? 'true' : undefined}
            />
          </label>
          <p className="apply-event__hint">{WALK_VIDEO_HOST_HINT}</p>
          {videoIssue && (
            <p className="apply-event__issue" role="alert">
              {videoIssue}
            </p>
          )}
        </section>
      )}

      {intake.measurements && (
        <section className="apply-event__block" aria-labelledby={`${fieldId}-stats`}>
          <header className="apply-event__blockhead">
            <Ruler size={16} strokeWidth={1.6} aria-hidden />
            <h2 id={`${fieldId}-stats`}>Measurements, as of today</h2>
          </header>
          <p className="apply-event__blocklede">
            Samples are cut to a size. An organizer casting to a rail needs the
            numbers to be true this week, not last season.
          </p>
          {stats?.primary?.length > 0 && (
            <ul className="apply-event__stats" aria-label="Measurements on file">
              {stats.primary.map((item) => (
                <li key={item.label}>
                  <span className="apply-event__statlabel">{item.label}</span>
                  <span className="apply-event__statvalue">{item.value}</span>
                </li>
              ))}
            </ul>
          )}
          <label className="apply-event__confirm">
            <input
              type="checkbox"
              checked={measurementsConfirmed === true}
              onChange={(e) => onMeasurementsConfirmedChange(e.target.checked)}
            />
            <span>
              These measurements are current and I will hold them through the
              event dates.
            </span>
          </label>
          <PholioButton
            type="button"
            variant="meta"
            className="apply-event__edit"
            onClick={onOpenProfile}
          >
            Update measurements
            <ArrowUpRight size={13} aria-hidden />
          </PholioButton>
        </section>
      )}

      {!intake.availability && !intake.walkVideo && !intake.measurements && (
        <p className="apply-event__none">
          <Check size={15} aria-hidden />
          {organizer} asks for nothing beyond your standard package for this
          casting.
        </p>
      )}
    </div>
  );
}
