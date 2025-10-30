-- AlterTable
ALTER TABLE "ProductCatalog" ADD COLUMN "margin" REAL;
ALTER TABLE "ProductCatalog" ADD COLUMN "parentCategory" TEXT;
ALTER TABLE "ProductCatalog" ADD COLUMN "retailPrice" REAL;
ALTER TABLE "ProductCatalog" ADD COLUMN "wholesaleCost" REAL;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "friendlyName" TEXT;
ALTER TABLE "Store" ADD COLUMN "reportName" TEXT;
