-- CreateTable
CREATE TABLE "TransactionTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionTemplate_userId_sortOrder_idx" ON "TransactionTemplate"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "TransactionTemplate" ADD CONSTRAINT "TransactionTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTemplate" ADD CONSTRAINT "TransactionTemplate_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTemplate" ADD CONSTRAINT "TransactionTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
