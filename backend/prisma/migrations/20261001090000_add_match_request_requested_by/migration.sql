-- Which side sent the request, so a request from the other side can be
-- accepted. Existing rows stay null and are read as sent by the coordinator.
ALTER TABLE "match_requests" ADD COLUMN "requested_by" VARCHAR;
