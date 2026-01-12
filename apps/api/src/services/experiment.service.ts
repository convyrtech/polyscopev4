/**
 * Experiment Service
 * 
 * Manages A/B testing of strategy configurations.
 * Allows running controlled experiments with different parameters.
 */

import { prisma } from '@whalescope/db';
import { 
    MIN_TRADES_FOR_WINNER, 
    STRONG_WINNER_PROFIT_FACTOR,
    STRONG_WINNER_WINRATE,
    MODERATE_WINNER_PROFIT_FACTOR
} from '../lib/constants';

export interface ExperimentConfig {
    name: string;
    description: string;
    baseStrategyId: string;
    variations: {
        name: string;
        config: Record<string, any>;
    }[];
    durationHours: number;
    targetSignals: number; // Minimum signals per variation before analysis
}

export interface ExperimentResult {
    variationName: string;
    strategyId: string;
    signals: number;
    winRate: number;
    avgPnL: number;
    totalPnL: number;
    profitFactor: number;
}

export class ExperimentService {
    private static instance: ExperimentService;
    
    public static getInstance(): ExperimentService {
        if (!ExperimentService.instance) {
            ExperimentService.instance = new ExperimentService();
        }
        return ExperimentService.instance;
    }

    /**
     * Create an A/B experiment by cloning a strategy with different configs
     */
    async createExperiment(config: ExperimentConfig): Promise<{
        experimentId: string;
        strategies: { name: string; id: string }[];
    }> {
        const baseStrategy = await prisma.strategy.findUnique({
            where: { id: config.baseStrategyId }
        });

        if (!baseStrategy) {
            throw new Error('Base strategy not found');
        }

        const experimentId = `exp_${Date.now()}`;
        const createdStrategies: { name: string; id: string }[] = [];

        // Create variation strategies
        for (const variation of config.variations) {
            const strategyName = `[${experimentId}] ${variation.name}`;
            
            // Merge base config with variation config
            const baseConfig = baseStrategy.config as Record<string, any> || {};
            const mergedConfig = { ...baseConfig, ...variation.config };

            const newStrategy = await prisma.strategy.create({
                data: {
                    name: strategyName,
                    status: 'ACTIVE',
                    config: mergedConfig,
                    initialBudget: baseStrategy.initialBudget,
                    currentBalance: baseStrategy.initialBudget
                }
            });

            createdStrategies.push({ name: variation.name, id: newStrategy.id });
            
            console.log(`🧪 [Experiment] Created variation "${variation.name}" with config:`, variation.config);
        }

        console.log(`🧪 [Experiment] Started experiment "${config.name}" with ${config.variations.length} variations`);

        return { experimentId, strategies: createdStrategies };
    }

    /**
     * Analyze results of an experiment
     * Optimized: Single batch query instead of N+1
     */
    async analyzeExperiment(strategyIds: string[]): Promise<{
        results: ExperimentResult[];
        winner: ExperimentResult | null;
        recommendation: string;
    }> {
        // Batch fetch all strategies
        const strategies = await prisma.strategy.findMany({
            where: { id: { in: strategyIds } }
        });
        
        const strategyMap = new Map(strategies.map(s => [s.id, s]));

        // Single query for all positions across all strategies
        const allPositions = await prisma.$queryRaw<Array<{
            strategyId: string;
            status: string;
            pnl: number | null;
            amountUSD: number;
        }>>`
            SELECT "strategyId", status, pnl, "amountUSD"
            FROM "PaperPosition"
            WHERE "strategyId" = ANY(${strategyIds})
            AND status LIKE 'CLOSED%'
        `;

        // Group positions by strategy
        const positionsByStrategy = new Map<string, typeof allPositions>();
        for (const pos of allPositions) {
            const existing = positionsByStrategy.get(pos.strategyId) || [];
            existing.push(pos);
            positionsByStrategy.set(pos.strategyId, existing);
        }

        // Build results
        const results: ExperimentResult[] = strategyIds.map(strategyId => {
            const strategy = strategyMap.get(strategyId);
            if (!strategy) {
                return null;
            }

            const positions = positionsByStrategy.get(strategyId) || [];
            
            if (positions.length === 0) {
                return {
                    variationName: strategy.name,
                    strategyId,
                    signals: 0,
                    winRate: 0,
                    avgPnL: 0,
                    totalPnL: 0,
                    profitFactor: 0
                };
            }

            const wins = positions.filter(p => (p.pnl || 0) > 0);
            const losses = positions.filter(p => (p.pnl || 0) < 0);
            const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
            const grossWins = wins.reduce((sum, p) => sum + (p.pnl || 0), 0);
            const grossLosses = Math.abs(losses.reduce((sum, p) => sum + (p.pnl || 0), 0));

            return {
                variationName: strategy.name,
                strategyId,
                signals: positions.length,
                winRate: (wins.length / positions.length) * 100,
                avgPnL: totalPnL / positions.length,
                totalPnL,
                profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0
            };
        }).filter((r): r is ExperimentResult => r !== null);

        // Determine winner based on profit factor (balance risk/reward)
        const validResults = results.filter(r => r.signals >= MIN_TRADES_FOR_WINNER);
        
        let winner: ExperimentResult | null = null;
        let recommendation = '';

        if (validResults.length === 0) {
            recommendation = `Insufficient data - need at least ${MIN_TRADES_FOR_WINNER} trades per variation`;
        } else {
            // Sort by profit factor, then by total PnL
            validResults.sort((a, b) => {
                if (Math.abs(a.profitFactor - b.profitFactor) > 0.1) {
                    return b.profitFactor - a.profitFactor;
                }
                return b.totalPnL - a.totalPnL;
            });

            winner = validResults[0];

            if (winner.profitFactor >= STRONG_WINNER_PROFIT_FACTOR && winner.winRate >= STRONG_WINNER_WINRATE) {
                recommendation = `Strong winner: "${winner.variationName}" with ${winner.profitFactor.toFixed(2)}x profit factor`;
            } else if (winner.profitFactor >= MODERATE_WINNER_PROFIT_FACTOR) {
                recommendation = `Moderate winner: "${winner.variationName}" - consider running longer`;
            } else {
                recommendation = 'No clear winner - all variations underperforming';
            }
        }

        return { results, winner, recommendation };
    }

