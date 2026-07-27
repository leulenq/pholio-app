import React from 'react';
import { Camera } from 'lucide-react';
import {
  DIGITAL_SLOTS, fmtAgo, frameForSlot, handleShotError, packageRead,
} from './dossierModel';
import './dossier.css';

/**
 * The Digitals Set — the five raw frames an agency judges a body from:
 * headshot · profile · three-quarter · full length · back.
 *
 * Digitals are not the book. They are unretouched, plain-background, current
 * frames, and the single fastest way to know whether a submission is real is
 * to see which of the five slots are actually filled. Empty slots are drawn as
 * empty, never hidden — a gap is the finding.
 *
 * A minor without guardian consent is never asked for body frames, so those
 * slots are withheld rather than shown as failures.
 */
export function DigitalsSet({ dossier, onOpenFrame, onRequestMore, canRequest, requesting }) {
  const pkg = packageRead(dossier);
  const images = dossier.images || [];
  const slots = DIGITAL_SLOTS.filter(
    (slot) => !(pkg.suppressBodyImagery && slot.body),
  );

  const stale = pkg.digitalsAgeDays != null && pkg.digitalsAgeDays > 90;

  return (
    <div className="dx-digitals">
      <div className="dx-digitals__set">
        {slots.map((slot) => {
          const frame = frameForSlot(images, slot.key);
          if (!frame) {
            return (
              <div className="dx-slot dx-slot--empty" key={slot.key}>
                <div className="dx-slot__frame" aria-hidden="true" />
                <span className="dx-slot__label">{slot.label}</span>
                <span className="dx-slot__state">Not sent</span>
              </div>
            );
          }
          return (
            <button
              type="button"
              className="dx-slot"
              key={slot.key}
              onClick={() => onOpenFrame?.(frame)}
            >
              <div className="dx-slot__frame">
                <img
                  src={frame.path || frame.url}
                  alt={`${slot.label} digital`}
                  onError={handleShotError}
                />
              </div>
              <span className="dx-slot__label">{slot.label}</span>
              <span className="dx-slot__state">
                {frame.captured_at || frame.created_at
                  ? `shot ${fmtAgo(frame.captured_at || frame.created_at)}`
                  : 'on file'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="dx-digitals__read">
        <p className="dx-digitals__count">
          <strong>{pkg.set.filledCount} of {pkg.set.requiredCount}</strong> slots filled
          {pkg.set.missingSlots.length > 0 && (
            <span className="dx-digitals__gap"> — missing {pkg.missingLabels.join(', ').toLowerCase()}</span>
          )}
        </p>
        {pkg.suppressBodyImagery && (
          <p className="dx-digitals__note">
            Body frames are withheld for an under-18 talent without guardian authorisation on file.
          </p>
        )}
        {stale && (
          <p className="dx-digitals__note is-warn">
            Even the newest digital is {Math.round(pkg.digitalsAgeDays / 30)} months old — the
            trade expects digitals shot within the last three.
          </p>
        )}
        {onRequestMore && canRequest && pkg.set.missingSlots.length > 0 && (
          <button
            type="button"
            className="dx-textbtn"
            onClick={onRequestMore}
            disabled={requesting}
          >
            <Camera size={14} aria-hidden />
            {requesting ? 'Requesting…' : 'Ask for the missing frames'}
          </button>
        )}
      </div>
    </div>
  );
}

export default DigitalsSet;
