import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

interface Env {
  SYSTEM_NOSTR_PRIVKEY: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const privkeyHex = context.env.SYSTEM_NOSTR_PRIVKEY;
  if (!privkeyHex) {
    return new Response(JSON.stringify({ error: 'not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let pubkey: string;
  try {
    const privkey = hexToBytes(privkeyHex);
    pubkey = getPublicKey(privkey);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_key' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ pubkey }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
