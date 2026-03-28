import { Hono } from 'hono';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

import type { Bindings } from './bindings.js';

export const systemRoute = new Hono<{ Bindings: Bindings }>().get('/pubkey', (c) => {
  const privkeyHex = c.env.SYSTEM_NOSTR_PRIVKEY;
  if (!privkeyHex) {
    return c.json({ error: 'not_configured' }, 503);
  }

  let pubkey: string;
  try {
    const privkey = hexToBytes(privkeyHex);
    pubkey = getPublicKey(privkey);
  } catch {
    return c.json({ error: 'invalid_key' }, 503);
  }

  c.header('Cache-Control', 'public, max-age=86400');
  return c.json({ pubkey }, 200);
});
