#!/usr/bin/env sh
# Ensure a git identity is configured before committing.
set -e
name=$(git config user.name || echo "")
email=$(git config user.email || echo "")
if [ -z "$name" ] || [ -z "$email" ]; then
  echo "❌ git identity not set. Run:"
  echo "   git config user.name  \"Your Name\""
  echo "   git config user.email \"you@example.com\""
  exit 1
fi
