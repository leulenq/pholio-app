/**
 * Open calls this week.
 *
 * Curated, hand-verified walk-in hours ("Muse · Thu · 3–4 PM ET"), ordered by
 * whichever comes round next. Free to every talent and gated by nothing: an
 * open call is public information, and a model who can only see it behind a
 * paywall would simply read it on the agency's own site instead.
 *
 * Three at most, then the link. The card renders nothing at all when Pholio
 * holds no windows — an empty calendar is not a feature to advertise.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { talentApi } from '../../api/talent';
import { formatWindowCompact, sortByNextOccurrence } from '../../utils/callWindows';

const MAX_ROWS = 3;

export default function OpenCallsCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['call-windows'],
    queryFn: talentApi.listCallWindows,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  const windows = React.useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return sortByNextOccurrence(rows).slice(0, MAX_ROWS);
  }, [data]);

  if (isPending || isError || windows.length === 0) return null;

  // The row of the page grid comes with the card, so nothing empty ships on the
  // (common) days Pholio holds no windows.
  return (
    <div className="ov-grid">
      <div className="ov-col-12">
        <section className="ov-calls" aria-labelledby="ov-calls-heading">
          <div className="ov-calls-header">
            <h2 id="ov-calls-heading" className="ov-calls-title">
              Open <em>Calls.</em>
            </h2>
            <Link to="/dashboard/talent/applications" className="ov-calls-all">
              All open calls <ArrowUpRight size={12} aria-hidden />
            </Link>
          </div>

          <ul className="ov-calls-list">
            {windows.map((window) => (
              <li key={window.id} className="ov-calls-row">
                <span className="ov-calls-name">{window.displayName}</span>
                <span className="ov-calls-when">{formatWindowCompact(window)}</span>
                <span className="ov-calls-label">{window.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
