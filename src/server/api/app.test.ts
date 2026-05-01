import { describe, expect, it, vi } from 'vitest';

// Mock Auftakt crypto helpers before importing app
vi.mock('@auftakt/core', async (importOriginal) => ({
  ...(await importOriginal()),
  getPublicKey: vi.fn(() => 'a'.repeat(64)),
  finalizeEvent: vi.fn((template: Record<string, unknown>) => ({
    ...template,
    id: 'mock',
    sig: 'mock',
    pubkey: 'a'.repeat(64)
  }))
}));

const mockCache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn() };
vi.stubGlobal('caches', { default: mockCache });

// Import after mocks
const { app } = await import('./app.js');

const testEnv = {
  SYSTEM_NOSTR_PRIVKEY: 'b'.repeat(64),
  UNSAFE_ALLOW_PRIVATE_IPS: '1'
};

describe('Hono app routing', () => {
  it('should route /api/system/pubkey', async () => {
    const res = await app.request('/api/system/pubkey', undefined, testEnv);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('pubkey');
  });

  it('should return 400 for /api/podcast/resolve without url', async () => {
    const res = await app.request('/api/podcast/resolve', undefined, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/oembed/resolve without params', async () => {
    const res = await app.request('/api/oembed/resolve', undefined, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/youtube/feed without params', async () => {
    const res = await app.request('/api/youtube/feed', undefined, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/podbean/resolve without url', async () => {
    const res = await app.request('/api/podbean/resolve', undefined, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown api routes', async () => {
    const res = await app.request('/api/nonexistent', undefined, testEnv);
    expect(res.status).toBe(404);
  });
});
