-- Pushed notifications: one row per browser or phone that has agreed to
-- receive them. New table only; nothing existing is changed.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "subscription_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_created_at_idx" ON "push_subscriptions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row level security, matching the other tables that hold platform data. The
-- API connects as the table owner and is not affected; any other database
-- role, such as the hosting provider's public REST roles, can read none of
-- these rows, including the keys a push to a device is encrypted with.
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
