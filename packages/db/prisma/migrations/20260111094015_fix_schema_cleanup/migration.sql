/*
  Warnings:

  - You are about to drop the column `amount` on the `PaperPosition` table. All the data in the column will be lost.
  - You are about to drop the column `amount_usd` on the `PaperPosition` table. All the data in the column will be lost.
  - You are about to drop the column `entry_slippage_total` on the `PaperPosition` table. All the data in the column will be lost.
  - You are about to drop the column `opened_at` on the `PaperPosition` table. All the data in the column will be lost.
  - Added the required column `amountUSD` to the `PaperPosition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaperPosition" DROP COLUMN "amount",
DROP COLUMN "amount_usd",
DROP COLUMN "entry_slippage_total",
DROP COLUMN "opened_at",
ADD COLUMN     "amountUSD" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalSlippage" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "tokenId" TEXT;
