import pool from './pool';

const SQL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  global_role TEXT NOT NULL DEFAULT 'user' CHECK (global_role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Team memberships
CREATE TABLE IF NOT EXISTS team_members (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member', 'viewer')),
  PRIMARY KEY (user_id, team_id)
);

-- Work items
CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'pending_approval', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  type TEXT NOT NULL DEFAULT 'task'
    CHECK (type IN ('incident', 'task', 'compliance', 'approval', 'investigation')),
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);
CREATE INDEX IF NOT EXISTS idx_work_items_team_id ON work_items(team_id);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned_to ON work_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at DESC);

-- Audit event log (append-only)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_work_item_id ON events(work_item_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_work_item_id ON comments(work_item_id);

-- Idempotency keys (for duplicate request prevention)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup old idempotency keys (keep 24h)
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON idempotency_keys(created_at);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(SQL);
    console.log('✅ Database migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
