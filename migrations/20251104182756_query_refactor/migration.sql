-- CreateIndex
CREATE INDEX "InventoryMovement_productId_storeId_type_date_idx" ON "InventoryMovement"("productId", "storeId", "type", "date");

-- CreateIndex
CREATE INDEX "InventoryMovement_storeId_productId_type_date_idx" ON "InventoryMovement"("storeId", "productId", "type", "date");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_type_date_idx" ON "InventoryMovement"("productId", "type", "date");

-- CreateIndex
CREATE INDEX "ProductCatalog_parentCategory_brand_unitCount_unitSize_idx" ON "ProductCatalog"("parentCategory", "brand", "unitCount", "unitSize");

-- CreateIndex
CREATE INDEX "ProductCatalog_parentCategory_subcategory_idx" ON "ProductCatalog"("parentCategory", "subcategory");

-- CreateIndex
CREATE INDEX "ProductCatalog_brand_parentCategory_idx" ON "ProductCatalog"("brand", "parentCategory");

-- CreateIndex
CREATE INDEX "WeeklySalesSummary_productId_storeId_weekStart_idx" ON "WeeklySalesSummary"("productId", "storeId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklySalesSummary_storeId_weekStart_productId_idx" ON "WeeklySalesSummary"("storeId", "weekStart", "productId");
