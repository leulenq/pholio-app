import { useEffect, useRef, useState } from 'react';
import { Check, HelpCircle, X, Film, ExternalLink } from 'lucide-react';

/**
 * One applicant, as a visiting designer sees them.
 *
 * Photo-led because that is the actual decision: a designer scanning a lineup
 * is looking at digitals and reading measurements to confirm, not the other way
 * round. Stats are Figure-tier per the agency design system — mono tabular
 * numerals with a tracked Inter label, and never inside a container, because a
 * height is a fact about a person rather than a state they are in.
 *
 * The three-state control is PORTED from the dashboard's PickButton vocabulary,
 * not imported: pulling a component out of the agency bundle would drag the
 * dashboard's providers and tokens into a public page that must stay standalone.
 * What is preserved is the shape — a square affordance, `aria-pressed`, gold on
 * the active state only.
 *
 * Ruling R7 sizes a list at ~120 of these, so the card renders no media until
 * it is near the viewport and every image is `loading="lazy"` on top of that.
 */

const MARKS = [
  { value: 'pick', label: 'Pick', Icon: Check },
  { value: 'maybe', label: 'Maybe', Icon: HelpCircle },
  { value: 'pass', label: 'Pass', Icon: X },
];

const NOTE_MAX_LENGTH = 300;

// A walk video is a pasted URL (ruling R1 — there is no upload pipeline), so
// most of them are YouTube/Vimeo/Drive pages that a <video> element cannot
// play. Only a direct media file is embedded; everything else opens out.
const DIRECT_VIDEO = /\.(mp4|webm|ogv|m4v|mov)(\?.*)?$/i;

function isEmbeddableVideo(url) {
  return typeof url === 'string' && DIRECT_VIDEO.test(url);
}

/** Defer media until the card is close to view. */
function useNearViewport(ref) {
  // Environments without IntersectionObserver (jsdom, very old Safari) start
  // "near" so they simply render everything, rather than never rendering media.
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, near]);

  return near;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function availabilityLine(availability) {
  if (!availability) return null;
  const from = formatDate(availability.from);
  const to = formatDate(availability.to);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || null;
}

export default function PickCard({
  applicant,
  readOnly = false,
  saving = false,
  onMark,
  onNote,
}) {
  const cardRef = useRef(null);
  const nearViewport = useNearViewport(cardRef);

  const selection = applicant.selection || null;
  const activeMark = selection?.mark || null;
  const committedNote = selection?.note || '';

  // The server is the source of truth once a note is saved. Adjusting during
  // render (rather than in an effect) adopts the committed value without a
  // second render pass — and notes only ever commit on blur, so this cannot
  // land under the designer's cursor mid-sentence.
  const [note, setNote] = useState(committedNote);
  const [noteBaseline, setNoteBaseline] = useState(committedNote);
  if (noteBaseline !== committedNote) {
    setNoteBaseline(committedNote);
    setNote(committedNote);
  }

  const images = Array.isArray(applicant.images) ? applicant.images : [];
  const [hero, ...rest] = images;
  const statFields = applicant.stats?.fields || [];
  const availability = availabilityLine(applicant.availability);
  const walkVideo = applicant.walk_video_url;

  const handleMark = (value) => {
    if (readOnly) return;
    // Clicking the active verb clears it — the fourth state the designer needs
    // and the only way back to "not decided yet".
    onMark(value === activeMark ? null : value);
  };

  const commitNote = () => {
    if (readOnly || !activeMark) return;
    if (note.trim() === committedNote.trim()) return;
    onNote(note.trim());
  };

  return (
    <article
      ref={cardRef}
      className={`pk-card${activeMark ? ` pk-card--${activeMark}` : ''}`}
    >
      <div className="pk-card__figure">
        {hero && nearViewport ? (
          <img
            className="pk-card__hero"
            src={hero.url || hero.public_url || hero.path}
            alt={`${applicant.display_name || 'Applicant'} digital`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="pk-card__hero pk-card__hero--empty" aria-hidden="true" />
        )}
      </div>

      {rest.length > 0 && (
        <div className="pk-card__strip">
          {rest.slice(0, 4).map((image) => (
            <div key={image.id} className="pk-card__thumb">
              {nearViewport && (
                <img
                  src={image.url || image.public_url || image.path}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pk-card__body">
        <h2 className="pk-card__name">{applicant.display_name || 'Applicant'}</h2>

        {statFields.length > 0 && (
          <dl className="pk-card__stats">
            {statFields.map((field) => (
              <div key={field.key} className="pk-card__stat">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(availability || applicant.availability?.note) && (
          <p className="pk-card__line">
            <span className="pk-card__line-key">Available</span>
            {availability || applicant.availability?.note}
          </p>
        )}

        {walkVideo &&
          (isEmbeddableVideo(walkVideo) ? (
            nearViewport ? (
              <video
                className="pk-card__video"
                src={walkVideo}
                controls
                preload="none"
                playsInline
              />
            ) : (
              <div className="pk-card__video pk-card__video--empty" aria-hidden="true" />
            )
          ) : (
            <a
              className="pk-card__video-link"
              href={walkVideo}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <Film size={15} aria-hidden="true" />
              Walk video
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}

        <div
          className="pk-card__marks"
          role="group"
          aria-label={`Your call on ${applicant.display_name || 'this applicant'}`}
        >
          {MARKS.map(({ value, label, Icon }) => {
            const active = activeMark === value;
            return (
              <button
                key={value}
                type="button"
                className={`pk-mark pk-mark--${value}${active ? ' is-active' : ''}`}
                aria-pressed={active}
                disabled={readOnly || saving}
                onClick={() => handleMark(value)}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {activeMark && (
          <textarea
            className="pk-card__note"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            placeholder="Note for the organizer (optional)"
            disabled={readOnly}
            aria-label={`Note about ${applicant.display_name || 'this applicant'}`}
            onChange={(event) => setNote(event.target.value)}
            onBlur={commitNote}
          />
        )}
      </div>
    </article>
  );
}
