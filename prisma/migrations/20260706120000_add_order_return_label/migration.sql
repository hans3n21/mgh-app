-- DHL-Retourenlabel: Tracking-Infos fuer das zuletzt erstellte Ruecksende-Label pro Auftrag
ALTER TABLE "Order" ADD COLUMN "returnLabelTrackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "returnLabelCreatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "returnLabelPdfPath" TEXT;
