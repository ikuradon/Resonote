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

  const privkey = hexToBytes(privkeyHex);
  const pubkey = getPublicKey(privkey);

  return new Response(JSON.stringify({ pubkey }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
