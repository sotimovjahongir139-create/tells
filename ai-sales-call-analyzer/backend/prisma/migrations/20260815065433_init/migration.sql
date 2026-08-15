-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('NOT_ANALYZED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MistakeSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salesperson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amocrmUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salesperson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "amocrmCallId" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "direction" "CallDirection" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "recordingUrl" TEXT,
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'NOT_ANALYZED',
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "needDiscovery" INTEGER NOT NULL,
    "productPresentation" INTEGER NOT NULL,
    "objectionHandling" INTEGER NOT NULL,
    "closing" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "customerNeed" TEXT,
    "customerObjection" TEXT,
    "customerIntent" TEXT,
    "strengths" JSONB NOT NULL,
    "transcript" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallMistake" (
    "id" TEXT NOT NULL,
    "callAnalysisId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "MistakeSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "whyItIsWrong" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "betterPhrase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallMistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "callAnalysisId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "whatToDo" TEXT NOT NULL,
    "betterPhrase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Salesperson_amocrmUserId_key" ON "Salesperson"("amocrmUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_amocrmCallId_key" ON "Call"("amocrmCallId");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "Call_salespersonId_idx" ON "Call"("salespersonId");

-- CreateIndex
CREATE INDEX "Call_analysisStatus_idx" ON "Call"("analysisStatus");

-- CreateIndex
CREATE INDEX "Call_amocrmCallId_idx" ON "Call"("amocrmCallId");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_callId_key" ON "CallAnalysis"("callId");

-- CreateIndex
CREATE INDEX "CallAnalysis_callId_idx" ON "CallAnalysis"("callId");

-- CreateIndex
CREATE INDEX "CallMistake_callAnalysisId_idx" ON "CallMistake"("callAnalysisId");

-- CreateIndex
CREATE INDEX "Recommendation_callAnalysisId_idx" ON "Recommendation"("callAnalysisId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Salesperson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallMistake" ADD CONSTRAINT "CallMistake_callAnalysisId_fkey" FOREIGN KEY ("callAnalysisId") REFERENCES "CallAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_callAnalysisId_fkey" FOREIGN KEY ("callAnalysisId") REFERENCES "CallAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
