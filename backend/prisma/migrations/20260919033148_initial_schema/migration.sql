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
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "faculty" VARCHAR,
    "role" VARCHAR,
    "bio" VARCHAR,
    "experience" INTEGER,
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
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "field" VARCHAR,
    "role" VARCHAR,
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
    "auth0Id" VARCHAR,
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
    "sent_at" TIMESTAMP(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coordinators_user_id_key" ON "coordinators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_user_id_key" ON "guests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_requests_coordinator_id_guest_id_key" ON "match_requests"("coordinator_id", "guest_id");

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinators" ADD CONSTRAINT "cooridnator_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_expertise" ADD CONSTRAINT "user_expertise_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "Guest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("userid") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("coordinator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_requests" ADD CONSTRAINT "match_requests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("guest_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_requests"("match_id") ON DELETE CASCADE ON UPDATE CASCADE;
