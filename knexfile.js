require('dotenv').config();

function normalizePostgresSslMode(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get('sslmode');
    const useLibpqCompat = parsed.searchParams.get('uselibpqcompat');

    if (
      sslMode &&
      ['prefer', 'require', 'verify-ca'].includes(sslMode) &&
      useLibpqCompat !== 'true'
    ) {
      parsed.searchParams.set('sslmode', 'verify-full');
      return parsed.toString();
    }

    return connectionString;
  } catch (error) {
    return connectionString;
  }
}

const shared = {
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

const sqlite = {
  client: 'sqlite3',
  connection: {
    filename: process.env.DATABASE_URL?.replace('sqlite://', '') || './dev.sqlite3'
  },
  useNullAsDefault: true,
  ...shared
};

const client = (process.env.DB_CLIENT || 'sqlite3').toLowerCase();

// Validate DATABASE_URL when using PostgreSQL
if (client === 'pg') {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is required when DB_CLIENT=pg.\n' +
      'Please set DATABASE_URL in your environment variables.\n' +
      'Example: DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=verify-full\n' +
      'For Neon: Get your connection string from https://console.neon.tech'
    );
  }

  // Clean up DATABASE_URL if it contains common mistakes (psql command, quotes, etc.)
  let cleanedUrl = process.env.DATABASE_URL.trim();
  const originalUrl = cleanedUrl;

  // Try to extract connection string from common command patterns
  // Pattern 1: psql 'postgresql://...' or psql "postgresql://..." (with quotes)
  // This handles: psql 'postgresql://user:pass@host/db?param=value&param2=value2'
  // More robust pattern: match psql, whitespace, then capture everything in quotes
  let match = cleanedUrl.match(/psql\s+['"]([^'"]+)['"]/i);
  if (match && match[1]) {
    // Found something in quotes after psql
    const quotedContent = match[1];
    // Check if the quoted content IS the connection string (starts with postgresql://)
    if (quotedContent.startsWith('postgresql://') || quotedContent.startsWith('postgres://')) {
      cleanedUrl = quotedContent;
    } else {
      // Try to find postgresql:// within the quoted content (handles cases with extra text)
      const urlMatch = quotedContent.match(/(postgres(?:ql)?:\/\/[^'"]+)/);
      if (urlMatch && urlMatch[1]) {
        cleanedUrl = urlMatch[1];
      }
    }
  }

  // If Pattern 1 didn't work, try Pattern 2: psql postgresql://... (without quotes)
  if (!cleanedUrl.startsWith('postgresql://') && !cleanedUrl.startsWith('postgres://')) {
    // Match psql followed by whitespace, then the connection string
    match = cleanedUrl.match(/psql\s+(postgres(?:ql)?:\/\/[^\s'"]+)/i);
    if (match && match[1]) {
      cleanedUrl = match[1];
    } else {
      // Pattern 3: Just quotes around connection string: 'postgresql://...' or "postgresql://..."
      match = cleanedUrl.match(/^['"](postgres(?:ql)?:\/\/[^'"]+)['"]$/);
      if (match && match[1]) {
        cleanedUrl = match[1];
      } else {
        // Pattern 4: Connection string embedded in text with quotes but no psql
        match = cleanedUrl.match(/['"](postgres(?:ql)?:\/\/[^'"]+)['"]/);
        if (match && match[1]) {
          cleanedUrl = match[1];
        } else {
          // Pattern 5: Find postgresql:// or postgres:// anywhere in the string
          // More permissive: match postgresql:// followed by user:pass@host/dbname?params
          // This handles URLs with query parameters and special characters
          match = cleanedUrl.match(/(postgres(?:ql)?:\/\/[^@\s'"]+@[^\s'"]+(?:\?[^\s'"]*)?)/);
          if (match && match[1]) {
            cleanedUrl = match[1];
          }
        }
      }
    }
  }

  // Remove surrounding quotes (single or double) if still present
  cleanedUrl = cleanedUrl.replace(/^['"]+|['"]+$/g, '');

  // Remove any leading/trailing whitespace
  cleanedUrl = cleanedUrl.trim();

  const normalizedUrl = normalizePostgresSslMode(cleanedUrl);
  if (normalizedUrl !== cleanedUrl) {
    console.log('[DATABASE_URL] Updated sslmode to verify-full to preserve secure behavior with current pg parser semantics');
    cleanedUrl = normalizedUrl;
  }

  // Log the cleaning process for debugging (in both development and production for troubleshooting)
  if (cleanedUrl !== originalUrl) {
    console.log('[DATABASE_URL] Cleaned URL from:', originalUrl.substring(0, 80) + (originalUrl.length > 80 ? '...' : ''));
    console.log('[DATABASE_URL] Cleaned URL to:', cleanedUrl.substring(0, 80) + (cleanedUrl.length > 80 ? '...' : ''));
  }

  // Validate that cleaned URL looks like a PostgreSQL connection string
  if (!cleanedUrl.startsWith('postgresql://') && !cleanedUrl.startsWith('postgres://')) {
    throw new Error(
      `Invalid DATABASE_URL format. Expected postgresql:// or postgres://, got: ${process.env.DATABASE_URL.substring(0, 50)}...\n\n` +
      '❌ ERROR: Your DATABASE_URL contains invalid content.\n\n' +
      'Common mistakes:\n' +
      '1. Copied the entire psql command instead of just the connection string\n' +
      '2. Included quotes around the connection string\n' +
      '3. Included extra text or commands\n\n' +
      '✅ SOLUTION:\n' +
      '1. Go to https://console.neon.tech\n' +
      '2. Select your project\n' +
      '3. Click on "Connection Details" or "Connection String"\n' +
      '4. Look for the connection string (starts with postgresql://)\n' +
      '5. Copy ONLY the connection string, NOT the psql command\n' +
      '6. It should look like: postgresql://user:pass@host/dbname?sslmode=verify-full\n' +
      '7. Do NOT include: psql, quotes, or any other text\n\n' +
      `What you provided: ${process.env.DATABASE_URL.substring(0, 80)}...\n\n` +
      'Example of CORRECT format:\n' +
      'postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=verify-full'
    );
  }

  // Extract hostname from connection string for validation
  let hostname = null;
  try {
    const urlMatch = cleanedUrl.match(/@([^/]+)/);
    if (urlMatch && urlMatch[1]) {
      hostname = urlMatch[1].split(':')[0]; // Remove port if present
      console.log('[DATABASE_URL] Extracted hostname:', hostname);
    }
  } catch (error) {
    // If we can't parse the URL, we'll skip hostname validation
    console.error('[DATABASE_URL] Error extracting hostname:', error.message);
  }

  // Check if hostname looks like a valid Neon hostname (should start with ep-)
  const isLikelyNeonHostname = hostname && hostname.startsWith('ep-') && hostname.includes('.neon.tech');
  console.log('[DATABASE_URL] Is valid Neon hostname:', isLikelyNeonHostname, hostname ? `(hostname: ${hostname})` : '(no hostname)');

  // If hostname looks valid (starts with ep- and contains .neon.tech), skip placeholder check
  // This prevents false positives where valid Neon hostnames contain "neon.tech"
  if (!isLikelyNeonHostname) {
    // Detect common placeholder patterns in cleaned DATABASE_URL
    const dbUrl = cleanedUrl.toLowerCase();
    const placeholderPatterns = [
      'host.neon.tech',
      'your-host.neon.tech',
      'example.com',
      'localhost',
      '127.0.0.1',
      'placeholder',
      'your-database',
      'your-host',
      'placeholder.neon.tech',
      'demo.neon.tech'
    ];

    // Check for placeholder patterns, but exclude valid Neon hostnames
    // Only check for 'neon.tech' if hostname doesn't start with 'ep-'
    const containsPlaceholder = placeholderPatterns.some(pattern => dbUrl.includes(pattern)) ||
      (dbUrl.includes('neon.tech') && (!hostname || !hostname.startsWith('ep-')));

    // If it contains .neon.tech but doesn't start with ep-, it's likely a placeholder
    if (hostname && hostname.includes('.neon.tech') && !hostname.startsWith('ep-')) {
      throw new Error(
        'DATABASE_URL contains an invalid Neon hostname format.\n\n' +
        '❌ ERROR: Your Neon hostname should start with "ep-" (e.g., "ep-xxx-xxx.us-east-2.aws.neon.tech").\n\n' +
        '✅ SOLUTION:\n' +
        '1. Go to https://console.neon.tech\n' +
        '2. Select your project\n' +
        '3. Click on "Connection Details" or "Connection String"\n' +
        '4. Copy the COMPLETE connection string (it will have a unique hostname starting with "ep-")\n' +
        '5. Paste the REAL connection string in Netlify environment variables\n' +
        '6. Make sure it includes ?sslmode=verify-full at the end\n' +
        '7. Make sure the hostname starts with "ep-" (this is required for Neon databases)\n\n' +
        `Current hostname: ${hostname}\n\n` +
        'Your real Neon connection string should look like:\n' +
        'postgresql://username:password@ep-xxx-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=verify-full'
      );
    }

    if (containsPlaceholder) {
      const originalUrl = process.env.DATABASE_URL;
      const originalPreview = originalUrl ? originalUrl.substring(0, 80) + (originalUrl.length > 80 ? '...' : '') : 'not set';

      throw new Error(
        'DATABASE_URL contains a placeholder value instead of your actual Neon connection string.\n\n' +
        '❌ ERROR: You used a placeholder like "host.neon.tech" instead of your real database hostname.\n\n' +
        '✅ SOLUTION:\n' +
        '1. Go to https://console.neon.tech\n' +
        '2. Select your project\n' +
        '3. Click on "Connection Details" or "Connection String"\n' +
        '4. Copy the COMPLETE connection string (it will have a unique hostname like "ep-xxx-xxx.us-east-2.aws.neon.tech")\n' +
        '5. Paste the REAL connection string in Netlify environment variables\n' +
        '6. Make sure it includes ?sslmode=verify-full at the end\n' +
        '7. Make sure the hostname starts with "ep-" (this is required for Neon databases)\n\n' +
        `What you provided: ${originalPreview}\n\n` +
        'Your real Neon connection string should look like:\n' +
        'postgresql://username:password@ep-xxx-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=verify-full\n\n' +
        'Common mistakes:\n' +
        '- Using "host.neon.tech" or "your-host.neon.tech" (these are placeholders)\n' +
        '- Using "localhost" or "127.0.0.1" (Neon databases are remote)\n' +
        '- Hostname doesn\'t start with "ep-" (Neon hostnames always start with "ep-")\n' +
        '- Including "psql" command or quotes in DATABASE_URL (copy ONLY the connection string)'
      );
    }
  }

  // Update process.env with cleaned URL so it can be used throughout the application
  process.env.DATABASE_URL = cleanedUrl;
}

const pg = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  },
  // Connection pool configuration for serverless environments
  // This helps handle connection termination issues with pooled connections (e.g., Neon)
  pool: {
    min: 0, // Minimum connections in pool (0 for serverless)
    max: 3, // Maximum connections in pool (small for serverless to avoid connection limits)
    idleTimeoutMillis: 10000, // Close idle connections after 10 seconds
    acquireTimeoutMillis: 60000, // Wait up to 60 seconds to acquire a connection
    createTimeoutMillis: 30000, // Wait up to 30 seconds to create a new connection
    reapIntervalMillis: 1000, // Check for idle connections every second
    createRetryIntervalMillis: 200, // Wait 200ms before retrying connection creation
    // Auto-reconnect on connection errors
    afterCreate: (connection, done) => {
      // Set connection timeout to prevent hanging connections
      connection.on('error', (err) => {
        console.error('[Database] Connection error:', err.message);
      });
      done(null, connection);
    }
  },
  // Increase query timeout for serverless (functions can be slow to cold start)
  acquireConnectionTimeout: 60000,
  ...shared
};

// Check if sqlite3 is requested and available
if (client === 'sqlite3') {
  try {
    require.resolve('sqlite3');
  } catch (err) {
    throw new Error(
      'SQLite3 is not available. This is expected in serverless environments.\n' +
      'Please set DB_CLIENT=pg and provide a DATABASE_URL for PostgreSQL, or install sqlite3 locally for development.\n' +
      'Example: DB_CLIENT=pg DATABASE_URL=postgresql://user:pass@host:5432/dbname'
    );
  }
}

module.exports = client === 'pg' ? pg : sqlite;
