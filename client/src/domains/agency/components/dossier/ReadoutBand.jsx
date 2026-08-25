import React from 'react';
import { StageMark } from '../status/StageProgress';
import { AvailabilityCell } from '../status/AvailabilityCell';
import { calendarSpans, fmtAgo, fmtDayMonth, packageRead } from './dossierModel';
import './dossier.css';

/**
 * The Readout Band — four live instruments on one rule, directly under the
 * plate. This is the surface's answer to "tell me where this stands without
 * making me read".
 *
 *   Standing     where the submission sits on our ladder, and for how long
 *   Availability what the talent declared, and the next thing blocking dates
 *   Package      whether they actually sent a usable set of digitals
 *
 * Each readout is a jump link to the region that explains it.
 */
function Readout({ label, value, note, href, onJump }) {
  const content = (
    <>
      <span className="dx-readout__key">{label}</span>
      <span className="dx-readout__val">{value}</span>
      {note && <span className="dx-readout__note">{note}</span>}
    </>
  );
  if (!href) return <div className="dx-readout">{content}</div>;
  return (
    <a
      className="dx-readout dx-readout--link"
      href={href}
      onClick={(e) => {
        if (onJump) {
          e.preventDefault();
          onJump(href.slice(1));
        }
      }}
    >
      {content}
    </a>
  );
}

export function ReadoutBand({ dossier, onJump }) {
  const { application, standing, availability } = dossier;
  const pkg = packageRead(dossier);
  const calendar = calendarSpans(availability);

  const days = standing?.days_since_submitted;
  const standingNote = [
    days != null ? (days === 0 ? 'Arrived today' : `Day ${days}`) : null,
    standing?.viewed_at ? `opened ${fmtAgo(standing.viewed_at)}` : 'never opened',
  ]
    .filter(Boolean)
    .join(' · ');

  const availNote = calendar.next
    ? `${calendar.next.kindLabel || 'Bookout'} ${fmtDayMonth(calendar.next.from)}${
        calendar.next.to ? `–${fmtDayMonth(calendar.next.to)}` : ''
      }`
    : `Clear for ${calendar.windowDays} days`;

  const freshness = pkg.freshness;
  const packageNote = pkg.set.missingSlots.length
    ? `missing ${pkg.missingLabels.join(', ').toLowerCase()}`
    : freshness?.state === 'undated'
      ? 'digitals undated'
      : freshness && freshness.state !== 'current' && pkg.digitalsAgeDays != null
        ? `oldest digital ${Math.round(pkg.digitalsAgeDays / 30)} mo old`
        : `${pkg.frames} frame${pkg.frames === 1 ? '' : 's'} in the book`;

  return (
    <div className="dx-band" role="group" aria-label="Talent readouts">
      <Readout
        label="Standing"
        value={<StageMark status={application?.status} />}
        note={standingNote}
        href="#dx-standing"
        onJump={onJump}
      />
      <Readout
        label="Availability"
        value={
          availability?.status ? (
            <AvailabilityCell status={availability.status} />
          ) : (
            <span className="dx-readout__none">Not declared</span>
          )
        }
        note={availNote}
        href="#dx-availability"
        onJump={onJump}
      />
      <Readout
        label="Digitals"
        value={
          <span className="dx-coverage">
            {pkg.set.filledCount}<i>of</i>{pkg.set.requiredCount}
          </span>
        }
        note={packageNote}
        href="#dx-package"
        onJump={onJump}
      />
    </div>
  );
}

export default ReadoutBand;
