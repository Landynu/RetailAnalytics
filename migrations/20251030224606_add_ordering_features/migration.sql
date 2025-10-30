-- AlterTable
ALTER TABLE "ProductCatalog" ADD COLUMN     "caseSize" INTEGER DEFAULT 12,
ADD COLUMN     "orderingNotes" TEXT,
ADD COLUMN     "reorderPoint" INTEGER,
ADD COLUMN     "salePrice" DOUBLE PRECISION,
ADD COLUMN     "status" TEXT DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "OrderWorksheet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Current Order',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderWorksheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderWorksheetItem" (
    "id" SERIAL NOT NULL,
    "worksheetId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "userQuantity" INTEGER,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderWorksheetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderWorksheetItem_worksheetId_productId_key" ON "OrderWorksheetItem"("worksheetId", "productId");

-- AddForeignKey
ALTER TABLE "OrderWorksheet" ADD CONSTRAINT "OrderWorksheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderWorksheetItem" ADD CONSTRAINT "OrderWorksheetItem_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "OrderWorksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderWorksheetItem" ADD CONSTRAINT "OrderWorksheetItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
