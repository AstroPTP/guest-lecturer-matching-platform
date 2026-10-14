-- Events and notifications were held in server memory and lost on restart.

-- CreateTable
CREATE TABLE "events" (
    "event_id" BIGSERIAL NOT NULL,
    "match_id" BIGINT NOT NULL,
    "coordinator_name" VARCHAR NOT NULL,
    "guest_lecturer_name" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "description" VARCHAR NOT NULL,
    "date" VARCHAR NOT NULL,
    "start_time" VARCHAR NOT NULL,
    "end_time" VARCHAR NOT NULL,
    "location" VARCHAR NOT NULL,
    "format" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'invitation-sent',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "description" VARCHAR NOT NULL,
    "action_label" VARCHAR NOT NULL,
    "href" VARCHAR NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE INDEX "events_match_id_idx" ON "events"("match_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_requests"("match_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase exposes tables in the public schema through its own REST API. With
-- row level security on and no policies, that API can't read or write these
-- tables; the backend connects as the table owner, which bypasses RLS.
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
