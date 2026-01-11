// ============================================================================
// RETRY UTILITY - Exponential backoff for external API calls
// ============================================================================

import logger from './logger';

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    retryOn: (error: Error) => {
        // Retry on network errors and 5xx responses
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnreset') ||
            message.includes('econnrefused') ||
            message.includes('socket') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504') ||
            message.includes('rate limit') ||
            message.includes('429')
        );
    }
};

/**
 * Execute an async function with exponential backoff retry logic.
 * 
 * @param fn - The async function to execute
 * @param label - Label for logging (e.g., 'fetchGammaData')
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries fail
 * 
 * @example
 * const data = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   'fetchData',
 *   { maxRetries: 3, baseDelayMs: 1000 }
 * );
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            const shouldRetry = opts.retryOn(lastError);
            
            if (!shouldRetry || attempt === opts.maxRetries) {
                logger.error(`[${label}] Failed after ${attempt} attempts: ${lastError.message}`);
                throw lastError;
            }

            // Exponential backoff with jitter
            const delay = Math.min(
                opts.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
                opts.maxDelayMs
            );

            logger.warn(
                `[${label}] Attempt ${attempt}/${opts.maxRetries} failed: ${lastError.message}. ` +
                `Retrying in ${Math.round(delay)}ms...`
            );

            await sleep(delay);
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unknown error in withRetry');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convenience wrapper for API fetch with retry
 */
export async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    label: string = 'fetch',
    retryOptions: RetryOptions = {}
): Promise<Response> {
    return withRetry(
        async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                
                if (!response.ok && response.status >= 500) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } finally {
                clearTimeout(timeout);
            }
        },
        label,
        retryOptions
    );
}
