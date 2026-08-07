-- IMAP/SMTP org mailbox — primary path when Google Workspace OAuth is unavailable.
-- Password stored encrypted (app-layer AES-GCM); never returned to clients in plain text.

CREATE TABLE IF NOT EXISTS imap_mailboxes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label_ar TEXT NOT NULL DEFAULT 'بريد الجمعية',
  email_address TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INT NOT NULL DEFAULT 993,
  imap_secure BOOLEAN NOT NULL DEFAULT true,
  smtp_host TEXT NOT NULL,
  smtp_port INT NOT NULL DEFAULT 465,
  smtp_secure BOOLEAN NOT NULL DEFAULT true,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_telegram BOOLEAN NOT NULL DEFAULT true,
  last_uid BIGINT NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  last_error_ar TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS imap_mailboxes_email_uidx
  ON imap_mailboxes (lower(email_address));

CREATE TABLE IF NOT EXISTS imap_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mailbox_id TEXT NOT NULL REFERENCES imap_mailboxes(id) ON DELETE CASCADE,
  uid BIGINT NOT NULL,
  message_id TEXT,
  in_reply_to TEXT,
  references_hdr TEXT,
  folder TEXT NOT NULL DEFAULT 'INBOX',
  subject TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',
  cc_addr TEXT NOT NULL DEFAULT '',
  date_at TIMESTAMPTZ,
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  seen BOOLEAN NOT NULL DEFAULT false,
  answered BOOLEAN NOT NULL DEFAULT false,
  notified BOOLEAN NOT NULL DEFAULT false,
  raw_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, folder, uid)
);

CREATE INDEX IF NOT EXISTS imap_messages_mailbox_date_idx
  ON imap_messages (mailbox_id, date_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS imap_messages_mailbox_seen_idx
  ON imap_messages (mailbox_id, seen);

CREATE INDEX IF NOT EXISTS imap_messages_message_id_idx
  ON imap_messages (message_id)
  WHERE message_id IS NOT NULL AND message_id <> '';

ALTER TABLE imap_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE imap_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imap_mailboxes_all ON imap_mailboxes;
CREATE POLICY imap_mailboxes_all ON imap_mailboxes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS imap_messages_all ON imap_messages;
CREATE POLICY imap_messages_all ON imap_messages FOR ALL USING (true) WITH CHECK (true);
