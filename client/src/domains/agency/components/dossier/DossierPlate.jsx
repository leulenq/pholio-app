import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Fact, Ledger } from './DossierPrimitives';
import {
  initials,
  marketLabel,
  measurementProvenance,
  readingLine,
  representationRead,
  talentName,
} from './dossierModel';
import './dossier.css';

/**
 * The Plate — the comp card, rendered as software.
 *
 * Front of the card on the left (one strong frame), the name and the reading
 * line in the middle, the stat block on the right exactly where a booker
 * expects to find it: height first and large, then the track's own
 * measurement set, dual-unit, with its provenance stated underneath.
 */
export function DossierPlate({ dossier, hero, onOpenHero }) {
  const talent = dossier.talent || {};
  const stats = talent.stats || {};
  const name = talentName(talent);
  const line = readingLine(dossier);
  const rep = representationRead(dossier.representation);
  const provenance = measurementProvenance(talent);

  // The talent's own site, when they published one, plus the handles they
  // connected. Both come from `social_accounts` — never invented from a slug.
  const social = talent.social || [];
  const site = social.find((s) => s.platform === 'portfolio')?.url || null;
  const handles = social.filter((s) => s.platform !== 'portfolio' && (s.handle || s.url));

  // Height leads the stat block; the rest of the track's canonical fields
  // follow in the order stats-formatter emits them.
  const rest = (stats.fields || []).filter((f) => f.key !== 'height');

  return (
    <div className="dx-plate">
      <div className="dx-plate__frame">
        {hero ? (
          <button
            type="button"
            className="dx-plate__shot"
            onClick={onOpenHero}
            aria-label={`Open ${name}'s frames`}
          >
            <img src={hero.path || hero.url} alt={name} />
          </button>
        ) : (
          <div className="dx-plate__shot dx-plate__shot--empty" aria-hidden="true">
            <span>{initials(name)}</span>
          </div>
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

        {(site || handles.length > 0) && (
          <div className="dx-plate__links">
            {site && (
              <a className="dx-link" href={site} target="_blank" rel="noreferrer">
                Portfolio <ArrowUpRight size={13} aria-hidden />
              </a>
            )}
            {handles.map((s) => (
              <a
                key={`${s.platform}-${s.handle}`}
                className="dx-link"
                href={s.url || '#'}
                target="_blank"
                rel="noreferrer"
              >
                {s.handle ? `@${String(s.handle).replace(/^@/, '')}` : s.platform}
                {s.verified ? <span className="dx-link__ok" title="Connected account">connected</span> : null}
                <ArrowUpRight size={13} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="dx-plate__stats">
        <div className="dx-height">
          <span className="dx-height__key">Height</span>
          {stats.height ? (
            <>
              <span className="dx-height__cm">{stats.height.cm}<i>cm</i></span>
              <span className="dx-height__alt">{stats.height.feet_inches}</span>
            </>
          ) : (
            <span className="dx-height__missing">Not given</span>
          )}
        </div>

        {rest.length > 0 ? (
          <Ledger>
            {rest.map((f) => (
              <Fact key={f.key} label={f.label} value={f.value} mono />
            ))}
          </Ledger>
        ) : (
          <p className="dx-quiet">No measurements on this submission.</p>
        )}

        <p className={`dx-provenance${provenance.stale ? ' is-stale' : ''}${provenance.verified ? ' is-verified' : ''}`}>
          {provenance.text}
          {provenance.stale && <span className="dx-provenance__flag">Re-confirm before submitting to a client</span>}
        </p>

        {talent.market && (
          <p className="dx-plate__market">Market: {marketLabel(talent.market)}</p>
        )}
      </div>
    </div>
  );
}

export default DossierPlate;
