-- CreateIndex
-- Serves the open-reports lookup, which matches a report to its decision by
-- action and target_id.
CREATE INDEX "audit_entries_action_target_id_idx" ON "audit_entries"("action", "target_id");
