#!/bin/sh
set -eu

if [ -z "${REPLAY_DB_URL:-}" ]; then
    case "${RENDER_DATABASE_URL:-}" in
        postgresql://*@*/*)
            # Keep credentials in their separate environment variables.
            endpoint="${RENDER_DATABASE_URL##*@}"
            export REPLAY_DB_URL="jdbc:postgresql://${endpoint%%\?*}?sslmode=require"
            ;;
        *)
            printf '%s\n' 'Set REPLAY_DB_URL or provide the Render internal PostgreSQL URL.' >&2
            exit 1
            ;;
    esac
fi

: "${REPLAY_DB_USER:?Set the PostgreSQL user}"
: "${REPLAY_DB_PASSWORD:?Set the PostgreSQL password}"
exec java -jar app.jar "$@"
