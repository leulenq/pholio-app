#!/bin/bash
# Install Casting Call Dependencies
# Run from project root: bash scripts/install-casting-deps.sh

set -e

echo "🚀 Installing Casting Call Frontend Dependencies..."
echo ""

cd client

echo "📦 Installing Firebase..."
npm install firebase

echo "📦 Installing React Dropzone..."
npm install react-dropzone

echo "📦 Installing Chart.js..."
npm install chart.js react-chartjs-2

echo ""
echo "✅ All dependencies installed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Create client/.env.local with Firebase config"
echo "2. Run 'npm run dev' in client directory"
echo "3. Visit http://localhost:5173/casting"
echo ""
echo "📖 See docs/CASTING_CALL_PHASE3_INSTALL.md for Firebase setup instructions"
