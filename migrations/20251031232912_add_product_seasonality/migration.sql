-- CreateTable
CREATE TABLE "ProductSeasonality" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "yoyGrowth" DOUBLE PRECISION,
    "peakMonth1" INTEGER,
    "peakMonth2" INTEGER,
    "peakMonth3" INTEGER,
    "trend" TEXT NOT NULL,
    "seasonalityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last4WeeksAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last12WeeksAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last52WeeksAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSeasonality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSeasonality_productId_key" ON "ProductSeasonality"("productId");

-- CreateIndex
CREATE INDEX "ProductSeasonality_trend_idx" ON "ProductSeasonality"("trend");

-- CreateIndex
CREATE INDEX "ProductSeasonality_seasonalityScore_idx" ON "ProductSeasonality"("seasonalityScore");
