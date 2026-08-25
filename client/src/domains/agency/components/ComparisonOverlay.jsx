import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { compareApplications } from '../api/agency';
import './ComparisonOverlay.css';

/**
 * Compare — comp cards on a table, read literally.
 *
 * The spec is "side-by-side, uniform fields and crops. The digital equivalent of
 * comp cards on a table." The first build kept *uniform fields* and dissolved
 * *comp cards*: every applicant became a column of spreadsheet cells, which
 * inverted the hierarchy the whole industry reads by. On a real table the first
 * read is the PERSON AS AN OBJECT — a card with edges, a name, a face — and the
 * flick across fields is second. A data grid only ever gives the second.
 *
 * So: an ink room, white paper cards in the reviewer's own selection order, all
 * locked to one shared row grid via `subgrid` so a glance across any row lands
 * on the same field at the same height. Structural alignment, not hoped-for.
 *
 * WHY THE PREMIUM FEELING HAS TO COME FROM MATERIAL.
 *
 * Every conventional way to elevate a comparison UI is a way to emphasise one
 * row over another — highlight the delta, hero the leader, colour the outlier,
 * sort by the column. A1 forbids ranking, and each of those is a ranking with
 * extra steps. The only lever left is material: paper on ink, a serif name, mono
 * figures, one perfect grid. Luxury through sameness, like a well-printed deck
 * of identical cards. The constraint stops being a limitation and becomes the
 * aesthetic — and it is a look no competitor computing match scores can wear.
 *
 * The frame slot is switched for EVERY card at once. Mixed crops across cards is
 * exactly the non-uniformity the spec exists to prevent, so the control is
 * global by construction rather than by discipline.
 */

const SLOT_KEYS = ['headshot', 'profile', 'full_length'];

/** Height is the row a US booker re-reads in imperial; the sub restates, never judges. */
function imperialHeight(cm) {
  const total = Math.round(Number(cm) / 2.54);
  if (!Number.isFinite(total) || total <= 0) return null;
  return `${Math.floor(total / 12)}′ ${total % 12}″`;
}

function CardFrame({ record, slotKey, slotLabel }) {
  const cell = record.slots.find((s) => s.key === slotKey);
  const image = cell?.image || null;

  if (image) {
    return (
      <img
        className="cmp-frame"
        src={image.public_url || image.path}
        alt={`${record.name} — ${slotLabel.toLowerCase()}`}
        loading="lazy"
      />
    );
  }

  /* The one sanctioned exception to wordlessness. An unlabelled empty image is
     ambiguous — broken? loading? — in a way an empty cell under a labelled row
     is not, and for a withheld minor frame silence is actively misleading. */
  return (
    <div className="cmp-frame cmp-frame--empty">
      <span>{record.withheldForMinor ? 'Withheld' : 'Not sent'}</span>
    </div>
  );
}

