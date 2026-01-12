import { Hono } from 'hono';
import { experimentService, EXPERIMENT_TEMPLATES } from '../services/experiment.service';
import { 
    DEFAULT_EXPERIMENT_DURATION_HOURS, 
    DEFAULT_EXPERIMENT_TARGET_SIGNALS 
} from '../lib/constants';

const experiments = new Hono();

// GET /templates - List available experiment templates
experiments.get('/templates', (c) => {
    return c.json({
        templates: [
            {
                id: 'MIN_SCORE_TEST',
                name: 'Min Score Optimization',
                description: 'Test different AI score thresholds (60/70/80)',
                variations: 3
            },
            {
                id: 'BET_SIZE_TEST',
                name: 'Bet Size Optimization',
                description: 'Test conservative vs aggressive sizing ($50/$100/$200)',
                variations: 3
            },
            {
                id: 'EXIT_STRATEGY_TEST',
                name: 'Exit Strategy Optimization',
                description: 'Test different TP/SL levels',
                variations: 3
            },
            {
                id: 'PRICE_FILTER_TEST',
                name: 'Price Filter Optimization',
                description: 'Test different entry price ranges',
                variations: 3
            }
        ]
    });
});

// POST /create - Create a new experiment from template
experiments.post('/create', async (c) => {
    try {
        const body = await c.req.json();
        const { templateId, baseStrategyId } = body;

        if (!templateId || !baseStrategyId) {
            return c.json({ error: 'templateId and baseStrategyId required' }, 400);
        }

        const templateFn = EXPERIMENT_TEMPLATES[templateId as keyof typeof EXPERIMENT_TEMPLATES];
        if (!templateFn) {
            return c.json({ error: 'Unknown template' }, 400);
        }

        const config = templateFn(baseStrategyId);
        const result = await experimentService.createExperiment(config);

        return c.json({
            message: 'Experiment created',
            experimentId: result.experimentId,
            strategies: result.strategies,
            config: {
                name: config.name,
                durationHours: config.durationHours,
                targetSignals: config.targetSignals
            }
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// POST /create-custom - Create a custom experiment
experiments.post('/create-custom', async (c) => {
    try {
        const config = await c.req.json();

        // Validate required fields
        if (!config.name || !config.baseStrategyId || !config.variations) {
            return c.json({ 
                error: 'Required: name, baseStrategyId, variations[]' 
            }, 400);
        }

        if (!Array.isArray(config.variations) || config.variations.length < 2) {
            return c.json({ error: 'Need at least 2 variations' }, 400);
        }

        // Set defaults
        config.durationHours = config.durationHours || DEFAULT_EXPERIMENT_DURATION_HOURS;
        config.targetSignals = config.targetSignals || DEFAULT_EXPERIMENT_TARGET_SIGNALS;
        config.description = config.description || '';

        const result = await experimentService.createExperiment(config);

        return c.json({
            message: 'Custom experiment created',
            experimentId: result.experimentId,
            strategies: result.strategies
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// POST /analyze - Analyze experiment results
experiments.post('/analyze', async (c) => {
    try {
        const body = await c.req.json();
        const { strategyIds } = body;

        if (!strategyIds || !Array.isArray(strategyIds) || strategyIds.length === 0) {
            return c.json({ error: 'strategyIds[] required' }, 400);
        }

        const analysis = await experimentService.analyzeExperiment(strategyIds);

        return c.json({
            results: analysis.results.map(r => ({
                ...r,
                winRate: Number(r.winRate.toFixed(1)),
                avgPnL: Number(r.avgPnL.toFixed(2)),
                totalPnL: Number(r.totalPnL.toFixed(2)),
                profitFactor: Number(r.profitFactor.toFixed(2))
            })),
            winner: analysis.winner ? {
                name: analysis.winner.variationName,
                strategyId: analysis.winner.strategyId,
                profitFactor: Number(analysis.winner.profitFactor.toFixed(2)),
                winRate: Number(analysis.winner.winRate.toFixed(1))
            } : null,
            recommendation: analysis.recommendation
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

// POST /end - End an experiment and archive losers
experiments.post('/end', async (c) => {
    try {
        const body = await c.req.json();
        const { strategyIds, keepWinner = true } = body;

        if (!strategyIds || !Array.isArray(strategyIds)) {
            return c.json({ error: 'strategyIds[] required' }, 400);
        }

        await experimentService.endExperiment(strategyIds, keepWinner);

        return c.json({ 
            message: 'Experiment ended',
            archivedCount: keepWinner ? strategyIds.length - 1 : strategyIds.length
        });
    } catch (e: unknown) {
        return c.json({ error: (e as Error).message }, 500);
    }
});

export { experiments };
