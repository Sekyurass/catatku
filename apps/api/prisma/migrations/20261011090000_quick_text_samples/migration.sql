-- AlterTable
ALTER TABLE "User" ADD COLUMN "shareQuickText" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuickTextSample" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "final" JSONB NOT NULL,
    "corrected" TEXT[],
    "createdOn" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,

    CONSTRAINT "QuickTextSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickTextSample_expiresAt_idx" ON "QuickTextSample"("expiresAt");
