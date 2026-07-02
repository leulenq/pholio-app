import { BOOKING_LANE_BY_SLUG } from '../../../../shared/constants/bookingLanes';

export function getLaneFitSignals(profileValues = {}) {
  return [
    { slug: 'runway', score: profileValues.fit_score_runway },
    { slug: 'editorial', score: profileValues.fit_score_editorial },
    { slug: 'commercial', score: profileValues.fit_score_commercial },
    { slug: 'lifestyle', score: profileValues.fit_score_lifestyle },
    { slug: 'fitness', score: profileValues.fit_score_swim_fitness },
  ]
    .map((item) => ({
      ...item,
      score: Number(item.score),
      lane: BOOKING_LANE_BY_SLUG[item.slug],
    }))
    .filter((item) => item.lane && Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
