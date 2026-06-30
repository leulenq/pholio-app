const crypto = require("crypto");

const PHYLLO_CLIENT_ID = process.env.PHYLLO_CLIENT_ID;
const PHYLLO_CLIENT_SECRET = process.env.PHYLLO_CLIENT_SECRET;
const IS_SANDBOX = !PHYLLO_CLIENT_ID || !PHYLLO_CLIENT_SECRET || PHYLLO_CLIENT_ID === "mock" || PHYLLO_CLIENT_SECRET === "mock";
const PHYLLO_BASE_URL = "https://api.sandbox.getphyllo.com";

// Base64 basic auth helper
function getAuthHeader() {
  const creds = `${PHYLLO_CLIENT_ID}:${PHYLLO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

/**
 * Create a new user in Phyllo
 */
async function createPhylloUser(name, externalId) {
  if (IS_SANDBOX) {
    console.log(`[Phyllo Sandbox] Creating mock user for ${name} (${externalId})`);
    return {
      id: `usr_${crypto.randomBytes(8).toString("hex")}`,
      name,
      external_id: externalId
    };
  }

  try {
    const response = await fetch(`${PHYLLO_BASE_URL}/v1/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader()
      },
      body: JSON.stringify({ name, external_id: externalId })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Phyllo user creation failed with status: ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error("[Phyllo API] createPhylloUser failed:", error);
    throw error;
  }
}

/**
 * Get SDK token for Phyllo user
 */
async function getPhylloSdkToken(phylloUserId) {
  if (IS_SANDBOX) {
    console.log(`[Phyllo Sandbox] Generating mock SDK token for ${phylloUserId}`);
    return {
      value: `mock_sdk_${crypto.randomBytes(16).toString("hex")}`,
      user_id: phylloUserId
    };
  }

  try {
    const response = await fetch(`${PHYLLO_BASE_URL}/v1/sdk-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getAuthHeader()
      },
      body: JSON.stringify({
        user_id: phylloUserId,
        products: ["identity", "engagement"]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Phyllo SDK token generation failed with status: ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error("[Phyllo API] getPhylloSdkToken failed:", error);
    throw error;
  }
}

/**
 * Fetch connected account details from Phyllo
 */
async function fetchPhylloAccount(accountId) {
  if (IS_SANDBOX) {
    console.log(`[Phyllo Sandbox] Fetching details for account: ${accountId}`);
    
    // Determine platform by parsing mock account identifier or randomizing
    let platform = "instagram";
    if (accountId.includes("tiktok")) platform = "tiktok";
    if (accountId.includes("youtube")) platform = "youtube";

    return {
      id: accountId,
      username: `phyllo_${platform}_creator`,
      workplatform: {
        name: platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "YouTube",
        id: platform === "instagram" ? "instagram_platform" : platform === "tiktok" ? "tiktok_platform" : "youtube_platform"
      }
    };
  }

  try {
    const response = await fetch(`${PHYLLO_BASE_URL}/v1/accounts/${accountId}`, {
      headers: {
        "Authorization": getAuthHeader()
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Phyllo fetch account failed with status: ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error("[Phyllo API] fetchPhylloAccount failed:", error);
    throw error;
  }
}

/**
 * Fetch engagement metrics for connected account from Phyllo
 */
async function fetchPhylloEngagement(accountId) {
  if (IS_SANDBOX) {
    const mockFollowers = Math.floor(Math.random() * 240000) + 10000;
    const mockEngagement = parseFloat((Math.random() * 7 + 1.5).toFixed(2));
    
    return {
      follower_count: mockFollowers,
      engagement_rate: mockEngagement
    };
  }

  try {
    // Get profiles for engagement
    const response = await fetch(`${PHYLLO_BASE_URL}/v1/profiles?account_id=${accountId}`, {
      headers: {
        "Authorization": getAuthHeader()
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Phyllo fetch engagement failed with status: ${response.status}`);
    }

    const profile = data.data?.[0];
    if (!profile) {
      // Fallback if profile not fully synced
      return { follower_count: 0, engagement_rate: 0 };
    }

    // Engagement score / view averages
    const followerCount = profile.reputation?.follower_count || 0;
    const engagementRate = profile.reputation?.engagement_rate ? parseFloat((profile.reputation.engagement_rate * 100).toFixed(2)) : 0;

    return {
      follower_count: followerCount,
      engagement_rate: engagementRate
    };
  } catch (error) {
    console.error("[Phyllo API] fetchPhylloEngagement failed:", error);
    throw error;
  }
}

module.exports = {
  IS_SANDBOX,
  createPhylloUser,
  getPhylloSdkToken,
  fetchPhylloAccount,
  fetchPhylloEngagement
};
