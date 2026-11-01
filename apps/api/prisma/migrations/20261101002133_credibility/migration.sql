-- CreateEnum
CREATE TYPE "CredibilityEventType" AS ENUM ('CLEAN_AGREEMENT', 'DISPUTE_LOST', 'PAYMENT_DEFAULT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "paymentDefaultCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CredibilityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "type" "CredibilityEventType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredibilityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredibilityEvent_idempotencyKey_key" ON "CredibilityEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CredibilityEvent_userId_createdAt_idx" ON "CredibilityEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CredibilityEvent" ADD CONSTRAINT "CredibilityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredibilityEvent" ADD CONSTRAINT "CredibilityEvent_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
