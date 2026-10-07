-- CreateTable
CREATE TABLE "InsightDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightDismissal_userId_insightId_key" ON "InsightDismissal"("userId", "insightId");

-- AddForeignKey
ALTER TABLE "InsightDismissal" ADD CONSTRAINT "InsightDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
