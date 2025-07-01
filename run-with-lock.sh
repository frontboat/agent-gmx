#!/bin/bash
export PATH="/home/djizus/.bun/bin:$PATH"

# Lock file path
LOCKFILE="/tmp/agent-gmx.lock"

# Function to cleanup lock file on exit
cleanup() {
    rm -f "$LOCKFILE"
}

# Trap to ensure cleanup on script exit
trap cleanup EXIT INT TERM

# Check if lock file exists and if the process is still running
if [ -f "$LOCKFILE" ]; then
    # Read the PID from the lock file
    OLD_PID=$(cat "$LOCKFILE" 2>/dev/null)
    
    # Check if process with that PID is still running
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Another instance (PID: $OLD_PID) is already running. Exiting."
        exit 1
    else
        echo "Removing stale lock file (PID: $OLD_PID no longer exists)"
        rm -f "$LOCKFILE"
    fi
fi

# Create lock file with current PID
echo $$ > "$LOCKFILE"

# Run the GMX agent script
cd /data/agent-gmx
exec bun run example-gmx.ts