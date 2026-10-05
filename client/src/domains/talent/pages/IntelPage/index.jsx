import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useIntel } from '../../hooks/useIntel';
import YouColumn from './YouColumn';
import Timeline from './Timeline';
import ThisWeek from './ThisWeek';
import AgencyIndex from './AgencyIndex';
import SentLinks from './SentLinks';
import { countsLine, filingHeadline, formatDay } from './placementModel';
import { SPRING } from './motion';
import './Desk.css';

/**
 * Intel: Placement, as a planning desk (tasks/intel-placement.md).
 *
 * Two questions, two columns. Left, standing still: who you are as an agency
 * would file you (height on a measuring wall, boards, book, digitals). Right,
 * moving: what to do and when (this week, one timeline of everything dated,
 * and the agencies by standing). The answer itself is the headline: the
 * boards you would be filed for, set as large as the page allows.
 */

function boardsWords(filing) {
  const bySlug = new Map((filing?.boards || []).map((b) => [b.slug, b]));
  return (filing?.filed || [])
    .map((slug) => bySlug.get(slug)?.label)
    .filter(Boolean)
    .map((label) => label.replace(/ and editorial$/, ''));
}

function Hero({ filing, agencies, now }) {
  const reduce = useReducedMotion();
  const words = boardsWords(filing);
  const head = filingHeadline(filing);
  const counts = countsLine(agencies);
  return (
    <header className="dk-hero">
      <div className="dk-hero-main">
        {words.length ? (
          <h1 className="dk-hero-words" aria-label={head.text}>
            {words.map((w, i) => (
              <motion.span
                key={w}
                initial={reduce ? false : { opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.09 }}
              >
                {w}.
              </motion.span>
            ))}
          </h1>
        ) : (
          <h1 className="dk-hero-sentence">{head.text}</h1>
        )}
        <p className="dk-hero-sub">
          {words.length ? 'Where agencies would usually file you. ' : ''}
          {head.sub}{' '}
          {head.link && <Link to={head.link.to} className="dk-link">{head.link.label}</Link>}
        </p>
      </div>
      <div className="dk-hero-side">
        <p className="dk-date">{formatDay(now, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {counts && <p className="dk-counts">{counts}</p>}
      </div>
    </header>
  );
}

function Failed({ onRetry }) {
  return (
    <div className="dk-page">
      <div className="dk-state" role="alert">
        <p>Intel could not load.</p>
        <button type="button" className="dk-button" onClick={() => onRetry()}>Try again</button>
      </div>
    </div>
  );
}

export default function IntelPage() {
  const { placement, isLoading, isError, refetch } = useIntel();
  const indexRef = useRef(null);
  const now = useMemo(() => new Date(), []);

  if (isLoading) {
    return (
      <div className="dk-page">
        <div className="dk-state" role="status" aria-label="Loading Intel">
          <span className="dk-loading" />
        </div>
      </div>
    );
  }

  // A payload without the placement sections is an API from before this page
  // (a server not yet restarted, or mid-deploy). Fail into the retry state
  // rather than crashing the dashboard.
  const unreadable =
    !placement ||
    (placement.meta?.restricted !== 'minor' &&
      (!placement.filing || !Array.isArray(placement.agencies) || !placement.calendar));
  if (isError || unreadable) return <Failed onRetry={refetch} />;

  if (placement.meta.restricted === 'minor') {
    return (
      <div className="dk-page">
        <header className="dk-hero">
          <div className="dk-hero-main">
            <h1 className="dk-hero-sentence">Placement on Pholio is for talent 18 and over.</h1>
            <p className="dk-hero-sub">
              Under 18, representation goes through your guardian and a licensed agent. Your book and comp card stay
              yours to build here.
            </p>
          </div>
        </header>
      </div>
    );
  }

  const { filing, digitals, shots, agencies, meta } = placement;
  const toIndex = () => {
    indexRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    indexRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="dk-page">
      <Hero filing={filing} agencies={agencies} now={now} />
      <div className="dk-desk">
        <YouColumn filing={filing} shots={shots} digitals={digitals} registryAgencies={meta.registryAgencies} />
        <div className="dk-moves">
          <ThisWeek placement={placement} now={now} />
          <section className="dk-plan" aria-labelledby="dk-plan-h">
            <h2 id="dk-plan-h" className="dk-h">The next six months</h2>
            <Timeline placement={placement} now={now} onNow={toIndex} />
          </section>
          <AgencyIndex ref={indexRef} agencies={agencies} />
          <SentLinks />
          <p className="dk-fine">
            Published requirements are each agency&rsquo;s own, as Pholio last checked them. Try-again dates are
            Pholio&rsquo;s guide from common agency practice; an agency&rsquo;s own resubmission policy comes first.
          </p>
        </div>
      </div>
    </div>
  );
}
