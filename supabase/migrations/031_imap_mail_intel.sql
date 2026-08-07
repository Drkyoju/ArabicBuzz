-- Mail intelligence: attachments extract + agent draft cache on imap_messages.
-- Applied automatically via ensureTables() ALTER IF NOT EXISTS; this file documents schema.

ALTER TABLE imap_messages
  ADD COLUMN IF NOT EXISTS attachments_json JSONB,
  ADD COLUMN IF NOT EXISTS intel_json JSONB;
