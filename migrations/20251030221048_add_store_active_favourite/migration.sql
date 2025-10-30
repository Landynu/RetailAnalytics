-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isFavourite" BOOLEAN NOT NULL DEFAULT false;
