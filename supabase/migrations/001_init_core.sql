-- Core Arabic Buzz schema (from Prisma init)
-- Applied first on fresh Supabase/Postgres. Safe on empty public schema.

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('personal', 'shared');
CREATE TYPE "ThreadStatus" AS ENUM ('active', 'archived');
CREATE TYPE "SensitivityLabel" AS ENUM ('public', 'internal', 'private', 'restricted');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'HIGH');
CREATE TYPE "ChannelKind" AS ENUM ('telegram', 'whatsapp');
CREATE TYPE "CronLogStatus" AS ENUM ('running', 'success', 'failed');

CREATE TABLE "scopes" (
    "id" TEXT NOT NULL,
    "type" "ScopeType" NOT NULL,
    "name" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session_threads" (
    "id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'active',
    CONSTRAINT "session_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scope_memories" (
    "id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vector_embedding" TEXT,
    "sensitivity_label" "SensitivityLabel" NOT NULL DEFAULT 'private',
    CONSTRAINT "scope_memories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pending_approvals" (
    "id" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requester_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "tool_output" JSONB,
    "modified_params" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_bindings" (
    "id" TEXT NOT NULL,
    "channel" "ChannelKind" NOT NULL,
    "external_id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "scope_kind" "ScopeType" NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_tasks" (
    "id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "cron_expr" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "notify_channels" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cron_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_name_ar" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "status" "CronLogStatus" NOT NULL,
    "details" TEXT,
    "ran_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cron_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tool_trust_metrics" (
    "id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "total_executions" INTEGER NOT NULL DEFAULT 0,
    "user_approvals" INTEGER NOT NULL DEFAULT 0,
    "user_rejections" INTEGER NOT NULL DEFAULT 0,
    "consecutive_successes" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_executed_at" TIMESTAMP(3),
    CONSTRAINT "tool_trust_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sdaia_audit_logs" (
    "id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "response_hash" TEXT NOT NULL,
    "risk_tier" TEXT NOT NULL,
    "approved_by" TEXT,
    "data_locality" TEXT NOT NULL,
    "watermark_signature" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sdaia_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_bindings_channel_external_id_key" ON "channel_bindings"("channel", "external_id");
CREATE UNIQUE INDEX "tool_trust_metrics_tool_name_scope_id_key" ON "tool_trust_metrics"("tool_name", "scope_id");
CREATE INDEX "cron_logs_ran_at_idx" ON "cron_logs"("ran_at");
CREATE INDEX "sdaia_audit_logs_scope_id_created_at_idx" ON "sdaia_audit_logs"("scope_id", "created_at");

ALTER TABLE "session_threads" ADD CONSTRAINT "session_threads_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "scopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scope_memories" ADD CONSTRAINT "scope_memories_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "scopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
