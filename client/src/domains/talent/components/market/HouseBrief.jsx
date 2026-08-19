import React, { useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { buildBrief } from '../../lib/briefModel';
import { channelName, countOf, longDate, registryName } from '../../lib/marketFormat';

/**
 * What a house asks for — as a brief, not an inspection.
 *
 * The previous version printed four equally weighted columns straight off the
 * registry: every published clause, every form field, Pholio's own notes about
 * what it could not verify, and a "Still needed" beside each of six frames.
 * Everything was present and nothing was answered.
 *
 * Four questions, in the order a talent actually asks them:
 *
 *   1. Can I do this, and what is missing?   — one line, at size, above all else
 *   2. What exactly do I shoot?              — the frames, bare
 *   3. How do they want it shot?             — the conditions, once, not per frame
 *   4. How do I apply?                       — the action
 *
 * Everything else — their form's field list, the freshness of Pholio's reading,
 * what the house does not publish — is a footnote behind one disclosure. It is
 * reference material, and reference material that opens by default is clutter.
 */

function Frames({ frames, have }) {
  if (!frames.length) return null;
  return (
    <ul className="hb-frames">
      {frames.map((frame) => (
        <li key={frame.key} className={`hb-frame${frame.have ? ' hb-frame--have' : ''}`}>
          {/*
            Only what is already in the set is marked. Marking the gaps put
            "Still needed" beside six frames out of six, which is a lot of ink
            to say the same thing the line above already said.
          */}
          <span className="hb-frame__mark" aria-hidden>
            {frame.have ? <Check size={11} strokeWidth={2.5} /> : null}
          </span>
          <span className="hb-frame__label">{frame.label}</span>
          {frame.have ? <span className="hb-sr">already in your set</span> : null}
        </li>
      ))}
      {have > 0 ? null : (
        <li className="hb-frames__none">None of these are in your set yet.</li>
      )}
    </ul>
  );
}

function Conditions({ conditions }) {
  const { wants, avoids } = conditions;
  if (!wants.length && !avoids.length) return null;
  return (
    <div className="hb-conds">
      {wants.length ? (
        <p className="hb-cond">
          <span className="hb-cond__key">Shoot</span>
          {wants.join(' · ')}
        </p>
      ) : null}
      {avoids.length ? (
        <p className="hb-cond hb-cond--avoid">
          <span className="hb-cond__key">Avoid</span>
          {avoids.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

export default function HouseBrief({
  house,
  brief: briefQuery,
  onCompose,
  onPrepare,
  onOutbound,
  isCoreReady,
  isSendReady,
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { view, unpublished, isLoading, error, refetch } = briefQuery;

  if (isLoading) {
    return (
      <div className="hb hb--waiting" role="status">
        <Loader2 size={15} className="app-spin" aria-hidden />
        Reading what they publish…
      </div>
    );
  }

  if (error) {
    return (
      <div className="hb hb--waiting" role="alert">
        Their requirements couldn&rsquo;t load.
        <button type="button" className="hb-link" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const source = house.researched[0] || house.pholio;
  const brief = buildBrief(view);
  const claim =
    house.verification?.registryStatus === 'active'
      ? registryName(house.verification.registry)
      : null;

  return (
    <div className="hb">
      {/* The verdict. One sentence, at size, carrying the only two numbers that
          matter — and it replaces both the old lede and six repeated labels. */}
      {brief?.asked ? (
        <p className="hb-verdict">
          {brief.asked}.{' '}
          <em>
            {brief.have > 0
              ? `${brief.have} of ${brief.frames.length} already in your set.`
              : 'None of them shot yet.'}
          </em>
        </p>
      ) : unpublished ? (
        <p className="hb-verdict">
          Pholio hasn&rsquo;t read their requirements yet.{' '}
          <em>Their own page is the source of truth.</em>
        </p>
      ) : (
        <p className="hb-verdict">
          They publish no shot list. <em>Send your strongest digitals.</em>
        </p>
      )}

      {brief?.standing?.blockers?.length ? (
        <p className="hb-blocker">{brief.standing.blockers[0]}</p>
      ) : null}

      {brief && (brief.frames.length || brief.conditions.wants.length) ? (
        <div className="hb-body">
          <Frames frames={brief.frames} have={brief.have} />
          <Conditions conditions={brief.conditions} />
        </div>
      ) : null}

      <div className="hb-acts">
        {house.pholio ? (
          <button type="button" className="hb-act" onClick={onCompose} disabled={!isCoreReady}>
            {!isCoreReady
              ? 'Finish your profile to submit'
              : isSendReady
                ? 'Compose a submission'
                : 'Prepare a submission'}
            {isCoreReady ? <ArrowUpRight size={14} aria-hidden /> : null}
          </button>
        ) : null}

        {house.researched.length ? (
          <button type="button" className="hb-act hb-act--ghost" onClick={onPrepare}>
            Prepare a package
            <ArrowUpRight size={14} aria-hidden />
          </button>
        ) : null}

        {source?.sourceUrl ? (
          <a
            className="hb-link"
            href={source.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOutbound}
          >
            {channelName(source.channelType)}
            <ArrowUpRight size={13} aria-hidden />
          </a>
        ) : null}

        <button
          type="button"
          className="hb-more"
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((open) => !open)}
        >
          {detailOpen ? 'Less' : 'More detail'}
        </button>
      </div>

      {/* Reference, not brief. Everything here is true and none of it changes
          what a talent does next, so it stays shut until asked for. */}
      {detailOpen ? (
        <dl className="hb-detail">
          {claim ? (
            <div>
              <dt>Registration</dt>
              <dd>
                {claim}
                {house.verification?.expiresOn
                  ? `, to ${longDate(house.verification.expiresOn)}`
                  : ''}
              </dd>
            </div>
          ) : null}

          {brief?.files ? (
            <div>
              <dt>Files</dt>
              <dd>
                They cap {brief.files.subjects.join(' and ')}. Pholio converts and resizes to
                fit.
              </dd>
            </div>
          ) : null}

          {brief?.formFieldCount ? (
            <div>
              <dt>Their form</dt>
              <dd>
                Asks {countOf(brief.formFieldCount, 'field')}
                {brief.unverifiableForm ? ' — have your details to hand' : ''}.
              </dd>
            </div>
          ) : null}

          {brief?.standing?.clears?.length ? (
            <div>
              <dt>Eligibility</dt>
              <dd>{brief.standing.clears[0]}</dd>
            </div>
          ) : null}

          {source?.sourceCheckedOn ? (
            <div>
              <dt>Read on</dt>
              <dd>{longDate(source.sourceCheckedOn)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
