-- CreateTable
CREATE TABLE "dismissals" (
    "dismissal_id" BIGSERIAL NOT NULL,
    "coordinator_id" BIGINT NOT NULL,
    "guest_id" BIGINT NOT NULL,
    "dismissed_by" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissals_pkey" PRIMARY KEY ("dismissal_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dismissals_coordinator_id_guest_id_dismissed_by_key" ON "dismissals"("coordinator_id", "guest_id", "dismissed_by");

-- AddForeignKey
ALTER TABLE "dismissals" ADD CONSTRAINT "dismissals_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("coordinator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dismissals" ADD CONSTRAINT "dismissals_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("guest_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase exposes tables in the public schema through its own REST API. With
-- row level security on and no policies, that API can't read or write this
-- table; the backend connects as the table owner, which bypasses RLS.
ALTER TABLE "dismissals" ENABLE ROW LEVEL SECURITY;
