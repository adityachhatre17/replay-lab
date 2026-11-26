# Replay Lab

Replay Lab compares two versions of checkout logic in one Spring Boot service. Each run seeds its own transaction-local PostgreSQL tables and records payments in a local stub table. The tables are dropped at the end of each run. Use a dedicated local database and prepared fixtures.

## Local development

Requires Node.js, Java 21 or later, Maven, and PostgreSQL. Docker Compose can provide the local database.

```sh
docker compose up -d replay-db
REPLAY_DB_PASSWORD=replay-local mvn -f backend/pom.xml spring-boot:run
```

In another terminal, run `npm ci` and `npm run dev`. Open Replay Lab and select **Run checkout comparison**. Vite forwards API requests to Spring Boot on port 8088. For an existing dedicated database, set `REPLAY_DB_URL`, `REPLAY_DB_USER`, and `REPLAY_DB_PASSWORD` as needed.

## Prepared fixtures

The checkout request targets one order. Select **Entire dataset** to load all supplied records, or **Selected order and its account** to load only the linked rows. Use synthetic identifiers and amounts in minor units. An omitted or null order currency represents a legacy record.

```json
{
  "accounts": [{ "id": "account-1", "currency": "INR" }],
  "orders": [{ "id": "order-1", "accountId": "account-1", "amount": 2499, "currency": null }]
}
```

The sample verifies the fix when the original behavior returns 500 with zero payments and the patched behavior returns 200 with exactly one recorded payment. The diagram simulator is also available from Replay Lab.

## Accounts

Create an individual account or an organization account from the welcome page. Organization sign-in uses your email, password, and organization name. This local implementation groups the sign-in identity by organization name and displays it in the workspace. Team membership is managed through invitations. SSO and organization-wide directory sync are outside the local demo. PostgreSQL stores salted password hashes and Spring Boot manages the browser session.

## Replay storage

PostgreSQL stores account identities, completed checkouts, the prepared fixture seeded for each run, and regression bookmarks. The Docker Compose database uses a named volume. Startup creates missing tables and backfills IDs for existing accounts. Back up existing databases before applying schema changes.

Replay history and regression cases are scoped to the signed-in account. Saving the same run twice keeps one regression case. Rerunning a saved case uses the original fixture and appends a new history record. Only import prepared records approved for storage in this database.

The local stack binds to loopback. Before hosting this application, configure HTTPS and secure cookies, put the database on private networking, and establish backup, retention, and operational monitoring policies. The checkout sandbox runs the supported checkout fixture, with no live production connections.

## Organization teams

Sign in with an organization account and open **Teams**. Create a team to become its manager. Generate a one-time invitation for a coworker’s email, then send the code through your usual work channel. The invitee signs up or signs in using that email and the same organization name, then redeems the code under **Join team**. Codes expire after seven days.

The team roster shows members’ display names, email addresses, and roles. Members can share their own recent checkout runs and inspect shared execution traces and outcome counts. Sharing includes the result and order identifier, while the underlying dataset and personal replay history are private to the run owner.

## One-command contest demo

From a clean checkout, install Node.js 20+, Java 21+, Maven, and the PostgreSQL 18 command-line tools (`initdb` and `pg_ctl` on PATH). Run as a regular user:

```sh
bash submission/run-demo.sh
```

The runner installs the locked frontend dependencies, builds both apps, starts a fresh temporary PostgreSQL cluster, and runs the checks through the built frontend's API proxy. It shuts down the demo services when finished. It uses ports 5174, 8089, and 55433 by default, independently of the regular development stack. Override them with `REPLAY_DEMO_WEB_PORT`, `REPLAY_DEMO_API_PORT`, and `REPLAY_DEMO_DB_PORT` if needed.

The browser and smoke test share the [synthetic checkout fixture](submission/fixtures/legacy-checkout.json). The command exits unsuccessfully if the legacy case differs from 500 with zero payments on the original logic or 200 with exactly one payment on the patch. It also checks the saved regression rerun and a modern order that succeeds under both versions.

## Hosted contest demo on Render

The root `Dockerfile` bundles the built React UI in the Spring Boot JAR, so the site and API share one HTTPS origin. The [Render Blueprint](render.yaml) provisions a free Docker web service and a free PostgreSQL database in Singapore. It injects credentials and uses a private database connection with TLS. The database blocks external access.

1. Push the deployment files to your GitHub repository.
2. Sign in to the [Render dashboard](https://dashboard.render.com/) and choose **New → Blueprint**.
3. Connect the GitHub repository, select the branch containing `render.yaml`, and apply the Blueprint. Review the free plans before applying.
4. Once the web service is live, open its HTTPS URL. Create a demo account and run the legacy checkout comparison. Verify 500 with zero payments on the original logic and 200 with one payment on the patch. Save and rerun the case.

Use only synthetic data in the hosted contest demo. Render's [free-plan limits](https://render.com/docs/free) include web service sleep and database expiration.
