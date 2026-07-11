export const BOOKING_LANES = [
  {
    slug: 'commercial',
    label: 'Commercial',
    group: 'commercial',
    description: 'Campaigns, catalog, product, and approachable brand work.',
  },
  {
    slug: 'ecomm',
    label: 'E-comm',
    group: 'commercial',
    description: 'High-volume e-commerce and catalog studio work — clean, product-forward frames.',
  },
  {
    slug: 'editorial',
    label: 'Editorial',
    group: 'fashion',
    description: 'Magazine, beauty, fashion story, and image-led creative briefs.',
  },
  {
    slug: 'runway',
    label: 'Runway',
    group: 'fashion',
    description: 'Shows, presentations, showroom, and movement-led fashion work.',
  },
  {
    slug: 'lifestyle',
    label: 'Lifestyle',
    group: 'commercial',
    description: 'Natural, relatable, social, wellness, family, and everyday-use campaigns.',
  },
  {
    slug: 'beauty',
    label: 'Beauty',
    group: 'commercial',
    description: 'Skin, hair, cosmetics, fragrance, and close-up visual work.',
  },
  {
    slug: 'fitness',
    label: 'Fitness / Athletic',
    group: 'body_fit',
    description: 'Activewear, sport, wellness, swim, and movement-based body work.',
  },
  {
    slug: 'fit',
    label: 'Fit',
    group: 'body_fit',
    description: 'Garment fitting, sample-size checks, showroom fit, and production work.',
  },
  {
    slug: 'parts',
    label: 'Parts',
    group: 'body_fit',
    description: 'Hands, feet, hair, skin, legs, lips, and detail-specific product work.',
  },
  {
    slug: 'curve',
    label: 'Curve',
    group: 'fashion',
    description: 'Extended-size, curve, and inclusive fashion or commercial briefs.',
  },
  {
    slug: 'petite',
    label: 'Petite',
    group: 'fashion',
    description: 'Petite, print, commercial, and brand work where shorter height routes well.',
  },
  {
    slug: 'promotional',
    label: 'Promotional / Events',
    group: 'commercial',
    description: 'Trade shows, live brand events, launches, and experiential work.',
  },
  {
    slug: 'creator_ugc',
    label: 'Creator / UGC',
    group: 'creator',
    description: 'Social-first branded content, creator packages, and UGC campaigns.',
  },
];

export const BOOKING_LANE_GROUP_LABELS = {
  fashion: 'Fashion',
  commercial: 'Commercial',
  body_fit: 'Body & fit',
  creator: 'Creator',
};

export const BOOKING_LANE_BY_SLUG = Object.fromEntries(
  BOOKING_LANES.map((lane) => [lane.slug, lane]),
);

export function normalizeBookingLaneSlug(value) {
  if (value === null || value === undefined) return null;
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases = {
    swim_fitness: 'fitness',
    swim: 'fitness',
    athletic: 'fitness',
    sports: 'fitness',
    sport: 'fitness',
    plus: 'curve',
    plus_size: 'curve',
    parts_modeling: 'parts',
    parts_model: 'parts',
    e_comm: 'ecomm',
    e_commerce: 'ecomm',
    ecommerce: 'ecomm',
    print: 'commercial',
    fashion: 'editorial',
    events: 'promotional',
    influencer: 'creator_ugc',
    ugc: 'creator_ugc',
    creator: 'creator_ugc',
  };

  const normalized = aliases[slug] || slug;
  return BOOKING_LANE_BY_SLUG[normalized] ? normalized : null;
}

export function normalizeBookingLaneList(values) {
  if (!values) return [];
  const list = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const out = [];

  for (const value of list) {
    const slug = normalizeBookingLaneSlug(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }

  return out;
}
