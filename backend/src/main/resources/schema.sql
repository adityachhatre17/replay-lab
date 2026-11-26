CREATE TABLE IF NOT EXISTS replay_users (
    email text NOT NULL,
    account_type text NOT NULL,
    organization text NOT NULL,
    display_name text NOT NULL,
    salt text NOT NULL,
    password_hash text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS replay_users_identity
    ON replay_users (email, account_type, lower(organization));

ALTER TABLE replay_users ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS replay_users_id ON replay_users (id);

CREATE TABLE IF NOT EXISTS replay_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES replay_users(id) ON DELETE CASCADE,
    order_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    comparison jsonb NOT NULL,
    fixture jsonb NOT NULL,
    UNIQUE (owner_id, id)
);
CREATE INDEX IF NOT EXISTS replay_runs_owner_history ON replay_runs (owner_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS replay_regressions (
    owner_id uuid NOT NULL,
    run_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, run_id),
    FOREIGN KEY (owner_id, run_id) REFERENCES replay_runs(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS replay_regressions_owner_history ON replay_regressions (owner_id, created_at DESC, run_id DESC);

CREATE TABLE IF NOT EXISTS replay_teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id uuid NOT NULL REFERENCES replay_users(id),
    name text NOT NULL,
    UNIQUE(manager_id, name)
);
CREATE TABLE IF NOT EXISTS replay_team_members (
    team_id uuid NOT NULL REFERENCES replay_teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES replay_users(id) ON DELETE CASCADE,
    PRIMARY KEY(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS replay_team_invites (
    token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES replay_teams(id) ON DELETE CASCADE,
    email text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
    UNIQUE(team_id, email)
);
CREATE TABLE IF NOT EXISTS replay_team_runs (
    team_id uuid NOT NULL REFERENCES replay_teams(id) ON DELETE CASCADE,
    run_id uuid NOT NULL REFERENCES replay_runs(id) ON DELETE CASCADE,
    shared_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(team_id, run_id)
);
CREATE INDEX IF NOT EXISTS replay_team_members_user ON replay_team_members(user_id);
CREATE INDEX IF NOT EXISTS replay_team_runs_recent ON replay_team_runs(team_id, shared_at DESC);
