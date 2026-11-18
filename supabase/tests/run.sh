#!/usr/bin/env bash
# Runs supabase/tests/rls_test.sql against a throwaway local PostgreSQL cluster.
# Needs PostgreSQL installed (apt-get install postgresql). Exits non-zero on any failed assertion.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL is not installed (need initdb)."; exit 2; }
dir="$(mktemp -d /tmp/msi-pgtest.XXXXXX)"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$dir"
cleanup() { as_pg "$PGBIN/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT
as_pg "$PGBIN/initdb" -D "$dir/data" -A trust -U postgres >/dev/null
as_pg "$PGBIN/pg_ctl" -D "$dir/data" -o "-k $dir -c listen_addresses=''" -l "$dir/log" -w start >/dev/null
psql_() { cat "$1" | as_pg "$PGBIN/psql" -h "$dir" -U postgres -d msi_test -v ON_ERROR_STOP=1 -q -f -; }
as_pg "$PGBIN/createdb" -h "$dir" -U postgres msi_test
psql_ "$here/shim.sql"
psql_ "$here/../01_core.sql"
echo "01_core.sql loaded"
psql_ "$here/../01_core.sql"
echo "01_core.sql loaded a second time (idempotent)"
psql_ "$here/../02_storage.sql"
psql_ "$here/../02_storage.sql"
echo "02_storage.sql loaded twice (idempotent)"
psql_ "$here/rls_test.sql" 2>&1 | grep -E "PASS|FAIL|ERROR|ALL PASSED|result|assertions" | sed 's/^psql:[^ ]* //' | tail -n 200
test "${PIPESTATUS[1]}" = 0 || { echo "DATABASE TESTS FAILED"; exit 1; }
