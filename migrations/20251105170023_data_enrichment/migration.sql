-- AlterTable
ALTER TABLE "ProductCatalog" ADD COLUMN     "cannabinoidProfile" JSONB,
ADD COLUMN     "categoryDefinitionId" INTEGER,
ADD COLUMN     "classificationId" INTEGER,
ADD COLUMN     "distributorId" INTEGER,
ADD COLUMN     "subcategoryId" INTEGER;

-- CreateTable
CREATE TABLE "Classification" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryDefinition" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategoryDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySubcategory" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CategorySubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEnrichment" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "enrichedBy" INTEGER,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Classification_name_key" ON "Classification"("name");

-- CreateIndex
CREATE INDEX "ProductCatalog_classificationId_idx" ON "ProductCatalog"("classificationId");

-- CreateIndex
CREATE INDEX "ProductCatalog_categoryDefinitionId_idx" ON "ProductCatalog"("categoryDefinitionId");

-- CreateIndex
CREATE INDEX "ProductCatalog_subcategoryId_idx" ON "ProductCatalog"("subcategoryId");
