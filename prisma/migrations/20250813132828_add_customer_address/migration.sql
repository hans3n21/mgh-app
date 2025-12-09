-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressLine2" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "country" TEXT DEFAULT 'DE';
ALTER TABLE "Customer" ADD COLUMN "postalCode" TEXT;
