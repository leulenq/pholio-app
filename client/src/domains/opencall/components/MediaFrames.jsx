import React, { useRef } from 'react';

/**
 * The digitals stage (`client/src/domains/onboarding/DESIGN.md` §5).
 *
 * Labeled frames — Headshot, Full length — each tap-to-upload, each replaceable,
 * with the intake guidance sitting well below as a very subtle line. This is the
 * highest-value-per-second ask in the whole form (design §2.2) and the highest
 * abandonment risk (ruling Q7), which is why it is sequenced last and why a
 * frame reports its own state in words rather than making the applicant guess.
 *
 * @param {Array}  fields    `[{key, label, requirement}]` — media entries in spec order.
 * @param {Array}  present   Field keys the server confirms it is holding.
 * @param {object} previews  `{[key]: objectUrl}` for picks made this session.
 * @param {object} busy      `{[key]: true}` while an upload is in flight.
 * @param {object} errors    `{[key]: string}` in plain words.
 * @param {Function} onPick  `(fieldKey, File)`.
 */
export default function MediaFrames({
  fields = [],
  present = [],
  previews = {},
  busy = {},
  errors = {},
  onPick,
}) {
  const inputs = useRef({});
  const held = new Set(present);

  return (
    <>
      <div className="oc-frames">
        {fields.map((field) => {
          const filled = held.has(field.key);
          const uploading = Boolean(busy[field.key]);
          const state = uploading ? 'Uploading…' : filled ? 'Replace' : 'Add photo';
          return (
            <button
              key={field.key}
              type="button"
              className={`oc-frame${filled ? ' is-filled' : ''}`}
              onClick={() => inputs.current[field.key]?.click()}
              aria-label={`${field.label}${filled ? ' — added, tap to replace' : ''}`}
            >
              {previews[field.key] ? (
                <img className="oc-frame__preview" src={previews[field.key]} alt="" />
              ) : null}
              <span className="oc-frame__label">{field.label}</span>
              <span className="oc-frame__state">{state}</span>
              <input
                ref={(node) => {
                  inputs.current[field.key] = node;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onPick?.(field.key, file);
                }}
              />
            </button>
          );
        })}
      </div>

      {fields.map((field) =>
        errors[field.key] ? (
          <p className="oc__error" key={`${field.key}-error`}>
            {field.label}: {errors[field.key]}
          </p>
        ) : null,
      )}

      <p className="oc-frames__guidance">
        Plain background · Natural light · Minimal makeup · No filters
      </p>
    </>
  );
}
