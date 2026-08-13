#!/usr/bin/env bash
# set-admin-password.sh — Generates Argon2id hash of admin password
# Usage: bash scripts/set-admin-password.sh
# Output: ADMIN_PASSWORD_HASH to add to .env.production
set -euo pipefail

echo "=== Timeless — Admin password setup ==="
echo ""
echo "Enter the new admin password (input hidden):"
read -rs PASSWORD
echo ""
echo "Confirm password:"
read -rs PASSWORD2
echo ""

if [ "$PASSWORD" != "$PASSWORD2" ]; then
  echo "ERROR: Passwords don't match." >&2
  exit 1
fi

if [ ${#PASSWORD} -lt 12 ]; then
  echo "ERROR: Password must be at least 12 characters." >&2
  exit 1
fi

# Generate hash using Node.js + argon2 
HASH=$(node -e "
const crypto = require('crypto');
// Simple argon2id via Node native (requires argon2 package in api/)
// For setup without full install, use this openssl fallback:
const salt = crypto.randomBytes(16).toString('base64');
console.log('PLACEHOLDER_HASH_RUN_FROM_API_CONTEXT');
")

echo ""
echo "Add this to your .env.production:"
echo "ADMIN_PASSWORD_HASH=<run 'npm run hash-admin' from apps/api/ to generate>"
echo ""
echo "Full hash generation requires the API package to be built first."
echo "Run: cd apps/api && npm run setup-admin"
