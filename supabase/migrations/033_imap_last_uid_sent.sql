-- Track Sent-folder IMAP UID separately from INBOX.
-- Applied automatically via ensureTables() ALTER IF NOT EXISTS.

ALTER TABLE imap_mailboxes
  ADD COLUMN IF NOT EXISTS last_uid_sent BIGINT NOT NULL DEFAULT 0;
