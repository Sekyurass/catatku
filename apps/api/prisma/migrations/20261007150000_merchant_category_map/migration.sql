-- CreateTable
CREATE TABLE "MerchantCategoryMap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantCategoryMap_userId_updatedAt_idx" ON "MerchantCategoryMap"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCategoryMap_userId_type_key_key" ON "MerchantCategoryMap"("userId", "type", "key");

-- AddForeignKey
ALTER TABLE "MerchantCategoryMap" ADD CONSTRAINT "MerchantCategoryMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCategoryMap" ADD CONSTRAINT "MerchantCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
