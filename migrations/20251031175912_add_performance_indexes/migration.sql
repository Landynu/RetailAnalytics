-- DropForeignKey
ALTER TABLE "Auth" DROP CONSTRAINT "Auth_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuthIdentity" DROP CONSTRAINT "AuthIdentity_authId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Inventory" DROP CONSTRAINT "Inventory_storeId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_storeId_fkey";

-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_storeId_fkey";

-- DropForeignKey
ALTER TABLE "OrderWorksheet" DROP CONSTRAINT "OrderWorksheet_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderWorksheetItem" DROP CONSTRAINT "OrderWorksheetItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderWorksheetItem" DROP CONSTRAINT "OrderWorksheetItem_worksheetId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_inventoryId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "StockLevel" DROP CONSTRAINT "StockLevel_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockLevel" DROP CONSTRAINT "StockLevel_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "StockLevel" DROP CONSTRAINT "StockLevel_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Store" DROP CONSTRAINT "Store_userId_fkey";

-- DropForeignKey
ALTER TABLE "UnmatchedRecord" DROP CONSTRAINT "UnmatchedRecord_userId_fkey";

-- CreateIndex
CREATE INDEX "InventoryMovement_date_type_idx" ON "InventoryMovement"("date", "type");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_date_idx" ON "InventoryMovement"("storeId", "date");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_date_idx" ON "InventoryMovement"("productId", "date");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_type_date_idx" ON "InventoryMovement"("storeId", "type", "date");

-- CreateIndex
CREATE INDEX "ProductCatalog_parentCategory_idx" ON "ProductCatalog"("parentCategory");

-- CreateIndex
CREATE INDEX "ProductCatalog_brand_idx" ON "ProductCatalog"("brand");

-- CreateIndex
CREATE INDEX "ProductCatalog_status_idx" ON "ProductCatalog"("status");

-- CreateIndex
CREATE INDEX "ProductCatalog_parentCategory_brand_idx" ON "ProductCatalog"("parentCategory", "brand");

-- CreateIndex
CREATE INDEX "StockLevel_storeId_quantity_idx" ON "StockLevel"("storeId", "quantity");

-- CreateIndex
CREATE INDEX "StockLevel_productId_idx" ON "StockLevel"("productId");

-- CreateIndex
CREATE INDEX "Store_userId_isActive_idx" ON "Store"("userId", "isActive");