export default function ComparisonOverlay({ applicationIds, onClose }) {
  const [slot, setSlot] = useState('headshot');
  const roomRef = useRef(null);
  const firstControlRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const query = useQuery({
    queryKey: ['applications-comparison', applicationIds],
    queryFn: () => compareApplications(applicationIds),
    enabled: applicationIds.length > 0,
  });

  // Memoised because `|| []` mints a new array every render, which would make
  // every downstream memo recompute and defeat the point of having one.
  const fields = useMemo(() => query.data?.fields || [], [query.data]);
  const slots = useMemo(() => query.data?.slots || [], [query.data]);
  const records = useMemo(() => query.data?.records || [], [query.data]);

  const slotLabel = useMemo(
    () => slots.find((s) => s.key === slot)?.label || 'Headshot',
    [slots, slot],
  );

  // Escape, slot keys, and a real focus trap — the first build had none.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    firstControlRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (['1', '2', '3'].includes(e.key)) {
        setSlot(SLOT_KEYS[Number(e.key) - 1]);
        return;
      }
      if (e.key !== 'Tab' || !roomRef.current) return;
      const focusables = roomRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus();
      }
    };
  }, [onClose]);

  const anyWithheld = records.some((r) => r.withheldForMinor);

  return (
    <div
      className="cmp"
      ref={roomRef}
      role="dialog"
      aria-modal="true"
      aria-label="Compare submissions"
      /* Stated to assistive tech, not printed on the surface. A page that
         announces its own even-handedness reads as a disclaimer; the uniformity
         demonstrates it. */
      aria-describedby="cmp-intent"
    >
      <p id="cmp-intent" className="cmp-sr">
        {records.length} submissions shown side by side with identical fields and
        crops. Nothing is ranked or ordered by value.
      </p>

      <header className="cmp-head">
        <h2 className="cmp-masthead">Side by side</h2>

        {records.length > 0 && (
          <div className="cmp-slots" role="group" aria-label="Which frame to show on every card">
            {slots.map((s, index) => (
              <button
                key={s.key}
                ref={index === 0 ? firstControlRef : null}
                type="button"
                className={`cmp-slot${slot === s.key ? ' is-on' : ''}`}
                aria-pressed={slot === s.key}
                onClick={() => setSlot(s.key)}
              >
                {s.label}
                <span className="cmp-slot-key" aria-hidden="true">{index + 1}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="cmp-close" onClick={onClose} aria-label="Close comparison">
          <X size={16} aria-hidden />
        </button>
      </header>

      {query.isError && <p className="cmp-state">These submissions could not be compared.</p>}
      {!query.isLoading && !query.isError && records.length === 0 && (
        <p className="cmp-state">Nothing to compare.</p>
      )}

      {(query.isLoading || records.length > 0) && (
        <div className="cmp-room">
          <div
            className="cmp-table"
            style={{ '--cmp-n': query.isLoading ? applicationIds.length : records.length }}
          >
            {/* Labels live once, on the ink, not repeated on every card. */}
            <div className="cmp-rail" aria-hidden="true">
              <span className="cmp-rail-name" />
              <span className="cmp-rail-frame" />
              <span className="cmp-rail-strip" />
              {fields.map((field) => (
                <span key={field.key} className="cmp-rail-label">{field.label}</span>
              ))}
              <span className="cmp-rail-foot" />
            </div>

            {query.isLoading
              ? applicationIds.map((id) => (
                  /* The skeleton already shows the final geometry, which is
                     itself the promise of uniformity. */
                  <div className="cmp-card cmp-card--skeleton" key={id} aria-hidden="true">
                    <span className="cmp-card-name" />
                    <span className="cmp-frame cmp-frame--empty" />
                    <span className="cmp-strip" />
                    {[...Array(12)].map((_, i) => <span className="cmp-figure" key={i} />)}
                    <span className="cmp-card-foot" />
                  </div>
                ))
              : records.map((record, index) => (
                  <article
                    className="cmp-card"
                    key={record.applicationId}
                    style={{ '--cmp-i': index }}
                  >
                    <header className="cmp-card-name">
                      <h3 className="cmp-name">{record.name}</h3>
                      <p className="cmp-meta">
                        {[
                          record.ageBand ? record.ageBand.replace(/_/g, ' ') : null,
                          record.submittedAt
                            ? `Submitted ${new Date(record.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </header>

                    <CardFrame record={record} slotKey={slot} slotLabel={slotLabel} />

                    {/* Always three cells, so a gap stays visible as a gap even
                        while the large frame shows one slot. */}
                    <div className="cmp-strip">
                      {slots.map((s) => {
                        const cell = record.slots.find((x) => x.key === s.key);
                        return (
                          <button
                            key={s.key}
                            type="button"
                            className={`cmp-thumb${slot === s.key ? ' is-on' : ''}`}
                            onClick={() => setSlot(s.key)}
                            aria-label={`Show ${s.label.toLowerCase()} on every card`}
                          >
                            {cell?.image ? (
                              <img src={cell.image.public_url || cell.image.path} alt="" loading="lazy" />
                            ) : (
                              <span className="cmp-thumb-empty" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {fields.map((field) => {
                      const value = record.fields.find((f) => f.key === field.key)?.value;
                      const given = value !== null && value !== undefined;
                      return (
                        <div className="cmp-figure" key={field.key}>
                          <span className="cmp-sr">{field.label}: </span>
                          {given ? (
                            <>
                              <span className="cmp-value">{value}</span>
                              {field.unit && <span className="cmp-unit">{field.unit}</span>}
                              {field.key === 'height' && imperialHeight(value) && (
                                <span className="cmp-sub">{imperialHeight(value)}</span>
                              )}
                            </>
                          ) : (
                            /* Blank means blank. The row rule continues through,
                               so the emptiness reads as a place a value would be
                               rather than as broken layout. */
                            <span className="cmp-sr">Not given</span>
                          )}
                        </div>
                      );
                    })}

                    <footer className="cmp-card-foot">
                      {record.withheldForMinor && (
                        /* On the card, where the absence is. A footnote at the
                           bottom of a scrolled surface is exactly where nobody
                           looks while forming the wrong impression. */
                        <p className="cmp-withheld">
                          Body frames withheld — applicant is under 18 without guardian
                          authorisation on file.
                        </p>
                      )}
                    </footer>
                  </article>
                ))}
          </div>
        </div>
      )}

      {anyWithheld && <span className="cmp-sr">Some columns are withheld, not unsent.</span>}
    </div>
  );
}
