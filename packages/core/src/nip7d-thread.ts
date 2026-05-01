import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP7D_THREAD_KIND = 11;
export const NIP7D_THREAD_REPLY_KIND = 1111;
export const NIP7D_THREAD_ROOT_SCOPE = '11';

export interface BuildNip7dThreadInput {
  readonly content: string;
  readonly title?: string | null;
  readonly createdAt?: number;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip7dThreadSnapshot {
  readonly content: string;
  readonly title: string | null;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly tags: readonly string[][];
  readonly customTags: readonly string[][];
}

export interface BuildNip7dThreadReplyTagsInput {
  readonly threadId: string;
  readonly threadPubkey: string;
  readonly relayUrl?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip7dThreadReplyRoot {
  readonly threadId: string;
  readonly relayUrl: string | null;
  readonly threadPubkey: string | null;
}

export function buildNip7dThreadEvent(input: BuildNip7dThreadInput): EventParameters {
  const tags: string[][] = [];
  const title = input.title?.trim();
  if (title) tags.push(['title', title]);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => tag[0] !== 'title'));

  return {
    kind: NIP7D_THREAD_KIND,
    created_at: input.createdAt,
    content: input.content,
    tags
  };
}

export function parseNip7dThreadEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip7dThreadSnapshot | null {
  if (event.kind !== NIP7D_THREAD_KIND) return null;
  const tags = copyTags(event.tags);
  return {
    content: event.content,
    title: firstTagValue(event.tags, 'title'),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    tags,
    customTags: tags.filter((tag) => tag[0] !== 'title')
  };
}

export function buildNip7dThreadReplyTags(input: BuildNip7dThreadReplyTagsInput): string[][] {
  const threadId = nonEmpty(input.threadId, 'thread id');
  const threadPubkey = nonEmpty(input.threadPubkey, 'thread pubkey');
  const rootTag = input.relayUrl?.trim()
    ? ['E', threadId, input.relayUrl.trim(), threadPubkey]
    : ['E', threadId, '', threadPubkey];

  return [
    ['K', NIP7D_THREAD_ROOT_SCOPE],
    rootTag,
    ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== 'K' && tag[0] !== 'E')
  ];
}

export function parseNip7dThreadReplyRoot(
  event: Pick<NostrEvent, 'kind' | 'tags'>
): Nip7dThreadReplyRoot | null {
  if (event.kind !== NIP7D_THREAD_REPLY_KIND) return null;
  if (!event.tags.some((tag) => tag[0] === 'K' && tag[1] === NIP7D_THREAD_ROOT_SCOPE)) {
    return null;
  }
  const root = event.tags.find((tag) => tag[0] === 'E' && Boolean(tag[1]?.trim()));
  if (!root) return null;
  return {
    threadId: root[1].trim(),
    relayUrl: root[2]?.trim() || null,
    threadPubkey: root[3]?.trim() || null
  };
}

export function isNip7dThreadEvent(event: Pick<NostrEvent, 'kind'>): boolean {
  return event.kind === NIP7D_THREAD_KIND;
}

export function isNip7dThreadReply(event: Pick<NostrEvent, 'kind' | 'tags'>): boolean {
  return parseNip7dThreadReplyRoot(event) !== null;
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-7D ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
