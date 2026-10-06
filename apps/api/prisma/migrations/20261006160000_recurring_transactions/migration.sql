-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDING', 'POSTED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "recurringRuleId" TEXT;

-- CreateTable
CREATE TABLE "RecurringRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "nextIndex" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATE,
    "pausedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringOccurrence" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "OccurrenceStatus" NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_recurringRuleId_idx" ON "Transaction"("recurringRuleId");

-- CreateIndex
CREATE INDEX "RecurringRule_userId_idx" ON "RecurringRule"("userId");

-- CreateIndex
CREATE INDEX "RecurringRule_nextRunAt_idx" ON "RecurringRule"("nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_transactionId_key" ON "RecurringOccurrence"("transactionId");

-- CreateIndex
CREATE INDEX "RecurringOccurrence_userId_status_idx" ON "RecurringOccurrence"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringOccurrence_ruleId_date_key" ON "RecurringOccurrence"("ruleId", "date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecurringRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringOccurrence" ADD CONSTRAINT "RecurringOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
