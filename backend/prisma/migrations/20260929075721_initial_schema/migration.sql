-- CreateTable
CREATE TABLE "availability" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "monday" BOOLEAN DEFAULT false,
    "tuesday" BOOLEAN DEFAULT false,
    "wednesday" BOOLEAN DEFAULT false,
    "thursday" BOOLEAN DEFAULT false,
    "friday" BOOLEAN DEFAULT false,
    "available_from" TIME(6),
    "available_to" TIME(6),
    "frequency" TEXT,
    "notes" VARCHAR,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinators" (
    "coordinator_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "profile_image_id" BIGINT,
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "faculty" VARCHAR,
    "role" VARCHAR,
    "bio" VARCHAR,
    "required_experience" VARCHAR,
    "discipline" VARCHAR,
    "learning_objective" VARCHAR,
    "duration" TEXT,
    "audience" TEXT,
    "format_online" BOOLEAN DEFAULT false,
    "format_inperson" BOOLEAN DEFAULT false,
    "format_prerecorded" BOOLEAN DEFAULT false,
    "focus_lecture" BOOLEAN DEFAULT false,
    "focus_casestudy" BOOLEAN DEFAULT false,
    "focus_workshop" BOOLEAN DEFAULT false,
    "focus_discussion" BOOLEAN DEFAULT false,
    "focus_ama" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" VARCHAR,

    CONSTRAINT "coordinators_pkey" PRIMARY KEY ("coordinator_id")
);

-- CreateTable
CREATE TABLE "user_expertise" (
    "user_id" BIGINT NOT NULL,
    "expertise" VARCHAR NOT NULL,

    CONSTRAINT "user_expertise_pkey" PRIMARY KEY ("user_id","expertise")
);

-- CreateTable
CREATE TABLE "guests" (
    "guest_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "profile_image_id" BIGINT,
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "field" VARCHAR,
    "role" VARCHAR,
    "experience" VARCHAR,
    "bio" VARCHAR,
    "prior_details" VARCHAR,
    "international_details" VARCHAR,
    "linkedIn_profile" VARCHAR,
    "location" VARCHAR,
    "duration" TEXT,
    "audience" TEXT,
    "format_online" BOOLEAN DEFAULT false,
    "format_inperson" BOOLEAN DEFAULT false,
    "format_prerecorded" BOOLEAN DEFAULT false,
    "focus_lecture" BOOLEAN DEFAULT false,
    "focus_casestudy" BOOLEAN DEFAULT false,
    "focus_workshop" BOOLEAN DEFAULT false,
    "focus_discussion" BOOLEAN DEFAULT false,
    "focus_ama" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("guest_id")
);

-- CreateTable
CREATE TABLE "users" (
    "userid" BIGSERIAL NOT NULL,
    "auth0Id" VARCHAR NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "consentstate" BOOLEAN,
    "createdat" TIMESTAMP(6),
    "lastloginat" TIMESTAMP(6),
    "deletedat" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("userid")
);

-- CreateTable
CREATE TABLE "admins" (
    "admin_id" BIGSERIAL NOT NULL,
    "admin_level" VARCHAR NOT NULL,
    "last_login" TIMESTAMP(6),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "units" (
    "unit_code" VARCHAR NOT NULL,
    "unit_name" VARCHAR NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("unit_code")
);

-- CreateTable
CREATE TABLE "match_requests" (
    "match_id" BIGSERIAL NOT NULL,
    "coordinator_id" BIGINT NOT NULL,
    "guest_id" BIGINT NOT NULL,
    "status" VARCHAR,
    "requested_at" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "match_requests_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "message_id" BIGSERIAL NOT NULL,
    "match_id" BIGINT NOT NULL,
    "content" VARCHAR NOT NULL,
    "image_id" BIGINT NOT NULL,
    "sent_at" TIMESTAMP(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "images" (
    "image_id" BIGSERIAL NOT NULL,
    "image_data" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("image_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coordinators_user_id_key" ON "coordinators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_user_id_key" ON "guests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0Id_key" ON "users"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "match_requests_coordinator_id_guest_id_key" ON "match_requests"("coordinator_id", "guest_id");

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinators" ADD CONSTRAINT "cooridnator_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coordinators" ADD CONSTRAINT "coordinators_profile_image_id_fkey" FOREIGN KEY ("profile_image_id") REFERENCES "images"("image_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_expertise" ADD CONSTRAINT "user_expertise_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "Guest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_profile_image_id_fkey" FOREIGN KEY ("profile_image_id") REFERENCES "images"("image_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("coordinator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("guest_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("image_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_requests"("match_id") ON DELETE CASCADE ON UPDATE CASCADE;
