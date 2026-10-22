-- Row level security on the administrator tables, matching the other tables
-- that hold platform data. The API connects as the table owner and is not
-- affected; any other database role, such as the hosting provider's public
-- REST roles, can no longer read or change these rows.
ALTER TABLE "audit_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_settings" ENABLE ROW LEVEL SECURITY;
