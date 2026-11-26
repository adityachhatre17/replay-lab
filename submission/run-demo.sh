#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

maven="${REPLAY_MAVEN:-mvn}"
db_port="${REPLAY_DEMO_DB_PORT:-55433}"
api_port="${REPLAY_DEMO_API_PORT:-8089}"
web_port="${REPLAY_DEMO_WEB_PORT:-5174}"

for command in node npm java "$maven" initdb pg_ctl; do
  if ! command -v "$command" >/dev/null; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

demo_dir="$(mktemp -d "${TMPDIR:-/tmp}/replay-demo.XXXXXX")"
db_started=false
java_pid=
web_pid=

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    for log in "$demo_dir"/*.log; do
      if [ -f "$log" ]; then
        printf '\n%s\n' "$(basename "$log")" >&2
        tail -n 30 "$log" >&2
      fi
    done
  fi
  for pid in "$web_pid" "$java_pid"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if "$db_started"; then
    if ! pg_ctl -D "$demo_dir/db" -m fast -w stop >/dev/null; then
      printf 'Could not stop the demo database at %s\n' "$demo_dir" >&2
      exit 1
    fi
  fi
  rm -rf -- "$demo_dir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm ci --no-audit --no-fund
npm run build
"$maven" -B -f backend/pom.xml package

db_password="$(node -p "require('node:crypto').randomUUID()")"
printf '%s\n' "$db_password" > "$demo_dir/db-password"
initdb -D "$demo_dir/db" -U replay_lab --auth-local=trust --auth-host=scram-sha-256 \
  --pwfile="$demo_dir/db-password" --no-locale -E UTF8 >"$demo_dir/init.log" 2>&1
pg_ctl -D "$demo_dir/db" -l "$demo_dir/postgres.log" \
  -o "-h 127.0.0.1 -p $db_port -k ''" -w start >/dev/null
db_started=true

REPLAY_DB_URL="jdbc:postgresql://127.0.0.1:$db_port/postgres" REPLAY_DB_USER=replay_lab \
  REPLAY_DB_PASSWORD="$db_password" java -jar backend/target/replay-lab-0.1.0.jar \
  --server.port="$api_port" >"$demo_dir/backend.log" 2>&1 &
java_pid=$!
REPLAY_API_URL="http://127.0.0.1:$api_port" node node_modules/vite/bin/vite.js preview \
  --host 127.0.0.1 --port "$web_port" --strictPort >"$demo_dir/frontend.log" 2>&1 &
web_pid=$!

export REPLAY_PREVIEW_URL="http://127.0.0.1:$web_port"
node --input-type=module <<'JS'
const origin = process.env.REPLAY_PREVIEW_URL;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const options = { signal: AbortSignal.timeout(800) };
    const [page, account] = await Promise.all([fetch(origin, options), fetch(origin + '/api/account', options)]);
    if (page.ok && account.status === 401) process.exit(0);
  } catch {
    // The frontend or API may still be starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error('Timed out waiting for the demo frontend and API.');
JS
kill -0 "$web_pid" "$java_pid"
node submission/replay-smoke.mjs
