#!/bin/bash

# Script to run database migrations locally against Neon database
# This script sets up environment variables and runs migrations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Running database migrations locally...${NC}"
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo -e "${YELLOW}Loading environment variables from .env file...${NC}"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}No .env file found. Using environment variables...${NC}"
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ DATABASE_URL is not set!${NC}"
    echo ""
    echo "Please set DATABASE_URL environment variable:"
    echo "  export DATABASE_URL='postgresql://user:password@host:5432/dbname?sslmode=require'"
    echo ""
    echo "Or create a .env file with:"
    echo "  DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require"
    echo "  DB_CLIENT=pg"
    exit 1
fi

# Check if DB_CLIENT is set
if [ -z "$DB_CLIENT" ]; then
    echo -e "${YELLOW}DB_CLIENT not set, defaulting to 'pg'...${NC}"
    export DB_CLIENT=pg
fi

# Verify DB_CLIENT is 'pg'
if [ "$DB_CLIENT" != "pg" ]; then
    echo -e "${RED}✗ DB_CLIENT must be 'pg' for PostgreSQL/Neon databases!${NC}"
    echo "  Current value: $DB_CLIENT"
    exit 1
fi

echo -e "${GREEN}✓ Environment variables configured${NC}"
echo -e "  DB_CLIENT: $DB_CLIENT"
echo -e "  DATABASE_URL: ${DATABASE_URL:0:50}... (hidden)"
echo ""

# Check if DATABASE_URL looks like a PostgreSQL connection string
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]] && [[ ! "$DATABASE_URL" =~ ^postgres:// ]]; then
    echo -e "${RED}✗ DATABASE_URL does not look like a PostgreSQL connection string!${NC}"
    echo "  Expected format: postgresql://user:password@host:5432/dbname?sslmode=require"
    echo "  Current value: ${DATABASE_URL:0:50}..."
    exit 1
fi

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
echo ""

if npm run migrate; then
    echo ""
    echo -e "${GREEN}✓ Migrations completed successfully!${NC}"
    echo ""
    
    # Check migration status
    echo -e "${YELLOW}Checking migration status...${NC}"
    npm run migrate:status
else
    echo ""
    echo -e "${RED}✗ Migrations failed!${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. DATABASE_URL is incorrect"
    echo "  2. Database is not accessible"
    echo "  3. SSL is required (add ?sslmode=require)"
    echo "  4. Database credentials are invalid"
    exit 1
fi

