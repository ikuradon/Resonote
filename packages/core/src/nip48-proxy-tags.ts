import type { Event as NostrEvent } from 'nostr-typedef';

export const NIP48_PROXY_TAG = 'proxy';
export const NIP48_SUPPORTED_PROTOCOLS = ['activitypub', 'atproto', 'rss', 'web'] as const;

export type Nip48KnownProxyProtocol = (typeof NIP48_SUPPORTED_PROTOCOLS)[number];
export type Nip48ProxyProtocol = Nip48KnownProxyProtocol | string;

export interface Nip48ProxyTagInput {
  readonly id: string;
  readonly protocol: Nip48ProxyProtocol;
  readonly extra?: readonly string[];
}

export interface Nip48ProxyTag {
  readonly id: string;
  readonly protocol: string;
  readonly knownProtocol: boolean;
  readonly validKnownProtocolId: boolean;
  readonly sourceUrl: string | null;
  readonly extra: readonly string[];
}

type Nip48ProxyTagSource = readonly (readonly string[])[] | Pick<NostrEvent, 'tags'>;

const KNOWN_PROTOCOLS = new Set<string>(NIP48_SUPPORTED_PROTOCOLS);

export function buildNip48ProxyTag(input: Nip48ProxyTagInput): string[] {
  const id = normalizeNonEmpty(input.id, 'proxy id');
  const protocol = normalizeNip48ProxyProtocol(input.protocol);
  if (!isValidNip48KnownProxyId(protocol, id)) {
    throw new Error(`NIP-48 ${protocol} proxy id has invalid format`);
  }
  return [NIP48_PROXY_TAG, id, protocol, ...normalizeExtraValues(input.extra ?? [])];
}

export function appendNip48ProxyTags(
  tags: readonly (readonly string[])[],
  proxyTags: readonly Nip48ProxyTagInput[]
): string[][] {
  if (proxyTags.length === 0) return copyTags(tags);
  return [...copyTags(tags), ...proxyTags.map(buildNip48ProxyTag)];
}

export function parseNip48ProxyTags(tagsOrEvent: Nip48ProxyTagSource): Nip48ProxyTag[] {
  const tags = isNip48EventTagSource(tagsOrEvent) ? tagsOrEvent.tags : tagsOrEvent;
  return tags.flatMap((tag) => {
    const proxy = parseNip48ProxyTag(tag);
    return proxy ? [proxy] : [];
  });
}

export function parseNip48ProxyTag(tag: readonly string[]): Nip48ProxyTag | null {
  if (tag[0] !== NIP48_PROXY_TAG) return null;
  const id = tag[1]?.trim();
  const protocol = tag[2]?.trim().toLowerCase();
  if (!id || !protocol) return null;

  return {
    id,
    protocol,
    knownProtocol: isNip48KnownProxyProtocol(protocol),
    validKnownProtocolId: isValidNip48KnownProxyId(protocol, id),
    sourceUrl: resolveNip48ProxySourceUrl(protocol, id),
    extra: tag
      .slice(3)
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

export function hasNip48ProxyTag(tagsOrEvent: Nip48ProxyTagSource): boolean {
  return parseNip48ProxyTags(tagsOrEvent).length > 0;
}

export function normalizeNip48ProxyProtocol(protocol: string): string {
  return normalizeNonEmpty(protocol, 'proxy protocol').toLowerCase();
}

export function isNip48KnownProxyProtocol(value: string): value is Nip48KnownProxyProtocol {
  return KNOWN_PROTOCOLS.has(value);
}

export function isNip48ProxyTag(tag: readonly string[]): boolean {
  return tag[0] === NIP48_PROXY_TAG;
}

export function isValidNip48KnownProxyId(protocol: string, id: string): boolean {
  const normalizedProtocol = protocol.trim().toLowerCase();
  if (!isNip48KnownProxyProtocol(normalizedProtocol)) return true;
  if (normalizedProtocol === 'atproto') return id.trim().startsWith('at://');
  if (normalizedProtocol === 'rss') return isUrlWithFragment(id);
  return isUrl(id);
}

export function resolveNip48ProxySourceUrl(protocol: string, id: string): string | null {
  const normalizedProtocol = protocol.trim().toLowerCase();
  if (!isValidNip48KnownProxyId(normalizedProtocol, id)) return null;
  return normalizedProtocol === 'activitypub' ||
    normalizedProtocol === 'rss' ||
    normalizedProtocol === 'web'
    ? id.trim()
    : null;
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host);
  } catch {
    return false;
  }
}

function isUrlWithFragment(value: string): boolean {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host && parsed.hash);
  } catch {
    return false;
  }
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-48 ${label} must not be empty`);
  return normalized;
}

function normalizeExtraValues(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function isNip48EventTagSource(source: Nip48ProxyTagSource): source is Pick<NostrEvent, 'tags'> {
  return !Array.isArray(source);
}
