import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP78_APPLICATION_DATA_KIND = 30078;

export interface BuildNip78ApplicationDataInput {
  readonly identifier: string;
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip78ApplicationDataSnapshot {
  readonly identifier: string;
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly tags: readonly string[][];
  readonly customTags: readonly string[][];
}

export function buildNip78ApplicationDataEvent(
  input: BuildNip78ApplicationDataInput
): EventParameters {
  const identifier = normalizeIdentifier(input.identifier);
  const tags = [['d', identifier], ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== 'd')];

  return {
    kind: NIP78_APPLICATION_DATA_KIND,
    content: input.content ?? '',
    tags
  };
}

export function parseNip78ApplicationDataEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip78ApplicationDataSnapshot | null {
  if (event.kind !== NIP78_APPLICATION_DATA_KIND) return null;

  const identifier = parseNip78Identifier(event.tags);
  if (!identifier) return null;

  const tags = copyTags(event.tags);
  return {
    identifier,
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    tags,
    customTags: tags.filter((tag) => tag[0] !== 'd')
  };
}

export function parseNip78Identifier(tags: readonly (readonly string[])[]): string | null {
  const value = tags.find((tag) => tag[0] === 'd')?.[1]?.trim();
  return value || null;
}

function normalizeIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('NIP-78 application data identifier must not be empty');
  }
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
