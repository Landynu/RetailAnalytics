-- AlterTable
ALTER TABLE "ProductCatalog" ADD COLUMN     "imageMigratedAt" TIMESTAMP(3),
ADD COLUMN     "imageMigrationStatus" TEXT,
ADD COLUMN     "imageOptimizedSize" INTEGER,
ADD COLUMN     "imageOriginalSize" INTEGER,
ADD COLUMN     "imageStoragePath" TEXT,
ADD COLUMN     "imageThumbnailPath" TEXT;
