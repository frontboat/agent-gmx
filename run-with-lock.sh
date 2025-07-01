#!/bin/bash

# Lock file path
LOCKFILE="/tmp/agent-gmx.lock"

# Function to cleanup lock file on exit
cleanup() {
    rm -f "$LOCKFILE"
}

# Trap to ensure cleanup on script exit
trap cleanup EXIT

# Check if lock file exists
if [ -f "$LOCKFILE" ]; then
    echo "Another instance is already running. Exiting."
    exit 1
fi

# Create lock file
touch "$LOCKFILE"

# Run the GMX agent script
cd /data/agent-gmx
bun run start