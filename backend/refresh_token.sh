#!/bin/bash
# refresh_token.sh — Fetches a fresh Gemini OAuth token and updates .env
# Run this before starting the server if you see "API key expired" errors

echo "🔄 Fetching fresh Gemini token from gcloud..."

# Get a fresh access token via gcloud
TOKEN=$(gcloud auth print-access-token 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get token. Make sure gcloud is installed and you're logged in:"
    echo "   gcloud auth login"
    echo "   gcloud auth application-default login"
    exit 1
fi

echo "✅ Got fresh token (starts with: ${TOKEN:0:6}...)"

# Update the .env file with the new token
ENV_FILE="$(dirname "$0")/.env"

if [ -f "$ENV_FILE" ]; then
    # Replace the existing GEMINI_API_KEY line
    sed -i '' "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${TOKEN}|" "$ENV_FILE"
    echo "✅ .env updated with fresh token."
else
    echo "❌ .env file not found at: $ENV_FILE"
    exit 1
fi

echo ""
echo "▶️  Now start your server: node server.js"
echo "⏰  Note: This token expires in ~1 hour. Re-run this script if you see expired errors."
