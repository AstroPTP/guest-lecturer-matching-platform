-- Which side of the match wrote each message, so a thread can show whose
-- message is whose.
ALTER TABLE "messages" ADD COLUMN "sent_by" VARCHAR;

-- A text message has no image. The schema already declares image_id optional,
-- but no migration made the column nullable, so every text-only insert failed.
ALTER TABLE "messages" ALTER COLUMN "image_id" DROP NOT NULL;
