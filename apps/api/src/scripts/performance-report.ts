/**
 * WhaleScope Performance Report
 * 
 * Calculates realistic P&L metrics for paper trading portfolio
 * Run: pnpm --filter api ts-node src/scripts/performance-report.ts
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '@whalescope/db';

const prisma = new PrismaClient();

interface DailyStats {
    date: string;
    pnl: number;
    cumulativePnl: number;
    trades: number;
    wins: number;
    losses: number;
}

async function generatePerformanceReport() {
    console.log('\n💰 WhaleScope Performance Report');
    console.log('='.repeat(70));
    console.log(`Generated: ${new Date().toISOString()}\n`);

    // 1. Portfolio Overview - use raw query for new fields
    const positions = await prisma.$queryRaw<Array<{
        id: string;
        strategyId: string;
        marketSlug: string;
        status: string;
        amountUSD: number;
        entryPrice: number;
        exitPrice: number | null;
        exitValue: number | null;
        pnl: number | null;
        totalSlippage: number | null;
        gasCost: number | null;
        openedAt: Date;
        closedAt: Date | null;
    }>>`
        SELECT id, "strategyId", "marketSlug", status, "amountUSD", "entryPrice", 
               "exitPrice", "exitValue", pnl, "totalSlippage", "gasCost", "openedAt", "closedAt"
        FROM "PaperPosition"
        WHERE status IN ('CLOSED_WON', 'CLOSED_LOST', 'CLOSED_TP', 'CLOSED_SL')
    `;

    const openPositions = await prisma.paperPosition.findMany({
        where: { status: 'OPEN' }
    });

    const totalInvested = positions.reduce((sum, p) => sum + (p.amountUSD || 0), 0);
    const totalReturned = positions.reduce((sum, p) => sum + (p.exitValue || 0), 0);
    const totalPnL = totalReturned - totalInvested;
    const totalRoi = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    console.log('📊 Portfolio Overview:');
    console.log(`   Total Closed Positions: ${positions.length}`);
    console.log(`   Open Positions: ${openPositions.length}`);
    console.log(`   Total Invested: $${totalInvested.toFixed(2)}`);
    console.log(`   Total Returned: $${totalReturned.toFixed(2)}`);
    console.log(`   Net P&L: $${totalPnL.toFixed(2)} (${totalPnL >= 0 ? '✅' : '❌'})`);
    console.log(`   Total ROI: ${totalRoi.toFixed(2)}%`);

    if (positions.length < 10) {
        console.log('\n⚠️  Need at least 10 closed positions for detailed analysis.');
        await showOpenPositions(openPositions);
        return;
    }

    // 2. Win/Loss Breakdown
    const wins = positions.filter(p => ['CLOSED_WON', 'CLOSED_TP'].includes(p.status));
    const losses = positions.filter(p => ['CLOSED_LOST', 'CLOSED_SL'].includes(p.status));
    const winRate = (wins.length / positions.length) * 100;

    const avgWin = wins.length > 0 
        ? wins.reduce((sum, p) => sum + ((p.exitValue || 0) - (p.amountUSD || 0)), 0) / wins.length 
        : 0;
    const avgLoss = losses.length > 0 
        ? Math.abs(losses.reduce((sum, p) => sum + ((p.exitValue || 0) - (p.amountUSD || 0)), 0) / losses.length)
        : 0;
    
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    console.log('\n📈 Win/Loss Analysis:');
    console.log(`   Wins: ${wins.length} (${winRate.toFixed(1)}%)`);
    console.log(`   Losses: ${losses.length} (${(100 - winRate).toFixed(1)}%)`);
    console.log(`   Average Win: $${avgWin.toFixed(2)}`);
    console.log(`   Average Loss: $${avgLoss.toFixed(2)}`);
    console.log(`   Profit Factor: ${profitFactor.toFixed(2)}x`);

    // 3. Daily P&L and Drawdown
    console.log('\n📅 Daily Performance:');
    console.log('-'.repeat(60));
    console.log('Date       │  P&L     │ Cumulative │ Trades │ W/L');
    console.log('-'.repeat(60));

    const dailyStats: DailyStats[] = [];
    let cumulative = 0;
    let maxCumulative = 0;
    let maxDrawdown = 0;
    let currentDrawdown = 0;

    // Group by day
    const positionsByDay = new Map<string, typeof positions>();
    for (const pos of positions) {
        const date = pos.closedAt?.toISOString().split('T')[0] || 'unknown';
        if (!positionsByDay.has(date)) positionsByDay.set(date, []);
        positionsByDay.get(date)!.push(pos);
    }

    const sortedDays = Array.from(positionsByDay.keys()).sort();
    
    for (const date of sortedDays) {
        const dayPositions = positionsByDay.get(date)!;
        const dayPnL = dayPositions.reduce((sum, p) => sum + ((p.exitValue || 0) - (p.amountUSD || 0)), 0);
        cumulative += dayPnL;
        
        const dayWins = dayPositions.filter(p => ['CLOSED_WON', 'CLOSED_TP'].includes(p.status)).length;
        const dayLosses = dayPositions.filter(p => ['CLOSED_LOST', 'CLOSED_SL'].includes(p.status)).length;

        // Track drawdown
        if (cumulative > maxCumulative) {
            maxCumulative = cumulative;
        }
        currentDrawdown = maxCumulative - cumulative;
        if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
        }

        const pnlIcon = dayPnL >= 0 ? '✅' : '❌';
        console.log(
            `${date} │ ${pnlIcon}${dayPnL.toFixed(2).padStart(8)} │ ` +
            `${cumulative >= 0 ? '+' : ''}${cumulative.toFixed(2).padStart(9)} │ ` +
            `${dayPositions.length.toString().padStart(6)} │ ${dayWins}/${dayLosses}`
        );

        dailyStats.push({
            date,
            pnl: dayPnL,
            cumulativePnl: cumulative,
            trades: dayPositions.length,
            wins: dayWins,
            losses: dayLosses
        });
    }
    console.log('-'.repeat(60));

    // 4. Risk Metrics
    const dailyReturns = dailyStats.map(d => d.pnl);
    const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(
        dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgDailyReturn * Math.sqrt(365)) / (stdDev * Math.sqrt(365)) : 0;

    console.log('\n📉 Risk Metrics:');
    console.log(`   Max Drawdown: $${maxDrawdown.toFixed(2)}`);
    console.log(`   Max Drawdown %: ${totalInvested > 0 ? ((maxDrawdown / totalInvested) * 100).toFixed(2) : 0}%`);
    console.log(`   Daily Volatility: $${stdDev.toFixed(2)}`);
    console.log(`   Sharpe Ratio: ${sharpeRatio.toFixed(3)} (annualized)`);

    // 5. Exit Type Analysis
    console.log('\n🎯 Exit Type Analysis:');
    const exitTypes = ['CLOSED_WON', 'CLOSED_LOST', 'CLOSED_TP', 'CLOSED_SL'];
    for (const exitType of exitTypes) {
        const typePositions = positions.filter(p => p.status === exitType);
        if (typePositions.length === 0) continue;
        
        const typePnL = typePositions.reduce((sum, p) => sum + ((p.exitValue || 0) - (p.amountUSD || 0)), 0);
        const avgHoldTime = typePositions.reduce((sum, p) => {
            if (!p.closedAt || !p.openedAt) return sum;
            return sum + (p.closedAt.getTime() - p.openedAt.getTime()) / (1000 * 3600);
        }, 0) / typePositions.length;

        console.log(`   ${exitType.padEnd(12)}: ${typePositions.length} positions, P&L: $${typePnL.toFixed(2)}, Avg Hold: ${avgHoldTime.toFixed(1)}h`);
    }

    // 6. Cost Analysis (Phase 1 data)
    console.log('\n💸 Cost Breakdown:');
    const totalSlippage = positions.reduce((sum, p) => sum + (p.totalSlippage || 0), 0);
    const totalGas = positions.reduce((sum, p) => sum + (p.gasCost || 0), 0);
    const totalCosts = totalSlippage + totalGas;
    
    console.log(`   Entry Slippage: $${totalSlippage.toFixed(2)}`);
    console.log(`   Gas Costs: $${totalGas.toFixed(2)}`);
    console.log(`   Total Costs: $${totalCosts.toFixed(2)}`);
    console.log(`   Costs as % of P&L: ${totalPnL !== 0 ? ((totalCosts / Math.abs(totalPnL)) * 100).toFixed(1) : 0}%`);

    // 7. Verdict
    console.log('\n' + '='.repeat(70));
    console.log('📊 PERFORMANCE VERDICT:');
    
    const isProfit = totalPnL > 0;
    const isGoodWinRate = winRate >= 55;
    const isGoodProfitFactor = profitFactor >= 1.5;
    const isLowDrawdown = maxDrawdown < totalInvested * 0.2;
    
    const passCount = [isProfit, isGoodWinRate, isGoodProfitFactor, isLowDrawdown].filter(Boolean).length;
    
    console.log(`   ${isProfit ? '✅' : '❌'} Profitable: ${totalPnL >= 0 ? 'Yes' : 'No'} ($${totalPnL.toFixed(2)})`);
    console.log(`   ${isGoodWinRate ? '✅' : '❌'} Win Rate >= 55%: ${winRate.toFixed(1)}%`);
    console.log(`   ${isGoodProfitFactor ? '✅' : '❌'} Profit Factor >= 1.5x: ${profitFactor.toFixed(2)}x`);
    console.log(`   ${isLowDrawdown ? '✅' : '❌'} Max DD < 20%: ${((maxDrawdown / totalInvested) * 100).toFixed(1)}%`);
    console.log('');
    
    if (passCount === 4) {
        console.log('   🎉 ALL CRITERIA MET - Ready for Phase 2: Micro Live Trading!');
    } else if (passCount >= 2) {
        console.log('   ⚠️  PARTIALLY PASSED - Continue optimization');
        console.log('   → Focus on failed criteria before live trading');
    } else {
        console.log('   ❌ NOT READY - Major issues detected');
        console.log('   → Return to Phase 0.5 for systematic tuning');
    }
    
    console.log('='.repeat(70) + '\n');
}

async function showOpenPositions(positions: any[]) {
    if (positions.length === 0) {
        console.log('\n📋 No open positions.\n');
        return;
    }
    
    console.log('\n📋 Open Positions:');
    console.log('-'.repeat(70));
    
    for (const pos of positions.slice(0, 10)) {
        const holdTime = (Date.now() - pos.entryTime.getTime()) / (1000 * 3600);
        console.log(
            `   ${pos.marketSlug.slice(0, 30)}... │ ` +
            `$${pos.amountUSD.toFixed(0)} │ ` +
            `Entry: ${pos.entryPrice.toFixed(3)} │ ` +
            `Hold: ${holdTime.toFixed(1)}h`
        );
    }
    
    if (positions.length > 10) {
        console.log(`   ... and ${positions.length - 10} more`);
    }
}

// Run
generatePerformanceReport()
    .catch(e => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
