#!/usr/bin/env bash
# Runs the given command, retrying on failure (transient SEC/House Clerk/OGE
# server errors, timeouts, etc. are real and expected — we've hit several in
# practice). Retries up to 3 times total with a growing delay between
# attempts, then fails the step for real if it never succeeds.
#
# Usage: scripts/with-retry.sh <command> [args...]
set -u

max_attempts=3
delay=15
attempt=1

until "$@"; do
  status=$?
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "with-retry: '$*' failed after $attempt attempts (exit $status). Giving up." >&2
    exit "$status"
  fi
  echo "with-retry: '$*' failed (exit $status) — attempt $attempt/$max_attempts. Retrying in ${delay}s..." >&2
  sleep "$delay"
  attempt=$((attempt + 1))
  delay=$((delay * 2))
done
