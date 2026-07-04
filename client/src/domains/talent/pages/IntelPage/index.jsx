import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Lock } from 'lucide-react';
import { useIntel } from '../../hooks/useIntel';
import { Zone, StudioLock } from './instruments/parts';
import { SPRING } from './instruments/metrics';
import Pulse from './instruments/Pulse';
import Seismograph from './instruments/Seismograph';
import RhythmField from './instruments/RhythmField';
import MarketBoard from './instruments/MarketBoard';
import Pipeline from './instruments/Pipeline';
import BookRanked from './instruments/BookRanked';
import AgencyLens from './instruments/AgencyLens';
import Trajectory from './instruments/Trajectory';
import './IntelPage.css';

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function periodLabel(days) {
  if (days <= 7) return 'this week';
  if (days <= 31) return 'this month';
  return 'this quarter';
}

function PeriodControl({ tier, activeDays, onSelect }) {
  const isFree = tier === 'free';
  return (
    <div className="intel-period" role="group" aria-label="Time period">
      {PERIODS.map((p) => {
        const locked = isFree && p.days > 7;
        const active = p.days === activeDays;
        return (
          <button
            key={p.days}
            type="button"
            className={`intel-period__opt${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
            aria-pressed={active}
            onClick={() => (locked ? onSelect('upgrade') : onSelect(p.days))}
          >
            {p.label}
            {locked ? <Lock size={11} strokeWidth={2} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="intel-skeleton" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="intel-skeleton__block" style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

export default function IntelPage() {
  const [requestedDays, setRequestedDays] = useState(30);
  const { intel, meta, isLoading, isError, refetch } = useIntel(requestedDays);

  const tier = meta?.tier || 'free';
  const activeDays = meta?.days || requestedDays;
  const minor = Boolean(meta?.minor);
  const isFree = tier === 'free';

  const handlePeriod = (value) => {
    if (value === 'upgrade') {
      window.location.href = '/dashboard/talent/settings/subscription';
      return;
    }
    setRequestedDays(value);
  };

  return (
    <div className="intel-page">
      <motion.header
        className="intel-masthead"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="intel-masthead__lede">
          <h1 className="intel-masthead__title">Intel</h1>
          <p className="intel-masthead__sub">
            Your book, read the way a booker reads it — what's getting requested,
            what's working, and the one thing to fix next.
          </p>
        </div>
        {!isLoading && !isError && !minor ? (
          <PeriodControl tier={tier} activeDays={activeDays} onSelect={handlePeriod} />
        ) : null}
      </motion.header>

      {isLoading ? <PageSkeleton /> : null}

      {isError ? (
        <div className="intel-error" role="alert">
          <AlertCircle size={20} strokeWidth={1.8} aria-hidden />
          <p>Intel couldn't load right now.</p>
          <button type="button" onClick={() => refetch()} className="intel-error__retry">
            Try again
          </button>
        </div>
      ) : null}

      {!isLoading && !isError && intel ? (
        <div className="intel-zones">
          {minor ? (
            <div className="intel-minor-note">
              Attention and location detail is withheld on this profile. Intel
              shows your materials readiness and submission states only.
            </div>
          ) : null}

          {/* Zone 1 — The Pulse */}
          <Zone index={1} title="The Pulse">
            <Pulse pulse={intel.pulse} periodLabel={periodLabel(activeDays)} minor={minor} />
          </Zone>

          {/* Zone 2 — The Seismograph + Rhythm Field */}
          {!minor ? (
            <Zone
              index={2}
              title="The Seismograph"
              lede="Attention over time — qualified visits as a field, card pulls as strikes, agency events above."
            >
              <Seismograph seismograph={intel.seismograph} />
              <div className="intel-subhead">The Rhythm Field</div>
              {intel.rhythm ? (
                <RhythmField rhythm={intel.rhythm} />
              ) : isFree ? (
                <StudioLock
                  title="When your audience shows up"
                  blurb="The Rhythm Field maps the days and hours your attention arrives, so you know exactly when to share and follow up. Included with Studio+."
                />
              ) : null}
            </Zone>
          ) : null}

          {/* Zone 3 — The Market Board */}
          {!minor ? (
            <Zone index={3} title="The Market Board" lede="Where your attention comes from — read as markets, the way the industry thinks.">
              {intel.markets ? (
                <MarketBoard markets={intel.markets} sources={intel.sources} />
              ) : (
                <StudioLock
                  title="The markets pulling your materials"
                  blurb="See which markets — NYC, Paris, Milan, your home region — keep returning to your book, and what that says about where you could place. Included with Studio+."
                />
              )}
            </Zone>
          ) : null}

          {/* Zone 4 — The Pipeline */}
          <Zone index={4} title="The Pipeline" lede="The submission funnel you actually live — and where it's being won or lost.">
            <Pipeline pipeline={intel.pipeline} />
          </Zone>

          {/* Zone 5 — The Book, Ranked */}
          {!minor ? (
            <Zone index={5} title="The Book, Ranked" lede="Your photography is the chart — the frames doing the work, ranked by the attention they hold.">
              {intel.book ? (
                <BookRanked book={intel.book} />
              ) : (
                <StudioLock
                  title="Which frames carry your book"
                  blurb="Rank your frames by the attention they hold, find the one that belongs on your card front, and see what's getting skipped. Included with Studio+."
                />
              )}
            </Zone>
          ) : null}

          {/* Zone 6 — The Agency Lens */}
          <Zone
            id="intel-lens"
            index={6}
            title="The Agency Lens"
            lede="Your profile read through a booker's eyes — and the ranked moves that lift your signal."
          >
            <AgencyLens lens={intel.lens} />
          </Zone>

          {/* Zone 7 — Trajectory */}
          {!minor ? (
            <Zone index={7} title="Trajectory" lede="Are you trending? Momentum over 90 days, drawn from your strongest signals.">
              {intel.trajectory ? (
                <Trajectory trajectory={intel.trajectory} />
              ) : (
                <StudioLock
                  title="Your momentum over time"
                  blurb="Track whether you're trending across 90 days, with the causes annotated — and a benchmark band as your market fills in. Included with Studio+."
                />
              )}
            </Zone>
          ) : null}

          <p className="intel-foot">
            Agency attention appears in aggregate only — Intel never shows you
            which named house viewed you. Named agencies surface only when they
            act: a review, a request, a message.
          </p>
        </div>
      ) : null}
    </div>
  );
}
