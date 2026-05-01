import { type Nip21Decoded, parseNip21Uri } from './nip21-uri.js';

const NIP27_URI_RE = /nostr:[A-Za-z0-9]+/g;

export type Nip27ReferenceTagName = 'p' | 'q' | 'a';

export interface Nip27TextReference {
  readonly uri: string;
  readonly identifier: string;
  readonly decoded: Nip21Decoded;
  readonly index: number;
  readonly length: number;
}

export function extractNip27References(content: string): Nip27TextReference[] {
  const references: Nip27TextReference[] = [];
  for (const match of content.matchAll(NIP27_URI_RE)) {
    const uri = match[0];
    const parsed = parseNip21Uri(uri);
    if (!parsed) continue;
    references.push({
      uri,
      identifier: parsed.identifier,
      decoded: parsed.decoded,
      index: match.index ?? 0,
      length: uri.length
    });
  }
  return references;
}

export function buildNip27ReferenceTags(content: string): string[][] {
  const tags: string[][] = [];
  const seen = new Set<string>();
  for (const reference of extractNip27References(content)) {
    const tag = tagForReference(reference.decoded);
    if (!tag) continue;
    const key = `${tag[0]}:${tag[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function tagForReference(decoded: Nip21Decoded): string[] | null {
  switch (decoded.type) {
    case 'npub':
      return ['p', decoded.pubkey];
    case 'nprofile':
      return withOptionalRelay(['p', decoded.pubkey], decoded.relays[0]);
    case 'note':
      return ['q', decoded.eventId];
    case 'nevent':
      return withOptionalRelay(['q', decoded.eventId], decoded.relays[0]);
    case 'naddr':
      return withOptionalRelay(
        ['a', `${decoded.kind}:${decoded.pubkey}:${decoded.identifier}`],
        decoded.relays[0]
      );
    case 'nrelay':
      return null;
  }
}

function withOptionalRelay(tag: string[], relay: string | undefined): string[] {
  return relay ? [...tag, relay] : tag;
}
