import { decode } from 'nostr-tools/nip19';

export type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | null;

export function decodeNip19(str: string): DecodedNip19 {
  try {
    const decoded = decode(str);
    switch (decoded.type) {
      case 'npub':
        return { type: 'npub', pubkey: decoded.data };
      case 'nprofile':
        return { type: 'nprofile', pubkey: decoded.data.pubkey, relays: decoded.data.relays ?? [] };
      case 'nevent':
        return {
          type: 'nevent',
          eventId: decoded.data.id,
          relays: decoded.data.relays ?? [],
          author: decoded.data.author,
          kind: decoded.data.kind
        };
      case 'note':
        return { type: 'note', eventId: decoded.data };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
