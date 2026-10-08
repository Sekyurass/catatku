-- CreateEnum
CREATE TYPE "InboundTransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BANK_EMAIL';

-- CreateTable
CREATE TABLE "EmailInbox" (
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "walletId" TEXT,
    "sourceEmail" TEXT,
    "forwardingCode" TEXT,
    "forwardingCodeAt" TIMESTAMP(3),
    "lastReceivedAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailInbox_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "InboundTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "InboundTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "time" CHAR(5),
    "counterparty" TEXT,
    "note" TEXT NOT NULL,
    "accountHint" TEXT,
    "confident" BOOLEAN NOT NULL DEFAULT true,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailInbox_token_key" ON "EmailInbox"("token");

-- CreateIndex
CREATE UNIQUE INDEX "InboundTransaction_transactionId_key" ON "InboundTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "InboundTransaction_userId_status_date_idx" ON "InboundTransaction"("userId", "status", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InboundTransaction_userId_source_reference_key" ON "InboundTransaction"("userId", "source", "reference");

-- AddForeignKey
ALTER TABLE "EmailInbox" ADD CONSTRAINT "EmailInbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundTransaction" ADD CONSTRAINT "InboundTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
