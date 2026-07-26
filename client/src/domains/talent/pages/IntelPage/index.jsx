import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../../../../shared/components/ui/PholioButton';
import { useIntel } from '../../hooks/useIntel';
import { ZoneSection, LockCard } from './IntelKit';
import { isLocked } from './intelUtils';
import PulseZone from './PulseZone';
import Seismograph from './Seismograph';
import RhythmField from './RhythmField';
import MarketBoard from './MarketBoard';
import PipelineFlow from './PipelineFlow';
import BookRanked from './BookRanked';
import AgencyLens from './AgencyLens';
import SearchDemand from './SearchDemand';
import Trajectory from './Trajectory';
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
          {free && r.proOnly ? <Lock size={9} className="intel2-range-lock" aria-hidden /> : null}
        </PholioToggleButton>
      ))}
    </PholioToggleGroup>
  );
}

function IntelLoading() {
  return (
    <div className="intel2-loading" role="status" aria-label="Loading intel">
      <div className="intel2-loading-band" />
      <p className="intel2-loading-copy">Reading the market…</p>
    </div>
  );
}

function IntelError({ onRetry }) {
  return (
    <div className="intel2-error">
      <p className="intel2-error-copy">Intel couldn&rsquo;t load. The market is still there.</p>
      <PholioButton variant="secondary" onClick={onRetry}>Try again</PholioButton>
    </div>
  );
}

/**
 * Intel — the talent-facing intelligence hub (tasks/intel-page-spec.md).
 * Zones flow top-down by signal value: agency reviews before raw reach.
 * Minors get materials readiness + submission states only.
 */
export default function IntelPage() {
  const [days, setDays] = useState(30);
  const { intel, meta, isLoading, isError, refetch } = useIntel(days);
  const data = intel;
  // The server clamps free tier to 7 days; keep the toggle honest.
  const effectiveDays = meta?.days ?? days;
  const tier = meta?.tier ?? 'studio';
  const minor = Boolean(meta?.minor);

  return (
    <div className="intel2-page">
      <header className="intel2-head">
        <h1 className="intel2-title">Intel</h1>
        {!minor && data && (
          <PeriodControl days={effectiveDays} onChange={setDays} tier={tier} />
        )}
      </header>

      {isLoading && <IntelLoading />}
      {isError && <IntelError onRetry={refetch} />}

      {data && minor && (
        <>
          <p className="intel2-minor-note">
            Intel for under-18 profiles covers materials readiness and submission states —
            audience detail stays off.
          </p>
          <ZoneSection id="intel2-pulse" title={null}>
            <PulseZone pulse={data.pulse} />
          </ZoneSection>
          <ZoneSection id="intel2-pipeline" title="The Pipeline">
            <PipelineFlow pipeline={data.pipeline} />
          </ZoneSection>
          <ZoneSection id="intel2-lens" title="The Agency Lens">
            <AgencyLens lens={data.lens} />
          </ZoneSection>
        </>
      )}

      {data && !minor && (
        <>
          <ZoneSection id="intel2-pulse" title={null}>
            <PulseZone pulse={data.pulse} />
          </ZoneSection>

          <ZoneSection id="intel2-seismograph" title="The Seismograph">
            <Seismograph seismograph={data.seismograph} canScrub={tier === 'studio'} />
            {isLocked(data.rhythm, meta) ? (
              <LockCard zone="The Rhythm Field">
                When attention arrives — a day-by-hour field that tells you when to share,
                post and follow up.
              </LockCard>
            ) : (
              data.rhythm && <RhythmField rhythm={data.rhythm} />
            )}
          </ZoneSection>

          <ZoneSection id="intel2-markets" title="The Market Board">
            {isLocked(data.markets, meta) ? (
              <LockCard zone="The Market Board">
                Where your attention comes from, rendered the way the industry thinks —
                markets, not countries. Sustained market attention is a placement signal.
              </LockCard>
            ) : (
              <MarketBoard markets={data.markets} sources={data.sources} meta={meta} />
            )}
          </ZoneSection>

          <ZoneSection id="intel2-pipeline" title="The Pipeline">
            <PipelineFlow pipeline={data.pipeline} />
          </ZoneSection>

          <ZoneSection id="intel2-book" title="The Book, Ranked">
            {isLocked(data.book, meta) ? (
              <LockCard zone="The Book, Ranked">
                Your actual book, ranked by the attention each frame earns — evidence for
                choosing your card front and portfolio opener.
              </LockCard>
            ) : (
              <BookRanked book={data.book} />
            )}
          </ZoneSection>

          <ZoneSection id="intel2-lens" title="The Agency Lens">
            <AgencyLens lens={data.lens} />
          </ZoneSection>

          {Array.isArray(data.demand?.nudges) && data.demand.nudges.length > 0 && (
            <ZoneSection id="intel2-demand" title="The Search Signal">
              <SearchDemand demand={data.demand} />
            </ZoneSection>
          )}

          <ZoneSection id="intel2-trajectory" title="Trajectory">
            {isLocked(data.trajectory, meta) ? (
              <LockCard zone="Trajectory">
                Your ninety-day momentum line, drawn from tier 1–4 signal with the
                composition always inspectable.
              </LockCard>
            ) : (
              <Trajectory trajectory={data.trajectory} />
            )}
          </ZoneSection>
        </>
      )}
    </div>
  );
}