    /**
     * End an experiment - deactivate variation strategies
     */
    async endExperiment(strategyIds: string[], keepWinner: boolean = true): Promise<void> {
        const analysis = await this.analyzeExperiment(strategyIds);
        
        for (const strategyId of strategyIds) {
            const shouldKeep = keepWinner && analysis.winner?.strategyId === strategyId;
            
            if (!shouldKeep) {
                // Close open positions
                await prisma.paperPosition.updateMany({
                    where: { strategyId, status: 'OPEN' },
                    data: { 
                        status: 'CLOSED_EXPERIMENT_END',
                        closedAt: new Date(),
                        exitReason: 'EXPERIMENT_END'
                    }
                });

                // Deactivate strategy
                await prisma.strategy.update({
                    where: { id: strategyId },
                    data: { status: 'ARCHIVED' }
                });
                
                console.log(`🧪 [Experiment] Archived variation ${strategyId}`);
            } else {
                // Rename winner to remove experiment prefix
                const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
                if (strategy) {
                    const cleanName = strategy.name.replace(/\[exp_\d+\]\s*/, '').trim();
                    await prisma.strategy.update({
                        where: { id: strategyId },
                        data: { name: `${cleanName} (Winner)` }
                    });
                    console.log(`🏆 [Experiment] Promoted winner: ${cleanName}`);
                }
            }
        }
    }
}

// Pre-defined experiment templates
export const EXPERIMENT_TEMPLATES = {
    // Test different minimum scores
    MIN_SCORE_TEST: (baseStrategyId: string) => ({
        name: 'Min Score Optimization',
        description: 'Test different AI score thresholds',
        baseStrategyId,
        variations: [
            { name: 'Score 60+', config: { minScore: 60 } },
            { name: 'Score 70+', config: { minScore: 70 } },
            { name: 'Score 80+', config: { minScore: 80 } }
        ],
        durationHours: 72,
        targetSignals: 20
    }),

    // Test different bet sizes
    BET_SIZE_TEST: (baseStrategyId: string) => ({
        name: 'Bet Size Optimization',
        description: 'Test conservative vs aggressive sizing',
        baseStrategyId,
        variations: [
            { name: 'Conservative $50', config: { betSize: 50 } },
            { name: 'Standard $100', config: { betSize: 100 } },
            { name: 'Aggressive $200', config: { betSize: 200 } }
        ],
        durationHours: 72,
        targetSignals: 20
    }),

    // Test TP/SL levels
    EXIT_STRATEGY_TEST: (baseStrategyId: string) => ({
        name: 'Exit Strategy Optimization',
        description: 'Test different take-profit and stop-loss levels',
        baseStrategyId,
        variations: [
            { name: 'Tight (TP 20%, SL 10%)', config: { takeProfit: 0.20, stopLoss: 0.10 } },
            { name: 'Standard (TP 50%, SL 20%)', config: { takeProfit: 0.50, stopLoss: 0.20 } },
            { name: 'Wide (TP 100%, SL 30%)', config: { takeProfit: 1.00, stopLoss: 0.30 } }
        ],
        durationHours: 72,
        targetSignals: 20
    }),

    // Test price entry ranges
    PRICE_FILTER_TEST: (baseStrategyId: string) => ({
        name: 'Price Filter Optimization',
        description: 'Test different entry price ranges',
        baseStrategyId,
        variations: [
            { name: 'Low Odds (0.20-0.40)', config: { minPrice: 0.20, maxPrice: 0.40 } },
            { name: 'Mid Odds (0.40-0.60)', config: { minPrice: 0.40, maxPrice: 0.60 } },
            { name: 'High Odds (0.60-0.80)', config: { minPrice: 0.60, maxPrice: 0.80 } }
        ],
        durationHours: 72,
        targetSignals: 20
    })
};

export const experimentService = ExperimentService.getInstance();
