#!/bin/bash

# Script to run database migrations on Netlify
# This script calls the /api/migrate endpoint on your deployed Netlify site

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get Netlify site URL from environment or ask user
if [ -z "$NETLIFY_SITE_URL" ]; then
    echo -e "${YELLOW}Enter your Netlify site URL (e.g., https://yoursite.netlify.app):${NC}"
    read -r NETLIFY_SITE_URL
fi

# Remove trailing slash if present
NETLIFY_SITE_URL="${NETLIFY_SITE_URL%/}"

# Get migration secret from environment or ask user
if [ -z "$MIGRATION_SECRET" ]; then
    echo -e "${YELLOW}Enter your migration secret (if set in Netlify environment variables, or press Enter to skip):${NC}"
    read -r MIGRATION_SECRET
fi

# Build the migration URL
MIGRATE_URL="${NETLIFY_SITE_URL}/api/migrate"

if [ -z "$MIGRATION_SECRET" ]; then
    echo -e "${YELLOW}Running migrations without secret (initial setup)...${NC}"
    echo -e "${YELLOW}URL: ${MIGRATE_URL}${NC}"
    echo ""
    
    # Run migration without secret
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MIGRATE_URL}")
else
    echo -e "${YELLOW}Running migrations with secret...${NC}"
    echo -e "${YELLOW}URL: ${MIGRATE_URL}?secret=***${NC}"
    echo ""
    
    # Run migration with secret
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MIGRATE_URL}?secret=${MIGRATION_SECRET}")
fi

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (all but last line)
BODY=$(echo "$RESPONSE" | sed '$d')

# Check response
if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✓ Migrations completed successfully!${NC}"
    echo ""
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    echo ""
    
    # Check migration status
    echo -e "${YELLOW}Checking migration status...${NC}"
    STATUS_URL="${NETLIFY_SITE_URL}/api/migrate/status"
    STATUS_RESPONSE=$(curl -s "${STATUS_URL}")
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
else
    echo -e "${RED}✗ Migration failed with HTTP status: ${HTTP_CODE}${NC}"
    echo ""
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    exit 1
fi

