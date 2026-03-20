#!/bin/bash

# Neon Database Setup Script for ZipSite
# This script helps you set up Neon database connection

set -e

echo "🚀 ZipSite Neon Database Setup"
echo "================================"
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping .env file creation."
        exit 0
    fi
fi

# Get Neon connection string
echo "📝 Please provide your Neon database connection details:"
echo ""
echo "You can find your connection string in the Neon dashboard:"
echo "1. Go to https://console.neon.tech"
echo "2. Select your project"
echo "3. Copy the connection string (it should include ?sslmode=require)"
echo ""

read -p "Enter your Neon DATABASE_URL: " NEON_URL

if [ -z "$NEON_URL" ]; then
    echo "❌ Error: DATABASE_URL cannot be empty"
    exit 1
fi

# Generate session secret
echo ""
echo "🔐 Generating session secret..."
SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Create .env file
echo ""
echo "📝 Creating .env file..."

cat > .env << EOF
# Database Configuration
DB_CLIENT=pg
DATABASE_URL=${NEON_URL}

# Session Secret (auto-generated)
SESSION_SECRET=${SESSION_SECRET}

# Environment
NODE_ENV=development

# Server Configuration
PORT=3000

# Business Logic
COMMISSION_RATE=0.25
MAX_UPLOAD_MB=8

# PDF Generation
PDF_BASE_URL=http://localhost:3000

# File Uploads (optional, defaults to 'uploads' directory or /tmp in serverless)
# UPLOAD_DIR=uploads
EOF

echo "✅ .env file created successfully!"
echo ""

# Ask if user wants to run migrations
read -p "Do you want to run database migrations now? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo "🔄 Running database migrations..."
    npm run migrate
    echo "✅ Migrations completed!"
    echo ""
    
    # Ask if user wants to seed
    read -p "Do you want to seed the database with sample data? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo ""
        echo "🌱 Seeding database..."
        npm run seed
        echo "✅ Seeding completed!"
    fi
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the server: npm start"
echo "2. Or start in development mode: npm run dev"
echo ""
echo "Sample accounts (after seeding):"
echo "- Talent: talent@example.com / password123"
echo "- Agency: agency@example.com / password123"
echo ""

