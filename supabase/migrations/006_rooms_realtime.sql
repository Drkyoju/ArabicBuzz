-- Rooms realtime: posts, agents, invites, shared canvas
-- Apply: npm run setup:supabase (or prisma db execute)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS room_agents (
  id text PRIMARY KEY,
  name_ar text NOT NULL,
  slug text NOT NULL UNIQUE,
  system_prompt_ar text NOT NULL DEFAULT '',
  avatar_hue int NOT NULL DEFAULT 170,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_agent_memberships (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id text NOT NULL,
  agent_id text NOT NULL REFERENCES room_agents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, agent_id)
);

CREATE INDEX IF NOT EXISTS room_agent_memberships_scope_idx
  ON room_agent_memberships (scope_id);

CREATE TABLE IF NOT EXISTS room_posts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id text NOT NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('human', 'agent', 'system', 'channel')),
  author_id text NOT NULL,
  author_name_ar text NOT NULL,
  content text NOT NULL DEFAULT '',
  mention_agent_id text,
  channel text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_posts_scope_created_idx
  ON room_posts (scope_id, created_at);

CREATE TABLE IF NOT EXISTS room_invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_id text NOT NULL,
  email text NOT NULL,
  invited_by text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, email)
);

CREATE INDEX IF NOT EXISTS room_invites_email_idx ON room_invites (email);

CREATE TABLE IF NOT EXISTS room_canvas_artifacts (
  id text PRIMARY KEY,
  scope_id text NOT NULL,
  type text NOT NULL DEFAULT 'markdown',
  title_ar text NOT NULL,
  content text NOT NULL DEFAULT '',
  language text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_canvas_scope_idx
  ON room_canvas_artifacts (scope_id, updated_at DESC);

-- Seed named agents (idempotent)
INSERT INTO room_agents (id, name_ar, slug, system_prompt_ar, avatar_hue) VALUES
  (
    'agent-reports',
    'وكيل التقارير',
    'reports',
    'أنت وكيل التقارير في غرفة Arabic Buzz. ركّز على الملخصات التنفيذية بالعربية الفصحى.',
    170
  ),
  (
    'agent-compliance',
    'وكيل الامتثال',
    'compliance',
    'أنت وكيل الامتثال. نبّه للمخاطر والموافقات البشرية قبل أي إجراء حساس.',
    25
  ),
  (
    'agent-cron',
    'وكيل الجدولة',
    'scheduler',
    'أنت وكيل الجدولة. تابع المهام الخلفية وملخصات الـ Cron.',
    210
  ),
  (
    'agent-channels',
    'وكيل القنوات',
    'channels',
    'أنت وكيل القنوات. اربط تيليجرام/واتساب بالغرفة وأبلغ عن حالة الإرسال.',
    280
  ),
  (
    'agent-desk',
    'الوكيل الشخصي',
    'desk',
    'أنت الوكيل الشخصي لمساحة المستخدم. كن موجزاً وعملياً.',
    150
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO room_agent_memberships (id, scope_id, agent_id) VALUES
  ('m-shared-reports', 'shared-demo', 'agent-reports'),
  ('m-shared-compliance', 'shared-demo', 'agent-compliance'),
  ('m-ops-cron', 'shared-ops', 'agent-cron'),
  ('m-ops-channels', 'shared-ops', 'agent-channels'),
  ('m-personal-desk', 'personal-demo', 'agent-desk'),
  ('m-research-desk', 'personal-research', 'agent-desk')
ON CONFLICT (scope_id, agent_id) DO NOTHING;

ALTER TABLE room_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_canvas_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_agent_memberships ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anon/authenticated read for demo team rooms
DROP POLICY IF EXISTS room_posts_read ON room_posts;
CREATE POLICY room_posts_read ON room_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS room_posts_insert ON room_posts;
CREATE POLICY room_posts_insert ON room_posts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS room_canvas_read ON room_canvas_artifacts;
CREATE POLICY room_canvas_read ON room_canvas_artifacts FOR SELECT USING (true);

DROP POLICY IF EXISTS room_canvas_write ON room_canvas_artifacts;
CREATE POLICY room_canvas_write ON room_canvas_artifacts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS room_agents_read ON room_agents;
CREATE POLICY room_agents_read ON room_agents FOR SELECT USING (true);

DROP POLICY IF EXISTS room_memberships_read ON room_agent_memberships;
CREATE POLICY room_memberships_read ON room_agent_memberships FOR SELECT USING (true);

DROP POLICY IF EXISTS room_invites_read ON room_invites;
CREATE POLICY room_invites_read ON room_invites FOR SELECT USING (true);

DROP POLICY IF EXISTS room_invites_write ON room_invites;
CREATE POLICY room_invites_write ON room_invites FOR ALL USING (true) WITH CHECK (true);

-- Realtime (ignore if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE room_posts;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE room_canvas_artifacts;
  EXCEPTION WHEN duplicate_object OR undefined_object THEN
    NULL;
  END;
END $$;
