import { decodeNip19 } from './crypto.js';
import type { Nip19Decoded } from './vocabulary.js';

export const NIP21_URI_SCHEME = 'nostr:';

export type Nip21Decoded = Exclude<Nip19Decoded, { type: 'nsec' }>;

export interface Nip21Uri {
  readonly scheme: 'nostr';
  readonly identifier: string;
  readonly decoded: Nip21Decoded;
}

export function parseNip21Uri(value: string): Nip21Uri | null {
  const identifier = extractNip21Identifier(value);
  if (!identifier) return null;
  const decoded = decodeNip19(identifier);
  if (!decoded || decoded.type === 'nsec') return null;
  return {
    scheme: 'nostr',
    identifier,
    decoded
  };
}

export function toNip21Uri(identifier: string): string | null {
  if (identifier.includes(':')) {
    const parsed = parseNip21Uri(identifier);
    return parsed ? `${NIP21_URI_SCHEME}${parsed.identifier}` : null;
  }
  const decoded = decodeNip19(identifier);
  if (!decoded || decoded.type === 'nsec') return null;
  return `${NIP21_URI_SCHEME}${identifier}`;
}

export function isNip21Uri(value: string): boolean {
  return parseNip21Uri(value) !== null;
}

export function extractNip21Identifier(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith(NIP21_URI_SCHEME)) return null;
  const identifier = trimmed.slice(NIP21_URI_SCHEME.length);
  if (!identifier || /\s/.test(identifier)) return null;
  return identifier;
}
