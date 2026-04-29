import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP89_RECOMMENDATION_KIND = 31989;
export const NIP89_HANDLER_INFORMATION_KIND = 31990;
export const NIP89_CLIENT_TAG = 'client';

export interface Nip89HandlerPointerInput {
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
  readonly platform?: string | null;
}

export interface Nip89HandlerPointer {
  readonly pubkey: string;
  readonly identifier: string;
  readonly address: string;
  readonly relayHint: string | null;
  readonly platform: string | null;
}

export interface BuildNip89RecommendationInput {
  readonly eventKind: number | string;
  readonly handlers: readonly Nip89HandlerPointerInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip89RecommendationSnapshot {
  readonly eventKind: number;
  readonly handlers: readonly Nip89HandlerPointer[];
  readonly content: string;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip89PlatformHandlerInput {
  readonly platform: string;
  readonly urlTemplate: string;
  readonly entityType?: string | null;
}

export interface Nip89PlatformHandler {
  readonly platform: string;
  readonly urlTemplate: string;
  readonly entityType: string | null;
}

export interface BuildNip89HandlerInformationInput {
  readonly identifier: string;
  readonly supportedKinds: readonly (number | string)[];
  readonly handlers: readonly Nip89PlatformHandlerInput[];
  readonly metadata?: Record<string, unknown> | null;
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip89HandlerInformationSnapshot {
  readonly identifier: string;
  readonly supportedKinds: readonly number[];
  readonly handlers: readonly Nip89PlatformHandler[];
  readonly content: string;
  readonly metadata: Record<string, unknown> | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip89ClientTagInput {
  readonly name: string;
  readonly handlerAddress: string;
  readonly relayHint?: string | null;
}

export interface Nip89ClientTag {
  readonly name: string;
  readonly handlerAddress: string;
  readonly relayHint: string | null;
}

const RECOMMENDATION_STRUCTURED_TAGS = new Set(['d', 'a']);
const HANDLER_INFORMATION_STRUCTURED_TAGS = new Set(['d', 'k']);

export function buildNip89RecommendationEvent(
  input: BuildNip89RecommendationInput
): EventParameters {
  if (input.handlers.length === 0) {
    throw new Error('NIP-89 recommendation requires at least one handler');
  }
  return {
    kind: NIP89_RECOMMENDATION_KIND,
    content: input.content ?? '',
    tags: [
      ['d', String(normalizeKind(input.eventKind, 'supported event kind'))],
      ...input.handlers.map(buildNip89HandlerPointerTag),
      ...copyTags(input.tags ?? []).filter((tag) => !RECOMMENDATION_STRUCTURED_TAGS.has(tag[0]))
    ]
  };
}

export function buildNip89HandlerPointerTag(input: Nip89HandlerPointerInput): string[] {
  const address = buildNip89HandlerAddress(input);
  const relayHint = input.relayHint?.trim();
  const platform = input.platform?.trim();
  if (platform) return ['a', address, relayHint || '', platform];
  return relayHint ? ['a', address, relayHint] : ['a', address];
}

export function buildNip89HandlerAddress(input: {
  readonly pubkey: string;
  readonly identifier: string;
}): string {
  return `${NIP89_HANDLER_INFORMATION_KIND}:${normalizeNonEmpty(
    input.pubkey,
    'handler pubkey'
  )}:${normalizeNonEmpty(input.identifier, 'handler identifier')}`;
}

export function buildNip89HandlerInformationEvent(
  input: BuildNip89HandlerInformationInput
): EventParameters {
  if (input.supportedKinds.length === 0) {
    throw new Error('NIP-89 handler information requires at least one supported kind');
  }
  if (input.handlers.length === 0) {
    throw new Error('NIP-89 handler information requires at least one platform handler');
  }
  const content =
    input.content ??
    (input.metadata === undefined || input.metadata === null ? '' : JSON.stringify(input.metadata));
  return {
    kind: NIP89_HANDLER_INFORMATION_KIND,
    content,
    tags: [
      ['d', normalizeNonEmpty(input.identifier, 'handler identifier')],
      ...input.supportedKinds.map((kind) => [
        'k',
        String(normalizeKind(kind, 'supported event kind'))
      ]),
      ...input.handlers.map(buildNip89PlatformHandlerTag),
      ...copyTags(input.tags ?? []).filter(
        (tag) => !HANDLER_INFORMATION_STRUCTURED_TAGS.has(tag[0])
      )
    ]
  };
}

export function buildNip89PlatformHandlerTag(input: Nip89PlatformHandlerInput): string[] {
  const platform = normalizeNonEmpty(input.platform, 'handler platform');
  const urlTemplate = normalizeNonEmpty(input.urlTemplate, 'handler URL template');
  const entityType = input.entityType?.trim();
  return entityType ? [platform, urlTemplate, entityType] : [platform, urlTemplate];
}

export function buildNip89ClientTag(input: Nip89ClientTagInput): string[] {
  const relayHint = input.relayHint?.trim();
  return relayHint
    ? [
        NIP89_CLIENT_TAG,
        normalizeNonEmpty(input.name, 'client name'),
        normalizeNonEmpty(input.handlerAddress, 'client handler address'),
        relayHint
      ]
    : [
        NIP89_CLIENT_TAG,
        normalizeNonEmpty(input.name, 'client name'),
        normalizeNonEmpty(input.handlerAddress, 'client handler address')
      ];
}

export function parseNip89RecommendationEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip89RecommendationSnapshot | null {
  if (event.kind !== NIP89_RECOMMENDATION_KIND) return null;
  const eventKind = parseKind(firstTagValue(event.tags, 'd'));
  if (eventKind === null) return null;
  const handlers = parseNip89HandlerPointerTags(event.tags);
  if (handlers.length === 0) return null;
  return {
    eventKind,
    handlers,
    content: event.content,
    customTags: copyTags(event.tags).filter((tag) => !RECOMMENDATION_STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip89HandlerPointerTags(
  tags: readonly (readonly string[])[]
): Nip89HandlerPointer[] {
  return tags.flatMap((tag) => {
    const pointer = parseNip89HandlerPointerTag(tag);
    return pointer ? [pointer] : [];
  });
}

export function parseNip89HandlerPointerTag(tag: readonly string[]): Nip89HandlerPointer | null {
  if (tag[0] !== 'a') return null;
  const [kind, pubkey, ...identifierParts] = (tag[1] ?? '').trim().split(':');
  const identifier = identifierParts.join(':').trim();
  if (kind !== String(NIP89_HANDLER_INFORMATION_KIND) || !pubkey?.trim() || !identifier) {
    return null;
  }
  return {
    pubkey: pubkey.trim(),
    identifier,
    address: `${NIP89_HANDLER_INFORMATION_KIND}:${pubkey.trim()}:${identifier}`,
    relayHint: tag[2]?.trim() || null,
    platform: tag[3]?.trim() || null
  };
}

export function parseNip89HandlerInformationEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip89HandlerInformationSnapshot | null {
  if (event.kind !== NIP89_HANDLER_INFORMATION_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  if (!identifier) return null;
  const supportedKinds = parseTagValues(event.tags, 'k').flatMap((value) => {
    const kind = parseKind(value);
    return kind === null ? [] : [kind];
  });
  if (supportedKinds.length === 0) return null;
  const handlers = parseNip89PlatformHandlerTags(event.tags);
  if (handlers.length === 0) return null;
  return {
    identifier,
    supportedKinds,
    handlers,
    content: event.content,
    metadata: parseNip89HandlerMetadataJson(event.content),
    customTags: copyTags(event.tags).filter(
      (tag) =>
        !HANDLER_INFORMATION_STRUCTURED_TAGS.has(tag[0]) && !parseNip89PlatformHandlerTag(tag)
    ),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip89PlatformHandlerTags(
  tags: readonly (readonly string[])[]
): Nip89PlatformHandler[] {
  return tags.flatMap((tag) => {
    const handler = parseNip89PlatformHandlerTag(tag);
    return handler ? [handler] : [];
  });
}

export function parseNip89PlatformHandlerTag(tag: readonly string[]): Nip89PlatformHandler | null {
  if (HANDLER_INFORMATION_STRUCTURED_TAGS.has(tag[0]) || tag[0] === NIP89_CLIENT_TAG) return null;
  const platform = tag[0]?.trim();
  const urlTemplate = tag[1]?.trim();
  if (!platform || !urlTemplate) return null;
  return {
    platform,
    urlTemplate,
    entityType: tag[2]?.trim() || null
  };
}

export function parseNip89ClientTag(tag: readonly string[]): Nip89ClientTag | null {
  if (tag[0] !== NIP89_CLIENT_TAG) return null;
  const name = tag[1]?.trim();
  const handlerAddress = tag[2]?.trim();
  if (!name || !handlerAddress) return null;
  return {
    name,
    handlerAddress,
    relayHint: tag[3]?.trim() || null
  };
}

export function parseNip89HandlerMetadataJson(content: string): Record<string, unknown> | null {
  if (!content.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function buildNip89RecommendationFilter(input: {
  readonly eventKind: number | string;
  readonly authors?: readonly string[];
}): Filter {
  const filter: Filter = {
    kinds: [NIP89_RECOMMENDATION_KIND],
    '#d': [String(normalizeKind(input.eventKind, 'supported event kind'))]
  };
  if (input.authors?.length)
    filter.authors = input.authors.map((author) => normalizeNonEmpty(author, 'author pubkey'));
  return filter;
}

export function buildNip89HandlerInformationFilter(input: {
  readonly eventKind: number | string;
  readonly authors?: readonly string[];
}): Filter {
  const filter: Filter = {
    kinds: [NIP89_HANDLER_INFORMATION_KIND],
    '#k': [String(normalizeKind(input.eventKind, 'supported event kind'))]
  };
  if (input.authors?.length)
    filter.authors = input.authors.map((author) => normalizeNonEmpty(author, 'author pubkey'));
  return filter;
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  return parseTagValues(tags, tagName)[0] ?? null;
}

function parseTagValues(tags: readonly (readonly string[])[], tagName: string): string[] {
  return tags.flatMap((tag) => {
    const value = tag[0] === tagName ? tag[1]?.trim() : null;
    return value ? [value] : [];
  });
}

function normalizeKind(value: number | string, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`NIP-89 ${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function parseKind(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-89 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
