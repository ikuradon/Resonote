import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('nip05', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    // Reset module to clear in-memory cache between tests
    vi.resetModules();
  });

  it('should return valid: true when pubkey matches', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ names: { alice: pubkey } }), { status: 200 })
    );

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@example.com', pubkey);

    expect(result.valid).toBe(true);
    expect(result.nip05).toBe('alice@example.com');
    expect(typeof result.checkedAt).toBe('number');
  });

  it('should return valid: false when pubkey does not match', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    const otherPubkey = 'cafebabe'.repeat(8);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ names: { alice: otherPubkey } }), { status: 200 })
    );

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@example.com', pubkey);

    expect(result.valid).toBe(false);
    expect(result.nip05).toBe('alice@example.com');
  });

  it('should return valid: false for invalid nip05 format (no @)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('invalidentifier', 'deadbeef'.repeat(8));

    expect(result.valid).toBe(false);
    expect(result.nip05).toBe('invalidentifier');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return valid: null on CORS/network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@example.com', 'deadbeef'.repeat(8));

    expect(result.valid).toBeNull();
    expect(result.nip05).toBe('alice@example.com');
  });

  it('should return cached result on second call without fetching again', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ names: { alice: pubkey } }), { status: 200 })
      );

    const { verifyNip05 } = await import('./nip05.js');

    const result1 = await verifyNip05('alice@example.com', pubkey);
    const result2 = await verifyNip05('alice@example.com', pubkey);

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    // fetch should only be called once due to caching
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should return valid: null when HTTP redirect occurs (redirect: error)', async () => {
    // With redirect: 'error', fetch throws a TypeError on redirect
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch (redirect)'));

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@example.com', 'deadbeef'.repeat(8));

    expect(result.valid).toBeNull();
    expect(result.nip05).toBe('alice@example.com');
  });

  it('should pass redirect: error to fetch', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ names: { alice: pubkey } }), { status: 200 })
      );

    const { verifyNip05 } = await import('./nip05.js');
    await verifyNip05('alice@example.com', pubkey);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/.well-known/nostr.json?name=alice',
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('should return valid: false for @ at start (no local part)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('@example.com', 'deadbeef'.repeat(8));

    expect(result.valid).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return valid: false for @ at end (no domain part)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@', 'deadbeef'.repeat(8));

    expect(result.valid).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return valid: null on non-OK HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

    const { verifyNip05 } = await import('./nip05.js');
    const result = await verifyNip05('alice@example.com', 'deadbeef'.repeat(8));

    expect(result.valid).toBeNull();
  });

  it('should evict oldest entry when cache exceeds MAX_CACHE_SIZE', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ names: { user: pubkey } }), { status: 200 })
    );

    const { verifyNip05 } = await import('./nip05.js');

    // Fill cache to the limit (500 entries)
    for (let i = 0; i < 501; i++) {
      await verifyNip05(`user@domain${i}.com`, pubkey);
    }

    // First entry should have been evicted, so re-fetching it should call fetch again
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ names: { user: pubkey } }), { status: 200 })
      );
    fetchSpy.mockClear();

    await verifyNip05('user@domain0.com', pubkey);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('clearNip05Cache should allow re-fetching after clearing', async () => {
    const pubkey = 'deadbeef'.repeat(8);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ names: { alice: pubkey } }), { status: 200 })
      );

    const { verifyNip05, clearNip05Cache } = await import('./nip05.js');

    await verifyNip05('alice@example.com', pubkey);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    clearNip05Cache();

    await verifyNip05('alice@example.com', pubkey);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
