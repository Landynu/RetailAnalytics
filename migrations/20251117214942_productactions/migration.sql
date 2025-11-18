-- CreateTable
CREATE TABLE "ProductAction" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAction_productId_idx" ON "ProductAction"("productId");

-- CreateIndex
CREATE INDEX "ProductAction_userId_idx" ON "ProductAction"("userId");

-- CreateIndex
CREATE INDEX "ProductAction_actionType_idx" ON "ProductAction"("actionType");

-- CreateIndex
CREATE INDEX "ProductAction_status_idx" ON "ProductAction"("status");

-- CreateIndex
CREATE INDEX "ProductAction_productId_status_idx" ON "ProductAction"("productId", "status");
