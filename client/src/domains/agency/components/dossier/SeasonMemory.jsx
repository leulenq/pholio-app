import React from 'react';
import { Sheet, Ledger, Fact, Quiet } from './DossierPrimitives';
import { fmtDate } from './dossierModel';
import './dossier.css';

/**
 * Season Memory — "You passed on her in SS26. Since then: new digitals, +2cm,
 * now signed in Milan."
 *
 * Every value here is either a number the talent declared or a capture date —
 * never an inference from a photo. `src/domains/agency/services/season-memory.js`
 * carries the full compliance rationale (Illinois BIPA); this component only
 * renders what that module already decided is safe to say. If `seasonMemory`
 * is null there is nothing to compare against (a first-time applicant, most
 * commonly) and this renders nothing at all — a first application is not a
 * finding.
 */

function measurementValue({ unit, kind, before, after, delta }) {
  const u = unit || '';
  if (kind === 'newly_given') return `Newly given — ${after}${u}`;
  if (kind === 'withdrawn') return `No longer given — was ${before}${u}`;
  const sign = delta > 0 ? '+' : '';
  return `${before} → ${after}${u} (${sign}${delta}${u})`;
}

function declaredValue({ kind, before, after }) {
  if (kind === 'newly_given') return `Newly given — ${after}`;
  if (kind === 'withdrawn') return `No longer given — was ${before}`;
  return `${before} → ${after}`;
}

/** Only "reshot" is a claim this module will make — "same set" and "undated"
 * are not movement (season-memory.js's own `hasMovement`), so they earn no
 * line here either. */
function digitalsValue(digitals) {
  if (!digitals || digitals.kind !== 'reshot') return null;
  return digitals.newestAfter
    ? `New digitals since last time — shot ${fmtDate(digitals.newestAfter)}`
    : 'New digitals since last time';
}

/** Names appear only when the talent chose to disclose them
 * (`disclose_agency_name`) — the same rule `RepresentationRecord` follows. */
function representationValue(representation) {
  if (!representation) return null;
  const named = representation.named || [];
  if (representation.kind === 'signed') {
    return named.length
      ? `Signed since last time — ${named.join(', ')}`
      : 'Signed since last time (agency undisclosed)';
  }
  return named.length
    ? `Representation changed — now ${named.join(', ')}`
    : 'No longer represented as before';
}

export function SeasonMemory({ dossier }) {
  const memory = dossier?.seasonMemory;
  if (!memory) return null;

  const {
    measurements = [],
    declared = [],
    digitals,
    representation,
    hasMovement: moved,
    priorSubmittedAt,
  } = memory;

  const priorDate = fmtDate(priorSubmittedAt);
  const digitalsText = digitalsValue(digitals);
  const repText = representationValue(representation);

  return (
    <Sheet id="dx-season" title="Season memory">
      {!moved ? (
        <Quiet>
          {priorDate
            ? `Applied before, on ${priorDate}. Nothing has changed since.`
            : 'Applied before. Nothing has changed since.'}
        </Quiet>
      ) : (
        <>
          <p className="dx-season__lede">
            {priorDate
              ? `Applied before, on ${priorDate}. Since then:`
              : 'Applied before. Since then:'}
          </p>
          <Ledger columns={1}>
            {measurements.map((m) => (
              <Fact key={m.key} label={m.label} value={measurementValue(m)} />
            ))}
            {declared.map((d) => (
              <Fact key={d.key} label={d.label} value={declaredValue(d)} />
            ))}
            <Fact label="Digitals" value={digitalsText} />
            <Fact label="Representation" value={repText} />
          </Ledger>
        </>
      )}
    </Sheet>
  );
}

export default SeasonMemory;
