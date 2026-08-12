import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import { useIntel } from '../../hooks/useIntel';
import DecisionStack from './blocks/DecisionStack';
import SubmissionsBlock from './blocks/SubmissionsBlock';
import MaterialsBlock from './blocks/MaterialsBlock';
import AttentionBlock from './blocks/AttentionBlock';
import BookBlock from './blocks/BookBlock';
import MomentumBlock from './blocks/MomentumBlock';
import './IntelPage.css';

const RANGES = [
  { days: 7, label: '7d', proOnly: false },
  { days: 30, label: '30d', proOnly: true },
  { days: 90, label: '90d', proOnly: true },
];

function PeriodControl({ days, onChange, tier }) {
  const free = tier === 'free';
  return (
    <PholioToggleGroup role="group" aria-label="Reporting period">
      {RANGES.map((r) => (
        <PholioToggleButton
          key={r.days}
          active={days === r.days}
          disabled={free && r.proOnly}
          onClick={() => onChange(r.days)}
        >
          {r.label}
          {free && r.proOnly ? <Lock size={9} className="iv-range-lock" aria-hidden /> : null}
        </PholioToggleButton>
      ))}
    </PholioToggleGroup>
  );
}

function IntelLoading() {
  return (
    <div className="iv-loading" role="status" aria-label="Loading intel">
      <div className="iv-loading-band" />
    </div>
  );
}

function IntelError({ onRetry }) {
  return (
    <div className="iv-error">
      <p>Intel couldn&rsquo;t load.</p>
      <PholioButton variant="secondary" onClick={onRetry}>
        Try again
      </PholioButton>
    </div>
  );
}

/**
 * Intel — the talent-facing intelligence hub.
 *
 * The page is a short sequence of questions, in the order a working model asks
 * them: what needs attention, what happened after submitting, whether the
 * package is current, how the profile was used, and which frames were opened.
 * Each block states its finding in one line and puts the chart underneath as
 * the evidence for it. Blocks are deliberately not equally weighted — the
 * decision stack leads, and the rest support it.
 *
 * Minors get materials readiness and submission states only; every audience
 * instrument is absent rather than emptied (spec §4).
 */
export default function IntelPage() {
  const [days, setDays] = useState(30);
  const { intel, meta, isLoading, isError, refetch } = useIntel(days);
  const data = intel;
  // The server clamps free tier to 7 days; keep the toggle honest.
  const effectiveDays = meta?.days ?? days;
  const tier = meta?.tier ?? 'studio';
  const minor = Boolean(meta?.minor);

  const clock = data?.submissions?.readClock;
  const standing = {
    open: clock?.open?.length ?? 0,
    late: (clock?.states?.late ?? 0) + (clock?.states?.cold ?? 0),
  };

  return (
    <div className="iv-page">
      <header className="iv-masthead">
        <span className="iv-masthead-mark">Pholio</span>
        <div className="iv-masthead-bar">
          <h1 className="iv-title">Intel</h1>
          {!minor && data && (
            <PeriodControl days={effectiveDays} onChange={setDays} tier={tier} />
          )}
        </div>
      </header>

      {isLoading && <IntelLoading />}
      {isError && <IntelError onRetry={refetch} />}

      {data && (
        <>
          <DecisionStack
            decisions={data.decisions}
            sendability={data.materials?.sendability}
            standing={standing}
          />

          {minor && (
            <p className="iv-minor-note">
              Intel for under-18 profiles covers materials readiness and submission states.
              Audience detail stays off.
            </p>
          )}

          <SubmissionsBlock submissions={data.submissions} days={effectiveDays} />

          <MaterialsBlock materials={data.materials} />

          {!minor && (
            <AttentionBlock attention={data.attention} meta={meta} tier={tier} />
          )}

          {!minor && <BookBlock book={data.book} tier={tier} />}

          {!minor && <MomentumBlock momentum={data.momentum} tier={tier} />}

        </>
      )}
    </div>
  );
}
