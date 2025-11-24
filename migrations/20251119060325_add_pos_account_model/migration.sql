-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "externalStoreId" TEXT,
ADD COLUMN     "posAccountId" INTEGER;

-- CreateTable
CREATE TABLE "POSAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "posType" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "loginUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "POSAccount_userId_idx" ON "POSAccount"("userId");

-- CreateIndex
CREATE INDEX "Store_posAccountId_idx" ON "Store"("posAccountId");
