-- PointOut: Screenshot-Feedback. Nur neue, optionale Spalten; bestehende Eintraege bleiben unveraendert.
ALTER TABLE "Feedback" ADD COLUMN "category" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "screenshotPath" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "annotation" JSONB;
ALTER TABLE "Feedback" ADD COLUMN "device" JSONB;
ALTER TABLE "Feedback" ADD COLUMN "metadata" JSONB;
ALTER TABLE "Feedback" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "createdById" TEXT;
