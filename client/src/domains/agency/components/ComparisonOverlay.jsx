import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { compareApplications } from '../api/agency';
import './ComparisonOverlay.css';

/**
 * "Side-by-side, uniform fields and crops. The digital equivalent of comp cards
 * on a table" (plan A4 #4).
 *
 * The layout IS the feature. Every applicant is a column of identical width;
 * every row is the same field at the same height; every frame is cropped to the
 * same aspect. That is what makes a glance across a row meaningful, and it is
 * the whole of what the software contributes. The reviewer does the comparing.
 *
 * What this deliberately does not do: score, rank, highlight an outlier, mark a
 * "best" cell, or sort by anything other than the order the reviewer selected.
 * A1 forbids ranking, and a table that quietly bolds the tallest applicant is a
 * ranking with extra steps.
 *
 * An empty cell stays empty. Not a dash, not a zero, not "—" — a missing
 * measurement is a fact about the submission, and it must not read as a value.
 */

export default function ComparisonOverlay({ applicationIds, onClose }) {
  const query = useQuery({
    queryKey: ['applications-comparison', applicationIds],
    queryFn: () => compareApplications(applicationIds),
    enabled: applicationIds.length > 0,
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fields = query.data?.fields || [];
  const slots = query.data?.slots || [];
  const records = query.data?.records || [];

  return (
    <div className="cmp-scrim" role="dialog" aria-modal="true" aria-label="Compare submissions">
      <div className="cmp-sheet">
        <header className="cmp-head">
          <h2 className="cmp-title">Side by side</h2>
          <button type="button" className="cmp-close" onClick={onClose} aria-label="Close comparison">
            <X size={16} aria-hidden />
          </button>
        </header>

        {query.isLoading && <p className="cmp-state">Laying them out…</p>}
        {query.isError && (
          <p className="cmp-state">These submissions could not be compared.</p>
        )}

        {!query.isLoading && !query.isError && records.length === 0 && (
          <p className="cmp-state">Nothing to compare.</p>
        )}

        {records.length > 0 && (
          /* Wide content scrolls inside its own container; the page behind must
             never scroll sideways. */
          <div className="cmp-scroll">
            <table className="cmp-table">
              <caption className="cmp-caption">
                {records.length} submissions, same fields and same crops. Nothing here is ranked.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="cmp-rowhead-col">
                    <span className="cmp-sr">Field</span>
                  </th>
                  {records.map((record) => (
                    <th key={record.applicationId} scope="col" className="cmp-col-head">
                      <span className="cmp-name">{record.name}</span>
                      {record.ageBand && <span className="cmp-age">{record.ageBand.replace(/_/g, ' ')}</span>}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.key}>
                    <th scope="row" className="cmp-rowhead">{slot.label}</th>
                    {records.map((record) => {
                      const cell = record.slots.find((s) => s.key === slot.key);
                      return (
                        <td key={record.applicationId} className="cmp-cell cmp-cell--frame">
                          {cell?.image ? (
                            <img
                              className="cmp-frame"
                              src={cell.image.public_url || cell.image.path}
                              alt={`${record.name} — ${slot.label.toLowerCase()}`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="cmp-frame cmp-frame--empty" aria-label="Not sent" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {fields.map((field) => (
                  <tr key={field.key}>
                    <th scope="row" className="cmp-rowhead">{field.label}</th>
                    {records.map((record) => {
                      const cell = record.fields.find((f) => f.key === field.key);
                      const value = cell?.value;
                      return (
                        <td key={record.applicationId} className="cmp-cell">
                          {value === null || value === undefined ? (
                            /* Deliberately blank. A dash reads as a value. */
                            <span className="cmp-sr">Not given</span>
                          ) : (
                            <span className="cmp-value">
                              {value}
                              {field.unit ? <span className="cmp-unit"> {field.unit}</span> : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {records.some((r) => r.withheldForMinor) && (
              <p className="cmp-note">
                Body frames are withheld for an under-18 applicant without guardian
                authorisation on file. A short column means withheld, not unsent.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
