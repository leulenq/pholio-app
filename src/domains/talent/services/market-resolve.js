/**
 * Resolve free-text or geolocated cities to the industry market vocabulary.
 * This supports declared profile data and Discover's factual market filter.
 */

const { getIPGeolocation } = require("../../../shared/lib/geolocation");

const CITY_MARKETS = {
  "new york": "new-york",
  brooklyn: "new-york",
  manhattan: "new-york",
  queens: "new-york",
  "jersey city": "new-york",
  hoboken: "new-york",
  "los angeles": "los-angeles",
  "santa monica": "los-angeles",
  "west hollywood": "los-angeles",
  "beverly hills": "los-angeles",
  burbank: "los-angeles",
  "long beach": "los-angeles",
  pasadena: "los-angeles",
  paris: "paris",
  "boulogne-billancourt": "paris",
  milan: "milan",
  milano: "milan",
  london: "london",
  tokyo: "tokyo",
  shibuya: "tokyo",
  miami: "miami",
  "miami beach": "miami",
  chicago: "chicago",
  atlanta: "atlanta",
  dallas: "dallas",
  hamburg: "hamburg",
  berlin: "berlin",
  munich: "munich",
  münchen: "munich",
  barcelona: "barcelona",
  madrid: "madrid",
  sydney: "sydney",
  melbourne: "melbourne",
  "sao paulo": "sao-paulo",
  "são paulo": "sao-paulo",
  "cape town": "cape-town",
  seoul: "seoul",
  shanghai: "shanghai",
  beijing: "beijing",
  "hong kong": "hong-kong",
  singapore: "singapore",
  toronto: "toronto",
  vancouver: "vancouver",
  "mexico city": "mexico-city",
  amsterdam: "amsterdam",
  copenhagen: "copenhagen",
  stockholm: "stockholm",
  warsaw: "warsaw",
  athens: "athens",
  istanbul: "istanbul",
  "tel aviv": "tel-aviv",
  dubai: "dubai",
  mumbai: "mumbai",
  lagos: "lagos",
};

const MARKET_LABELS = {
  "new-york": "New York",
  "los-angeles": "Los Angeles",
  paris: "Paris",
  milan: "Milan",
  london: "London",
  tokyo: "Tokyo",
  miami: "Miami",
  chicago: "Chicago",
  atlanta: "Atlanta",
  dallas: "Dallas",
  hamburg: "Hamburg",
  berlin: "Berlin",
  munich: "Munich",
  barcelona: "Barcelona",
  madrid: "Madrid",
  sydney: "Sydney",
  melbourne: "Melbourne",
  "sao-paulo": "São Paulo",
  "cape-town": "Cape Town",
  seoul: "Seoul",
  shanghai: "Shanghai",
  beijing: "Beijing",
  "hong-kong": "Hong Kong",
  singapore: "Singapore",
  toronto: "Toronto",
  vancouver: "Vancouver",
  "mexico-city": "Mexico City",
  amsterdam: "Amsterdam",
  copenhagen: "Copenhagen",
  stockholm: "Stockholm",
  warsaw: "Warsaw",
  athens: "Athens",
  istanbul: "Istanbul",
  "tel-aviv": "Tel Aviv",
  dubai: "Dubai",
  mumbai: "Mumbai",
  lagos: "Lagos",
};

function marketFromGeo(geo) {
  if (!geo) return null;
  const city = String(geo.city || "").trim().toLowerCase();
  if (city && CITY_MARKETS[city]) return CITY_MARKETS[city];
  const country = String(geo.country || "").trim().toLowerCase();
  return country && /^[a-z]{2}$/.test(country) ? country : null;
}

function marketLabel(slug) {
  if (!slug) return null;
  return MARKET_LABELS[slug] || null;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const ipMarketCache = new Map();

async function resolveMarketFromIp(ipAddress) {
  if (!ipAddress) return null;
  const cached = ipMarketCache.get(ipAddress);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.market;

  const geo = await getIPGeolocation(ipAddress);
  const market = marketFromGeo(geo);

  if (ipMarketCache.size >= CACHE_MAX) {
    const oldest = ipMarketCache.keys().next().value;
    ipMarketCache.delete(oldest);
  }
  ipMarketCache.set(ipAddress, { market, at: Date.now() });
  return market;
}

module.exports = {
  marketFromGeo,
  marketLabel,
  resolveMarketFromIp,
  MARKET_LABELS,
};
