import { PrismaClient } from '@prisma/client';

// Singleton pattern to prevent multiple PrismaClient instances
// CRITICAL: Must work in BOTH development AND production
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// ALWAYS store in global - prevents connection pool exhaustion on module reload
globalForPrisma.prisma = prisma;

// Re-export everything from @prisma/client for backwards compatibility
export * from '@prisma/client';
