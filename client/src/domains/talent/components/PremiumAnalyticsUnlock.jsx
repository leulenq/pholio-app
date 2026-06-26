import React from 'react';
import { ArrowRight } from 'lucide-react';
import PholioBillingWordmark from '../../../shared/components/billing/PholioBillingWordmark';
import LockedMetricCard from './LockedMetricCard';
import './PremiumAnalyticsUnlock.css';

export default function PremiumAnalyticsUnlock() {
  return (
    <section className="ph-premium-unlock" aria-labelledby="premium-unlock-title">
      <div className="ph-premium-unlock__glow" aria-hidden="true" />
      <div className="ph-premium-unlock__inner">
        <div className="ph-premium-unlock__grid">
          <div>
            <PholioBillingWordmark variant="on-ink" size="sm" />
            <h2 id="premium-unlock-title" className="ph-premium-unlock__title">
              See who&apos;s <em>watching you</em>
            </h2>
            <p className="ph-premium-unlock__lede">
              Unlock <strong>Studio+</strong> for profile views by agency, engagement trends,
              and exportable reports. Start with a 14-day trial — $9.99/month or $95.88/year.
            </p>
            <ul className="ph-premium-unlock__features">
              <li>90-day history and trends</li>
              <li>Visitor audience breakdown</li>
              <li>Exportable PDF reports</li>
            </ul>
            <a
              href="/dashboard/talent/settings/subscription"
              className="ph-premium-unlock__cta"
            >
              <span>Unlock Studio+</span>
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>

          <div className="ph-premium-unlock__cards">
            <div className="ph-premium-unlock__cards-glow" aria-hidden="true" />
            <div className="ph-premium-unlock__cards-grid">
              <div className="ph-premium-unlock__card-offset">
                <LockedMetricCard
                  title="Engagement Score"
                  previewValue="High"
                  feature="Track interactions"
                  variant="dark"
                />
              </div>
              <div>
                <LockedMetricCard
                  title="Peak Activity"
                  previewValue="2PM"
                  feature="Best posting times"
                  variant="dark"
                />
              </div>
              <div className="ph-premium-unlock__card-wide">
                <LockedMetricCard
                  title="Audience Geography"
                  previewValue="New York, NY"
                  feature="Top location breakdown"
                  variant="dark"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
