#!/usr/bin/env bash
# Runs the Call Calibration database tests in a throwaway database.
# Needs a running local Postgres; set PGPORT / PG_BIN if not on the defaults.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="${PG_BIN:-}"; [ -n "$BIN" ] && BIN="$BIN/"
DB="calibration_test_$$"
"${BIN}createdb" -U "${PGUSER:-postgres}" "$DB"
trap '"${BIN}dropdb" -U "${PGUSER:-postgres}" "$DB"' EXIT
"${BIN}psql" -U "${PGUSER:-postgres}" -d "$DB" -X -q -f supabase/tests/calibration_test.sql
