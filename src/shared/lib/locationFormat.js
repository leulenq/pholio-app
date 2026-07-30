const US_STATE_TO_ST = {
  'Alabama': 'AL',
  'Alaska': 'AK',
  'Arizona': 'AZ',
  'Arkansas': 'AR',
  'California': 'CA',
  'Colorado': 'CO',
  'Connecticut': 'CT',
  'Delaware': 'DE',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Hawaii': 'HI',
  'Idaho': 'ID',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA',
  'Maine': 'ME',
  'Maryland': 'MD',
  'Massachusetts': 'MA',
  'Michigan': 'MI',
  'Minnesota': 'MN',
  'Mississippi': 'MS',
  'Missouri': 'MO',
  'Montana': 'MT',
  'Nebraska': 'NE',
  'Nevada': 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'Oregon': 'OR',
  'Pennsylvania': 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Utah': 'UT',
  'Vermont': 'VT',
  'Virginia': 'VA',
  'Washington': 'WA',
  'West Virginia': 'WV',
  'Wisconsin': 'WI',
  'Wyoming': 'WY',
  'District of Columbia': 'DC',
};

const ST_TO_US_STATE = Object.fromEntries(
  Object.entries(US_STATE_TO_ST).map(([state, st]) => [st, state])
);

/**
 * Normalizes input (string or object) into a structured location record.
 * Does NOT invent state data if missing or ambiguous.
 */
function normalizeLocation(input) {
  if (!input) {
    return { city: '', region: '', regionCode: '', country: '', countryCode: '' };
  }

  if (typeof input === 'object') {
    const city = (input.city || input.name || '').trim();
    const region = (input.region || input.state || '').trim();
    const regionCode = (input.regionCode || input.st || US_STATE_TO_ST[region] || (ST_TO_US_STATE[region.toUpperCase()] ? region.toUpperCase() : '')).trim();
    const country = (input.country || '').trim();
    const countryCode = (input.countryCode || input.countryIso || (country === 'United States' || country === 'USA' || country === 'US' ? 'US' : '')).trim();

    return { city, region, regionCode, country, countryCode };
  }

  const str = String(input).trim();
  if (!str) {
    return { city: '', region: '', regionCode: '', country: '', countryCode: '' };
  }

  const parts = str.split(',').map((p) => p.trim());
  if (parts.length === 1) {
    return { city: parts[0], region: '', regionCode: '', country: '', countryCode: '' };
  }

  if (parts.length === 2) {
    const [city, second] = parts;
    if (US_STATE_TO_ST[second]) {
      return { city, region: second, regionCode: US_STATE_TO_ST[second], country: 'United States', countryCode: 'US' };
    }
    if (ST_TO_US_STATE[second.toUpperCase()]) {
      const st = second.toUpperCase();
      return { city, region: ST_TO_US_STATE[st], regionCode: st, country: 'United States', countryCode: 'US' };
    }
    return { city, region: '', regionCode: '', country: second, countryCode: second === 'United States' || second === 'USA' ? 'US' : '' };
  }

  if (parts.length >= 3) {
    const city = parts[0];
    const regionCandidate = parts[1];
    const countryCandidate = parts[parts.length - 1];

    const regionCode = US_STATE_TO_ST[regionCandidate] || (ST_TO_US_STATE[regionCandidate.toUpperCase()] ? regionCandidate.toUpperCase() : '');
    const isUS = countryCandidate === 'United States' || countryCandidate === 'USA' || countryCandidate === 'US' || !!regionCode;

    return {
      city,
      region: regionCandidate,
      regionCode,
      country: isUS ? 'United States' : countryCandidate,
      countryCode: isUS ? 'US' : '',
    };
  }

  return { city: str, region: '', regionCode: '', country: '', countryCode: '' };
}

/**
 * Formats structured location into display string.
 * Explicit Rule:
 * - U.S. location with known ST: "City, ST" (e.g. New York, NY)
 * - U.S. location without known ST: "City, United States" (never invents state data)
 * - International location: "City, Country" (e.g. Paris, France)
 */
function formatLocation(input) {
  const norm = normalizeLocation(input);
  if (!norm.city) return '';

  const isUS = norm.countryCode === 'US' || norm.country === 'United States' || norm.country === 'USA' || !!norm.regionCode;

  if (isUS) {
    if (norm.regionCode) {
      return `${norm.city}, ${norm.regionCode}`;
    }
    return `${norm.city}, United States`;
  }

  if (norm.country) {
    return `${norm.city}, ${norm.country}`;
  }

  return norm.city;
}

module.exports = {
  US_STATE_TO_ST,
  normalizeLocation,
  formatLocation,
};
