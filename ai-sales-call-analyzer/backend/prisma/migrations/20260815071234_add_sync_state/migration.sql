-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lastNoteId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_key_key" ON "SyncState"("key");
