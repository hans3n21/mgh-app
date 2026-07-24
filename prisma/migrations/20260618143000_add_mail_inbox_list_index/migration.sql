CREATE INDEX IF NOT EXISTS "Mail_accountId_folder_isDeleted_date_idx"
ON "Mail" ("accountId", "folder", "isDeleted", "date");
