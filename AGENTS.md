# Replay Lab

Replay Lab reproduces a checkout failure using a prepared PostgreSQL fixture and compares the original and patched checkout logic. The server runs both logic paths in one Spring Boot service, with a separate transaction and temporary tables for each run. The browser diagram simulator is a separate mode.

## Project layout

- [`src/`](src/) contains the React workspace, checkout comparison, replay history, accounts, and team analytics.
- [`backend/src/main/java/lab/replay/`](backend/src/main/java/lab/replay/) contains the Spring Boot API, checkout sandbox, and persistence.
- [`schema.sql`](backend/src/main/resources/schema.sql) defines the PostgreSQL tables and indexes. Keep startup schema changes compatible with existing local databases.
- [`submission/`](submission/) contains the contest demo runner, smoke test, shared synthetic fixture, and Codex Evidence Pack.

## Build and verify

- Follow [README.md](README.md) for prerequisites and local development setup.
- Run `npm ci` before the first frontend build and `npm run build` after frontend changes.
- Run `mvn -f backend/pom.xml package` after backend changes.
- Run `bash submission/run-demo.sh` to build and verify the demo with an isolated temporary PostgreSQL cluster. With the regular local stack already running on port 5173, use `node submission/replay-smoke.mjs` for just the HTTP checks.
- The legacy order must return **500 and zero payments** with the original logic and **200 and exactly one payment** with the patched logic. Keep the regression rerun and modern-order control passing when changing replay behavior.

## Project guardrails

- Use the [bundled synthetic fixture](submission/fixtures/legacy-checkout.json) for the UI and smoke test. Use only synthetic or prepared demo data in the repository. Keep credentials, customer data, local databases, and generated build outputs out of Git.
- Keep replay execution isolated from live systems. Route payment effects to the local stub and keep the server-side assertions authoritative.
- Enforce run ownership and team membership in the Spring Boot API. Team sharing exposes explicitly shared results. Fixtures and personal replay history stay private to the owner.
- When updating the [Evidence Pack](submission/CODEX-EVIDENCE-PACK.md), record checks actually run and link to their artifacts. Leave unverified model settings or lifecycle labels marked as such.
