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
            Who's looking, what's landing, and where to focus next.
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
              Location and viewer detail stays off for this profile. You'll see
              materials readiness and where your submissions stand.
            </div>
          ) : null}

          {/* Zone 1 — The Pulse */}
          <Zone title="The Pulse" lede="This period, at a glance.">
            <Pulse pulse={intel.pulse} periodLabel={periodLabel(activeDays)} minor={minor} />
          </Zone>

          {/* Zone 2 — The Seismograph + Rhythm Field */}
          {!minor ? (
            <Zone
              title="The Seismograph"
              lede="Your attention over time, and the moments agencies acted on it."
            >
              <Seismograph seismograph={intel.seismograph} />
              <div className="intel-subhead">The Rhythm Field</div>
              {intel.rhythm ? (
                <RhythmField rhythm={intel.rhythm} />
              ) : isFree ? (
                <StudioLock
                  title="When your audience shows up"
                  blurb="The days and hours your attention lands, so you know when to post and follow up."
                />
              ) : null}
            </Zone>
          ) : null}

          {/* Zone 3 — The Market Board */}
          {!minor ? (
            <Zone title="The Market Board" lede="Which markets are pulling your book.">
              {intel.markets ? (
                <MarketBoard markets={intel.markets} sources={intel.sources} />
              ) : (
                <StudioLock
                  title="The markets pulling your book"
                  blurb="Which markets keep coming back — New York, Paris, Milan, home — and what that says about where you could place."
                />
              )}
            </Zone>
          ) : null}

          {/* Zone 4 — The Pipeline */}
          <Zone title="The Pipeline" lede="Where your submissions stand, and where they stall.">
            <Pipeline pipeline={intel.pipeline} />
          </Zone>

          {/* Zone 5 — The Book, Ranked */}
          {!minor ? (
            <Zone title="The Book, Ranked" lede="The frames holding attention — and the one for your card front.">
              {intel.book ? (
                <BookRanked book={intel.book} />
              ) : (
                <StudioLock
                  title="The frames holding attention"
                  blurb="Your book ranked by the attention each frame holds, and the one that belongs on your card front."
                />
              )}
            </Zone>
          ) : null}

          {/* Zone 6 — The Agency Lens */}
          <Zone
            id="intel-lens"
            title="The Agency Lens"
            lede="How current your materials are, and what to refresh first."
          >
            <AgencyLens lens={intel.lens} />
          </Zone>

          {/* Zone 7 — Trajectory */}
          {!minor ? (
            <Zone title="Trajectory" lede="Your momentum over the last 90 days.">
              {intel.trajectory ? (
                <Trajectory trajectory={intel.trajectory} />
              ) : (
                <StudioLock
                  title="Your momentum over time"
                  blurb="Whether you're trending across 90 days, with a benchmark as your market fills in."
                />
              )}
            </Zone>
          ) : null}

          <p className="intel-foot">
            Agency attention is shown in aggregate. A house is named only when it
            acts — a review, a request, a message.
          </p>
        </div>
      ) : null}
    </div>
  );
}
