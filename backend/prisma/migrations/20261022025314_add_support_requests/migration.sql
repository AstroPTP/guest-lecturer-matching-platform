-- Requests for further details: an administrator asks a user for more
-- information, and the user answers in the Messages page, optionally with one
-- attached file. New tables only; nothing existing is changed.

-- CreateTable
CREATE TABLE "support_threads" (
    "thread_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'open',
    "opened_by_auth0_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("thread_id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "message_id" BIGSERIAL NOT NULL,
    "thread_id" BIGINT NOT NULL,
    "sender" VARCHAR NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "attachment_id" BIGINT,
    "read_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "attachment_id" BIGSERIAL NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" VARCHAR NOT NULL,
    "filename" VARCHAR NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateIndex
CREATE INDEX "support_threads_user_id_idx" ON "support_threads"("user_id");

-- CreateIndex
CREATE INDEX "support_threads_status_updated_at_idx" ON "support_threads"("status", "updated_at");

-- CreateIndex
CREATE INDEX "support_messages_thread_id_sent_at_idx" ON "support_messages"("thread_id", "sent_at");

-- CreateIndex
CREATE INDEX "support_messages_sent_at_idx" ON "support_messages"("sent_at");

-- CreateIndex
CREATE INDEX "support_messages_attachment_id_idx" ON "support_messages"("attachment_id");

-- AddForeignKey
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "support_threads"("thread_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "support_attachments"("attachment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Values Prisma cannot express. A typo in application code is refused by the
-- database instead of being stored as a status or sender nothing understands.
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_status_check" CHECK ("status" IN ('open', 'closed'));
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_check" CHECK ("sender" IN ('admin', 'user'));

-- Row level security, matching the other tables that hold platform data. The
-- API connects as the table owner and is not affected; any other database
-- role, such as the hosting provider's public REST roles, can read none of
-- these rows, including the attached files.
ALTER TABLE "support_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_attachments" ENABLE ROW LEVEL SECURITY;
