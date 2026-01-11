import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, fetchWithRetry } from '../lib/retry';

describe('withRetry', () => {
    it('should return result on first success', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        
        const result = await withRetry(fn, 'test');
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, 'test', { maxRetries: 3, baseDelayMs: 10 });
        
        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('network error'));
        
        await expect(
            withRetry(fn, 'test', { maxRetries: 2, baseDelayMs: 10 })
        ).rejects.toThrow('network error');
        
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('validation failed'));
        
        const promise = withRetry(fn, 'test', {
            maxRetries: 3,
            retryOn: (err) => err.message.includes('timeout')
        });
        
        await expect(promise).rejects.toThrow('validation failed');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff and succeed after retries', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce('success');
        
        const result = await withRetry(fn, 'test', { 
            maxRetries: 3, 
            baseDelayMs: 10,
            maxDelayMs: 1000 
        });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
    });
});

describe('fetchWithRetry', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return response on success', async () => {
        const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
        vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

        const response = await fetchWithRetry('https://api.test.com/data', {}, 'test');

        expect(response).toBe(mockResponse);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors', async () => {
        const mock502 = new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
        const mockOk = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
        
        vi.spyOn(global, 'fetch')
            .mockResolvedValueOnce(mock502)
            .mockResolvedValue(mockOk);

        const response = await fetchWithRetry('https://api.test.com/data', {}, 'test', { 
            maxRetries: 2,
            baseDelayMs: 10 
        });
        expect(response.status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});