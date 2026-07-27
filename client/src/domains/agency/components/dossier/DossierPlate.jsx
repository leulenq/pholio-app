import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  handleShotError,
  initials,
  marketLabel,
  measurementProvenance,
  readingLine,
  representationRead,
  talentName,
} from './dossierModel';
import './dossier.css';

/**
 * The Plate — the front of the comp card, on the agency's own stock.
 *
 * This is the one region of the surface that is allowed to be loud. It runs on
 * deep ink so the talent's frame and name carry real presence before any
 * operational data arrives, and so the working paper below reads as a
 * deliberate change of register rather than more of the same.
 */
export function DossierPlate({ dossier, hero, onOpenHero, onOpenFrame, strip = [], frameCount }) {
  const talent = dossier.talent || {};
  const name = talentName(talent);
  const line = readingLine(dossier);
  const rep = representationRead(dossier.representation);
  // A dead asset URL must never leave a broken-image glyph on the masthead —
  // fall back to the monogram plate the empty case already uses.
  const [shotFailed, setShotFailed] = useState(false);
  const showShot = Boolean(hero) && !shotFailed;

  // The talent's own site, when they published one, plus the handles they
  // connected. Both come from `social_accounts` — never invented from a slug.
  const social = talent.social || [];
  const site = social.find((s) => s.platform === 'portfolio')?.url || null;
  const handles = social.filter((s) => s.platform !== 'portfolio' && (s.handle || s.url));

  return (
    <div className="dx-plate">
      <div className="dx-plate__frame">
        {showShot ? (
          <button
            type="button"
            className="dx-plate__shot"
            onClick={onOpenHero}
            aria-label={`Open ${name}'s frames`}
          >
            <img src={hero.path || hero.url} alt={name} onError={() => setShotFailed(true)} />
          </button>
        ) : (
          <div className="dx-plate__shot dx-plate__shot--empty" aria-hidden="true">
            <span>{initials(name)}</span>
          </div>
        )}
        {frameCount > 0 && (
          <p className="dx-plate__caption">
            {frameCount} frame{frameCount === 1 ? '' : 's'} in this submission
          </p>
        )}
      </div>

      <div className="dx-plate__identity">
        <h1 className="dx-plate__name">{name}</h1>

        {line.length > 0 && (
          <p className="dx-plate__line">
            {line.map((part, i) => (
              <React.Fragment key={`${part}-${i}`}>
                {i > 0 && <span className="dx-plate__sep" aria-hidden="true" />}
                {part}
              </React.Fragment>
            ))}
          </p>
        )}

        <div className="dx-plate__rep">
          <span className="dx-plate__rep-head">{rep.headline}</span>
          {rep.detail && <span className="dx-plate__rep-detail">{rep.detail}</span>}
        </div>

        {talent.bio_curated && <p className="dx-plate__bio">{talent.bio_curated}</p>}

        {(site || handles.length > 0 || talent.market) && (
          <div className="dx-plate__links">
            {talent.market && (
              <span className="dx-plate__market">{marketLabel(talent.market)} market</span>
            )}
            {site && (
              <a className="dx-plate__link" href={site} target="_blank" rel="noreferrer">
                Portfolio <ArrowUpRight size={13} aria-hidden />
              </a>
            )}
            {handles.map((s) => (
              <a
                key={`${s.platform}-${s.handle}`}
                className="dx-plate__link"
                href={s.url || '#'}
                target="_blank"
                rel="noreferrer"
              >
                {s.handle ? `@${String(s.handle).replace(/^@/, '')}` : s.platform}
                {s.verified ? <em className="dx-plate__ok">connected</em> : null}
                <ArrowUpRight size={13} aria-hidden />
              </a>
            ))}
          </div>
        )}

        {strip.length > 0 && (
          <div className="dx-plate__strip">
            {strip.map((img) => (
              <button
                type="button"
                key={img.id}
                className="dx-plate__thumb"
                onClick={() => onOpenFrame?.(img)}
                aria-label="Open this frame"
              >
                <img src={img.path || img.url} alt="" loading="lazy" onError={handleShotError} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Stat Line — the back of the comp card, set as one horizontal register.
 *
 * Bookers read stats across, not down: height first, then the track's own
 * measurement set, dual-unit throughout because international agencies work in
 * centimetres and US clients do not. Provenance is stated on the same band,
 * because a measurement with no date is a miscast waiting to happen.
 */
export function StatLine({ talent }) {
  const stats = talent?.stats || {};
  const provenance = measurementProvenance(talent);
  // Measurements only. Hair and eyes are colouring, not stats — they belong in
  // the professional record (where they already are), and dropping them keeps
  // this band on one line down to a laptop width.
  const fields = (stats.fields || []).filter((f) => f.key !== 'hair' && f.key !== 'eyes');

  // Split the dual string ("179 cm / 5'10\"") so the metric figure can carry
  // the weight and the imperial reading can sit under it as a secondary.
  // Non-numeric readings (hair, eyes) are capitalised — they are words, and a
  // lowercase word set in mono beside a column of figures reads as a defect.
  const split = (value) => {
    const raw = String(value ?? '');
    const parts = raw.split(' / ');
    let lead = parts[0] || '—';
    if (!/\d/.test(lead)) lead = lead.charAt(0).toUpperCase() + lead.slice(1);
    return { lead, alt: parts[1] || null };
  };

  if (fields.length === 0) {
    return (
      <div className="dx-statline dx-statline--empty">
        <p>No measurements were sent with this submission.</p>
      </div>
    );
  }

  return (
    <div className="dx-statline">
      <div className="dx-statline__cells">
        {fields.map((f) => {
          const { lead, alt } = split(f.value);
          return (
            <div className={`dx-stat${f.key === 'height' ? ' dx-stat--lead' : ''}`} key={f.key}>
              <span className="dx-stat__k">{f.label}</span>
              <span className="dx-stat__v">{lead}</span>
              {alt && <span className="dx-stat__alt">{alt}</span>}
            </div>
          );
        })}
      </div>
      <p
        className={`dx-statline__source${provenance.stale ? ' is-stale' : ''}${
          provenance.verified ? ' is-verified' : ''
        }`}
      >
        {provenance.text}
        {provenance.stale && (
          <span className="dx-statline__flag">Re-confirm before submitting to a client</span>
        )}
      </p>
    </div>
  );
}

export default DossierPlate;
