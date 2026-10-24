#!/usr/bin/env bash
# 로컬·CI Postgres에 마이그레이션 전부 적용 + DB 검사. 사용: PGHOST=… PGDATABASE=… bash supabase/tests/rebuild_local.sh [--fresh]
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--fresh" ]; then
  psql -q -d postgres -c "drop database if exists ${PGDATABASE}" -c "create database ${PGDATABASE}" >/dev/null
fi
psql -q -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role anon; create role authenticated; create role service_role; end if; end \$\$;"
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f"; done
for f in tests/step5_check.sql tests/step6_check.sql tests/step7_check.sql tests/step8_check.sql tests/step9_check.sql; do out=$(psql -q -v ON_ERROR_STOP=1 -f "$f" 2>&1) || { echo "$out" | grep -E "ERROR|CONTEXT" | head -5; exit 1; }; echo "$out" | grep -o "step[0-9] OK"; done
