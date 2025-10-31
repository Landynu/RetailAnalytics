-- CreateTable
CREATE TABLE "WeeklySalesSummary" (
    "id" SERIAL NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "grossSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "refundUnits" INTEGER NOT NULL DEFAULT 0,
    "salesByDayOfWeek" JSONB,
    "salesMorning" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesAfternoon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesEvening" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesNight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitsMorning" INTEGER NOT NULL DEFAULT 0,
    "unitsAfternoon" INTEGER NOT NULL DEFAULT 0,
    "unitsEvening" INTEGER NOT NULL DEFAULT 0,
    "unitsNight" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySalesSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCategorySummary" (
    "id" SERIAL NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "grossSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCategorySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyBrandSummary" (
    "id" SERIAL NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "storeId" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "grossSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refunds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyBrandSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklySalesSummary_weekStart_storeId_idx" ON "WeeklySalesSummary"("weekStart", "storeId");

-- CreateIndex
CREATE INDEX "WeeklySalesSummary_weekStart_productId_idx" ON "WeeklySalesSummary"("weekStart", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySalesSummary_weekStart_storeId_productId_key" ON "WeeklySalesSummary"("weekStart", "storeId", "productId");

-- CreateIndex
CREATE INDEX "WeeklyCategorySummary_weekStart_category_idx" ON "WeeklyCategorySummary"("weekStart", "category");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCategorySummary_weekStart_storeId_category_key" ON "WeeklyCategorySummary"("weekStart", "storeId", "category");

-- CreateIndex
CREATE INDEX "WeeklyBrandSummary_weekStart_brand_idx" ON "WeeklyBrandSummary"("weekStart", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyBrandSummary_weekStart_storeId_brand_key" ON "WeeklyBrandSummary"("weekStart", "storeId", "brand");
