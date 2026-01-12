-- AlterTable
ALTER TABLE "PaperPosition" ADD COLUMN     "amount_usd" DOUBLE PRECISION,
ADD COLUMN     "entrySlippage" DOUBLE PRECISION,
ADD COLUMN     "entry_slippage_total" DOUBLE PRECISION,
ADD COLUMN     "exitSlippage" DOUBLE PRECISION,
ADD COLUMN     "exitValue" DOUBLE PRECISION,
ADD COLUMN     "gasCost" DOUBLE PRECISION,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "shares" DOUBLE PRECISION,
ADD COLUMN     "tokenId" TEXT;

-- AlterTable
ALTER TABLE "Whale" ADD COLUMN     "fundingAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "fundingSource" TEXT,
ADD COLUMN     "fundingSourceTag" TEXT;

-- CreateIndex
CREATE INDEX "Signal_whaleAddress_idx" ON "Signal"("whaleAddress");

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_whaleAddress_status_idx" ON "Signal"("whaleAddress", "status");

-- CreateIndex
CREATE INDEX "Whale_lastActive_idx" ON "Whale"("lastActive");

-- CreateIndex
CREATE INDEX "Whale_score_idx" ON "Whale"("score");
