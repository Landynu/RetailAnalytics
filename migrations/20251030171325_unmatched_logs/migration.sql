-- CreateTable
CREATE TABLE "UnmatchedRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "recordType" TEXT NOT NULL,
    "productName" TEXT,
    "barcode" TEXT,
    "sku" TEXT,
    "location" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "retailPrice" DOUBLE PRECISION,
    "wholesaleCost" DOUBLE PRECISION,
    "quantity" INTEGER,
    "date" TIMESTAMP(3),
    "changeQty" INTEGER,
    "employee" TEXT,
    "reason" TEXT NOT NULL,
    "rawData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "UnmatchedRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UnmatchedRecord" ADD CONSTRAINT "UnmatchedRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
