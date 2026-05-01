import type { EventParameters } from 'nostr-typedef';

import { buildNip51ListEvent } from './nip51-list.js';
import {
  buildNip59GiftWrap,
  type BuildNip59GiftWrapInput,
  buildNip59Rumor,
  type Nip59GiftWrapCrypto,
  type Nip59GiftWrapResult,
  type Nip59Rumor
} from './nip59-gift-wrap.js';
import { normalizeRelayUrl } from './relay-selection.js';
import type { EventSigner, UnsignedEvent } from './relay-session.js';

export const NIP17_CHAT_MESSAGE_KIND = 14;
export const NIP17_FILE_MESSAGE_KIND = 15;
export const NIP17_DM_RELAY_LIST_KIND = 10050;

export interface Nip17ReplyTarget {
  readonly id: string;
  readonly relayHint?: string;
}

export interface BuildNip17ChatMessageInput {
  readonly senderPubkey: string;
  readonly recipientPubkeys: readonly string[];
  readonly content: string;
  readonly createdAt: number;
  readonly replyTo?: Nip17ReplyTarget;
  readonly subject?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip17FileMessageInput extends BuildNip17ChatMessageInput {
  readonly fileType: string;
  readonly encryptionAlgorithm: 'aes-gcm';
  readonly decryptionKey: string;
  readonly decryptionNonce: string;
  readonly encryptedSha256: string;
  readonly originalSha256?: string;
  readonly size?: number;
  readonly dimensions?: string;
  readonly blurhash?: string;
  readonly thumbnail?: string;
  readonly fallbackUrls?: readonly string[];
}

export interface BuildNip17ConversationGiftWrapsInput {
  readonly message: UnsignedEvent;
  readonly recipientPubkeys: readonly string[];
  readonly signer: EventSigner;
  readonly crypto: Nip59GiftWrapCrypto;
  readonly includeSenderWrap?: boolean;
  readonly wrapTags?: readonly (readonly string[])[];
  readonly now?: () => number;
  readonly random?: () => number;
  readonly generateEphemeralSecretKey?: BuildNip59GiftWrapInput['generateEphemeralSecretKey'];
}

export interface Nip17WrappedMessage {
  readonly rumor: Nip59Rumor;
  readonly wraps: ReadonlyArray<Nip59GiftWrapResult & { readonly recipientPubkey: string }>;
}

export function buildNip17ChatMessage(input: BuildNip17ChatMessageInput): Nip59Rumor {
  return buildNip59Rumor(
    {
      kind: NIP17_CHAT_MESSAGE_KIND,
      content: input.content,
      created_at: input.createdAt,
      tags: buildConversationTags(input)
    },
    input.senderPubkey
  );
}

export function buildNip17FileMessage(input: BuildNip17FileMessageInput): Nip59Rumor {
  return buildNip59Rumor(
    {
      kind: NIP17_FILE_MESSAGE_KIND,
      content: input.content,
      created_at: input.createdAt,
      tags: [
        ...buildConversationTags(input),
        ['file-type', input.fileType],
        ['encryption-algorithm', input.encryptionAlgorithm],
        ['decryption-key', input.decryptionKey],
        ['decryption-nonce', input.decryptionNonce],
        ['x', input.encryptedSha256],
        ...optionalTag('ox', input.originalSha256),
        ...optionalTag('size', input.size === undefined ? undefined : String(input.size)),
        ...optionalTag('dim', input.dimensions),
        ...optionalTag('blurhash', input.blurhash),
        ...optionalTag('thumb', input.thumbnail),
        ...(input.fallbackUrls?.map((url) => ['fallback', url]) ?? [])
      ]
    },
    input.senderPubkey
  );
}

export async function buildNip17ConversationGiftWraps(
  input: BuildNip17ConversationGiftWrapsInput
): Promise<Nip17WrappedMessage> {
  if (!isNip17MessageKind(input.message.kind)) {
    throw new Error('NIP-17 encrypted chat messages must use kind:14 or kind:15');
  }
  const senderPubkey = await input.signer.getPublicKey();
  const wrapRecipients = conversationWrapRecipients(
    input.recipientPubkeys,
    input.includeSenderWrap === false ? undefined : senderPubkey
  );
  const wraps = await Promise.all(
    wrapRecipients.map(async (recipientPubkey) => ({
      recipientPubkey,
      ...(await buildNip59GiftWrap({
        rumor: input.message,
        recipientPubkey,
        signer: input.signer,
        crypto: input.crypto,
        wrapTags: input.wrapTags,
        now: input.now,
        random: input.random,
        generateEphemeralSecretKey: input.generateEphemeralSecretKey
      }))
    }))
  );

  return {
    rumor: buildNip59Rumor(input.message, senderPubkey),
    wraps
  };
}

export function buildNip17DmRelayList(relays: readonly string[]): EventParameters {
  return buildNip51ListEvent({
    kind: NIP17_DM_RELAY_LIST_KIND,
    publicTags: parseNip17DmRelayListTags(relays.map((relay) => ['relay', relay])).map((relay) => [
      'relay',
      relay
    ])
  });
}

export function parseNip17DmRelayListTags(tags: readonly (readonly string[])[]): string[] {
  const relays: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag[0] !== 'relay' || typeof tag[1] !== 'string') continue;
    const relay = normalizeRelayUrl(tag[1]);
    if (!relay || seen.has(relay)) continue;
    seen.add(relay);
    relays.push(relay);
  }
  return relays;
}

export function isNip17MessageKind(kind: number): boolean {
  return kind === NIP17_CHAT_MESSAGE_KIND || kind === NIP17_FILE_MESSAGE_KIND;
}

export function isNip17Rumor(rumor: Pick<Nip59Rumor, 'kind' | 'tags' | 'pubkey'>): boolean {
  if (!isNip17MessageKind(rumor.kind)) return false;
  return conversationParticipants(rumor).length > 1;
}

export function conversationParticipants(
  rumor: Pick<Nip59Rumor, 'tags' | 'pubkey'>
): readonly string[] {
  return [
    ...new Set([rumor.pubkey, ...rumor.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1])])
  ].filter((pubkey): pubkey is string => Boolean(pubkey));
}

export function nip17ConversationKey(rumor: Pick<Nip59Rumor, 'tags' | 'pubkey'>): string {
  return [...conversationParticipants(rumor)].sort().join(':');
}

function buildConversationTags(input: BuildNip17ChatMessageInput): string[][] {
  const tags: string[][] = [];
  for (const pubkey of uniquePubkeys(input.recipientPubkeys)) {
    tags.push(['p', pubkey]);
  }
  if (input.replyTo) {
    tags.push(['e', input.replyTo.id, input.replyTo.relayHint ?? '', 'reply']);
  }
  if (input.subject?.trim()) {
    tags.push(['subject', input.subject.trim()]);
  }
  tags.push(...copyTags(input.tags ?? []));
  return tags;
}

function conversationWrapRecipients(
  recipientPubkeys: readonly string[],
  senderPubkey: string | undefined
): string[] {
  return uniquePubkeys([...recipientPubkeys, ...(senderPubkey ? [senderPubkey] : [])]);
}

function uniquePubkeys(pubkeys: readonly string[]): string[] {
  return [...new Set(pubkeys.map((pubkey) => pubkey.trim()).filter(Boolean))];
}

function optionalTag(name: string, value: string | undefined): string[][] {
  return value ? [[name, value]] : [];
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
