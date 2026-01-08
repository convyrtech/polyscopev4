import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResolutionService } from './resolution.service';
import axios from 'axios';

// Mock Axios
vi.mock('axios');

// Hoisted Mocks
const { mockPrisma } = vi.hoisted(() => {
    const mP = {
        signal: {
            findMany: vi.fn(),
            update: vi.fn(),
            aggregate: vi.fn(),
            count: vi.fn()
        },
        whale: {
            findUnique: vi.fn(),
            update: vi.fn()
        }
    };
    return { mockPrisma: mP };
});

vi.mock('@whalescope/db', () => ({
    PrismaClient: class {
        constructor() {
            return mockPrisma;
        }
    }
}));

describe('ResolutionService', () => {
    let service: ResolutionService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ResolutionService();
    });

    it('should resolve a Multi-Outcome market correctly using Token ID', async () => {
        const marketSlug = 'premier-league-winner-2024';
        const winningTokenId = '123456789';
        const winningOutcome = 'Arsenal';

        // 1. Mock Gamma API Response (Multi-Outcome)
        (axios.get as any).mockResolvedValue({
            data: {
                resolved: true,
                uma_resolution_result: winningTokenId, // The ID of the winner
                tokens: [
                    { token_id: '987654321', outcome: 'Man City', winner: false },
                    { token_id: winningTokenId, outcome: winningOutcome, winner: false } // Winner false in tokens, but ID matches result
                ]
            }
        });

        // 2. Mock DB Signals
        mockPrisma.signal.findMany.mockResolvedValueOnce([
            { marketSlug, status: 'OPEN' } // For distinct list
        ]).mockResolvedValueOnce([       // For findSignals in settle
            { id: 'sig1', outcome: 'Arsenal', price: 0.1, whaleAddress: '0xW1', status: 'OPEN' },
            { id: 'sig2', outcome: 'Man City', price: 0.2, whaleAddress: '0xW2', status: 'OPEN' }
        ]);

        // Mock Whale Stats
        mockPrisma.whale.findUnique.mockResolvedValue({ address: '0xW1' });
        mockPrisma.signal.aggregate.mockResolvedValue({ _count: 10, _sum: { roi: 500 } });
        mockPrisma.signal.count.mockResolvedValue(5);

        // 3. Execution
        await service.resolveSignals();

        // 4. Verification
        // Expect 'Arsenal' signal to WON
        expect(mockPrisma.signal.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sig1' },
                data: expect.objectContaining({ status: 'WON' })
            })
        );

        // Expect 'Man City' signal to LOST
        expect(mockPrisma.signal.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sig2' },
                data: expect.objectContaining({ status: 'LOST' })
            })
        );
    });

    it('should resolve Binary market correctly', async () => {
        const marketSlug = 'will-btc-hit-100k';

        // Mock Gamma API (Binary)
        (axios.get as any).mockResolvedValue({
            data: {
                resolved: true,
                uma_resolution_result: '1.0' // YES
            }
        });

        mockPrisma.signal.findMany
            .mockResolvedValueOnce([{ marketSlug, status: 'OPEN' }])
            .mockResolvedValueOnce([
                { id: 'sig3', outcome: 'Yes', price: 0.5, whaleAddress: '0xW3', status: 'OPEN' }
            ]);

        await service.resolveSignals();

        expect(mockPrisma.signal.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sig3' },
                data: expect.objectContaining({ status: 'WON' })
            })
        );
    });
});
