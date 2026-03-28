import { Hono } from 'hono';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import { describe, expect, it } from 'vitest';

import { systemRoute } from './system.js';

interface Bindings {
  SYSTEM_NOSTR_PRIVKEY: string;
}

function createApp(): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route('/system', systemRoute);
  return app;
}

function requestPubkey(
  app: Hono<{ Bindings: Bindings }>,
  env: Partial<Bindings> = {}
): Response | Promise<Response> {
  return app.request('/system/pubkey', undefined, env as Bindings);
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

describe('system/pubkey', () => {
  describe('crypto derivation', () => {
    it('should derive correct pubkey from known test vector', () => {
      const privkeyHex = '0000000000000000000000000000000000000000000000000000000000000001';
      const privkey = hexToBytes(privkeyHex);
      const pubkey = getPublicKey(privkey);
      expect(pubkey).toBe('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    });

    it('should return 64-char hex string', () => {
      const privkeyHex = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const privkey = hexToBytes(privkeyHex);
      const pubkey = getPublicKey(privkey);
      expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('GET /system/pubkey', () => {
    it('should return 200 with pubkey JSON for valid private key', async () => {
      const privkeyHex = '0000000000000000000000000000000000000000000000000000000000000001';
      const expectedPubkey = getPublicKey(hexToBytes(privkeyHex));

      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: privkeyHex });

      expect(res.status).toBe(200);
      const body = await parseJsonResponse(res);
      expect(body.pubkey).toBe(expectedPubkey);
    });

    it('should include Content-Type application/json header', async () => {
      const privkeyHex = '0000000000000000000000000000000000000000000000000000000000000001';

      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: privkeyHex });

      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('should include Cache-Control header with max-age=86400', async () => {
      const privkeyHex = '0000000000000000000000000000000000000000000000000000000000000001';

      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: privkeyHex });

      expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    });

    it('should return 503 when SYSTEM_NOSTR_PRIVKEY is missing', async () => {
      const app = createApp();
      const res = await requestPubkey(app, {});

      expect(res.status).toBe(503);
      const body = await parseJsonResponse(res);
      expect(body.error).toBe('not_configured');
    });

    it('should return 503 when SYSTEM_NOSTR_PRIVKEY is empty string', async () => {
      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: '' });

      expect(res.status).toBe(503);
      const body = await parseJsonResponse(res);
      expect(body.error).toBe('not_configured');
    });

    it('should return Content-Type application/json on 503 error', async () => {
      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: '' });

      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('should not include Cache-Control header on 503 error', async () => {
      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: '' });

      expect(res.headers.get('Cache-Control')).toBeNull();
    });

    it('should derive different pubkeys for different private keys', async () => {
      const key1 = '0000000000000000000000000000000000000000000000000000000000000001';
      const key2 = '0000000000000000000000000000000000000000000000000000000000000002';

      const app = createApp();
      const res1 = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: key1 });
      const res2 = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: key2 });

      const body1 = await parseJsonResponse(res1);
      const body2 = await parseJsonResponse(res2);

      expect(body1.pubkey).not.toBe(body2.pubkey);
    });

    it('should return 503 for invalid hex string in SYSTEM_NOSTR_PRIVKEY', async () => {
      const app = createApp();
      const res = await requestPubkey(app, { SYSTEM_NOSTR_PRIVKEY: 'not-valid-hex' });

      expect(res.status).toBe(503);
      const body = await parseJsonResponse(res);
      expect(body.error).toBe('invalid_key');
    });
  });
});
