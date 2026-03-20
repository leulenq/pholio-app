/**
 * IP Geolocation Helper
 * Fetches geolocation data from IP address using ipapi.co
 */

/**
 * Get geolocation data from IP address
 * @param {string} ipAddress - The IP address to geolocate
 * @returns {Promise<Object|null>} Geolocation data or null if failed
 */
async function getIPGeolocation(ipAddress) {
  if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress === 'localhost') {
    // Skip geolocation for localhost
    return null;
  }

  try {
    // Use ipapi.co free tier (no API key required for basic usage)
    // Alternative: ip-api.com (free, 45 req/min), ipgeolocation.io (requires API key)
    const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Pholio/1.0'
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      console.warn(`[Geolocation] API returned ${response.status} for IP ${ipAddress}`);
      return null;
    }

    const data = await response.json();

    // Check for error response from ipapi.co
    if (data.error || !data.country_code) {
      console.warn(`[Geolocation] Error from API for IP ${ipAddress}:`, data.error || 'No country code');
      return null;
    }

    // Extract relevant fields
    return {
      ip_address: ipAddress,
      country: data.country_code || null, // ISO 3166-1 alpha-2 (e.g., 'US', 'GB')
      region: data.region || data.region_code || null, // State/Province
      city: data.city || null,
      timezone: data.timezone || null, // e.g., 'America/Los_Angeles'
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      country_name: data.country_name || null,
      region_name: data.region || null
    };
  } catch (error) {
    // Silently fail - geolocation is non-critical
    if (error.name === 'AbortError') {
      console.warn(`[Geolocation] Timeout fetching geolocation for IP ${ipAddress}`);
    } else {
      console.warn(`[Geolocation] Error fetching geolocation for IP ${ipAddress}:`, error.message);
    }
    return null;
  }
}

/**
 * Create verified location intel object for cross-referencing
 * @param {Object} geoData - Geolocation data from getIPGeolocation
 * @param {string} userReportedCity - City reported by user during onboarding
 * @returns {Object} Verified location intel object
 */
function createVerifiedLocationIntel(geoData, userReportedCity = null) {
  if (!geoData) {
    return null;
  }

  return {
    ip_verified: {
      country: geoData.country,
      region: geoData.region,
      city: geoData.city,
      timezone: geoData.timezone,
      coordinates: geoData.latitude && geoData.longitude ? {
        lat: geoData.latitude,
        lng: geoData.longitude
      } : null
    },
    user_reported: {
      city: userReportedCity || null
    },
    verification_status: userReportedCity && geoData.city ? {
      city_match: userReportedCity.toLowerCase().trim() === geoData.city.toLowerCase().trim(),
      confidence: 'high' // High confidence if IP geolocation matches user report
    } : {
      confidence: 'medium' // Medium confidence if only IP data available
    },
    captured_at: new Date().toISOString()
  };
}

module.exports = {
  getIPGeolocation,
  createVerifiedLocationIntel
};



