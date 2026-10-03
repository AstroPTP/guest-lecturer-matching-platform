-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "approved_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "audit_entries" (
    "entry_id" BIGSERIAL NOT NULL,
    "actor_user_id" BIGINT,
    "action" VARCHAR NOT NULL,
    "target_type" VARCHAR,
    "target_id" VARCHAR,
    "detail" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "system_name" VARCHAR NOT NULL DEFAULT 'Guest Lecturer Matching Platform',
    "support_email" VARCHAR NOT NULL DEFAULT 'ccae@curtin.edu.au',
    "require_admin_approval" BOOLEAN NOT NULL DEFAULT false,
    "contact_limit_days" INTEGER NOT NULL DEFAULT 90,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" BIGINT,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_entries_occurred_at_idx" ON "audit_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_entries_action_idx" ON "audit_entries"("action");

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("userid") ON DELETE SET NULL ON UPDATE CASCADE;

-- Profiles that already exist were visible before approval existed; keep them visible.
UPDATE "guests" SET "approved_at" = CURRENT_TIMESTAMP WHERE "approved_at" IS NULL;

-- The single settings row, so the first read never has to create it.
INSERT INTO "admin_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
