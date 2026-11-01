-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'ACTIVE', 'RESULT', 'DISPUTE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallengeMode" AS ENUM ('COINS', 'CASH');

-- CreateEnum
CREATE TYPE "Vote" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('COINS', 'CASH');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('RESERVE', 'PAYOUT', 'REFUND', 'BONUS_INIT', 'BONUS_WSP', 'STREAK3', 'REFERRAL', 'JUDGE', 'LIFELINE');

-- CreateEnum
CREATE TYPE "CashPaymentStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAID_CLAIMED', 'CONFIRMED', 'DEFAULTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "paymentAlias" TEXT,
    "invitedById" TEXT,
    "coinsAvailable" INTEGER NOT NULL DEFAULT 0,
    "coinsReserved" INTEGER NOT NULL DEFAULT 0,
    "totalPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "cleanClosedCount" INTEGER NOT NULL DEFAULT 0,
    "disputeLostCount" INTEGER NOT NULL DEFAULT 0,
    "credibilityScore" INTEGER NOT NULL DEFAULT 100,
    "streakDaysCount" INTEGER NOT NULL DEFAULT 0,
    "lastCleanChallengeAt" TIMESTAMP(3),
    "lastLifelineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("userAId","userBId")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "opponentId" TEXT,
    "judgeId" TEXT,
    "judgeProposedById" TEXT,
    "judgeApprovedByCreator" BOOLEAN NOT NULL DEFAULT false,
    "judgeApprovedByOpponent" BOOLEAN NOT NULL DEFAULT false,
    "mode" "ChallengeMode" NOT NULL DEFAULT 'COINS',
    "stakeAmount" INTEGER NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstDeclaredAt" TIMESTAMP(3),
    "judgeAssignedAt" TIMESTAMP(3),
    "creatorVote" "Vote",
    "opponentVote" "Vote",
    "winnerId" TEXT,
    "cashPaymentStatus" "CashPaymentStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeEvent" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'COINS',
    "type" "WalletTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_inviteCode_key" ON "Challenge"("inviteCode");

-- CreateIndex
CREATE INDEX "Challenge_status_expiresAt_idx" ON "Challenge"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ChallengeEvent_challengeId_createdAt_idx" ON "ChallengeEvent"("challengeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_judgeProposedById_fkey" FOREIGN KEY ("judgeProposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEvent" ADD CONSTRAINT "ChallengeEvent_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEvent" ADD CONSTRAINT "ChallengeEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
