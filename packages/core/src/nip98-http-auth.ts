import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64 } from '@scure/base';
import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import type { EventSigner, SignedEventShape, UnsignedEvent } from './relay-session.js';

export const NIP98_HTTP_AUTH_KIND = 27235;
export const NIP98_AUTHORIZATION_SCHEME = 'Nostr';
export const NIP98_DEFAULT_TIME_WINDOW_SECONDS = 60;

export type Nip98PayloadInput = string | Uint8Array;
export type Nip98HttpAuthValidationFailureReason =
  | 'malformed'
  | 'expired'
  | 'future'
  | 'url-mismatch'
  | 'method-mismatch'
  | 'payload-mismatch';

export interface BuildNip98HttpAuthEventInput {
  readonly url: string;
  readonly method: string;
  readonly createdAt?: number;
  readonly payload?: Nip98PayloadInput;
  readonly payloadHash?: string;
  readonly tags?: readonly (readonly string[])[];
  readonly content?: string;
}

export interface SignNip98HttpAuthInput extends BuildNip98HttpAuthEventInput {
  readonly signer: EventSigner;
}

export interface Nip98HttpAuthSnapshot {
  readonly url: string;
  readonly method: string;
  readonly payloadHash: string | null;
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface ValidateNip98HttpAuthOptions {
  readonly url: string;
  readonly method: string;
  readonly now?: number;
  readonly windowSeconds?: number;
  readonly payload?: Nip98PayloadInput;
  readonly payloadHash?: string;
}

export type Nip98HttpAuthValidationResult =
  | { readonly ok: true; readonly snapshot: Nip98HttpAuthSnapshot }
  | { readonly ok: false; readonly reason: Nip98HttpAuthValidationFailureReason };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function buildNip98HttpAuthEvent(input: BuildNip98HttpAuthEventInput): EventParameters {
  const url = normalizeAbsoluteUrl(input.url);
  const method = normalizeMethod(input.method);
  const payloadHash = resolvePayloadHash(input.payload, input.payloadHash);
  const tags: string[][] = [
    ['u', url],
    ['method', method]
  ];
  if (payloadHash) tags.push(['payload', payloadHash]);
  tags.push(
    ...copyTags(input.tags ?? []).filter((tag) => !['u', 'method', 'payload'].includes(tag[0]))
  );

  return {
    kind: NIP98_HTTP_AUTH_KIND,
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    content: input.content ?? '',
    tags
  };
}

export async function signNip98HttpAuthEvent(
  input: SignNip98HttpAuthInput
): Promise<SignedEventShape> {
  const unsigned = buildNip98HttpAuthEvent(input) as UnsignedEvent;
  const pubkey = await input.signer.getPublicKey();
  const signed = await input.signer.signEvent(unsigned);
  if ('pubkey' in signed) return signed;
  return {
    ...unsigned,
    pubkey,
    id: signed.id,
    sig: signed.sig
  };
}

export async function buildNip98AuthorizationHeader(
  input: SignNip98HttpAuthInput
): Promise<string> {
  return encodeNip98AuthorizationHeader(await signNip98HttpAuthEvent(input));
}

export function parseNip98HttpAuthEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip98HttpAuthSnapshot | null {
  if (event.kind !== NIP98_HTTP_AUTH_KIND) return null;

  const url = parseAbsoluteUrl(firstTagValue(event.tags, 'u'));
  const method = parseMethod(firstTagValue(event.tags, 'method'));
  if (!url || !method) return null;

  const payloadHash = firstTagValue(event.tags, 'payload');
  if (payloadHash && !isNip98PayloadHash(payloadHash)) return null;

  return {
    url,
    method,
    payloadHash: payloadHash ?? null,
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function validateNip98HttpAuthEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>,
  options: ValidateNip98HttpAuthOptions
): Nip98HttpAuthValidationResult {
  const snapshot = parseNip98HttpAuthEvent(event);
  if (!snapshot || snapshot.createdAt === null) return { ok: false, reason: 'malformed' };

  const now = normalizeTimestamp(options.now ?? Math.floor(Date.now() / 1000), 'current time');
  const windowSeconds = normalizeTimestamp(
    options.windowSeconds ?? NIP98_DEFAULT_TIME_WINDOW_SECONDS,
    'time window'
  );
  if (snapshot.createdAt < now - windowSeconds) return { ok: false, reason: 'expired' };
  if (snapshot.createdAt > now + windowSeconds) return { ok: false, reason: 'future' };
  if (snapshot.url !== normalizeAbsoluteUrl(options.url))
    return { ok: false, reason: 'url-mismatch' };
  if (snapshot.method !== normalizeMethod(options.method)) {
    return { ok: false, reason: 'method-mismatch' };
  }

  const expectedPayloadHash = resolvePayloadHash(options.payload, options.payloadHash);
  if (expectedPayloadHash && snapshot.payloadHash !== expectedPayloadHash) {
    return { ok: false, reason: 'payload-mismatch' };
  }

  return { ok: true, snapshot };
}

export function hashNip98Payload(payload: Nip98PayloadInput): string {
  const bytes = typeof payload === 'string' ? textEncoder.encode(payload) : payload;
  return bytesToHex(sha256(bytes));
}

export function isNip98PayloadHash(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function encodeNip98AuthorizationHeader(event: NostrEvent): string {
  return `${NIP98_AUTHORIZATION_SCHEME} ${base64.encode(textEncoder.encode(JSON.stringify(event)))}`;
}

export function decodeNip98AuthorizationHeader(header: string): NostrEvent | null {
  const trimmed = header.trim();
  const match = /^Nostr\s+(.+)$/i.exec(trimmed);
  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(textDecoder.decode(base64.decode(match[1])));
    return isNostrEventShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolvePayloadHash(
  payload: Nip98PayloadInput | undefined,
  payloadHash: string | undefined
): string | null {
  const normalizedPayloadHash = payloadHash?.trim().toLowerCase();
  if (normalizedPayloadHash && !isNip98PayloadHash(normalizedPayloadHash)) {
    throw new Error('NIP-98 payload hash must be a 64-character hex SHA-256 digest');
  }
  if (payload === undefined) return normalizedPayloadHash ?? null;

  const calculated = hashNip98Payload(payload);
  if (normalizedPayloadHash && normalizedPayloadHash !== calculated) {
    throw new Error('NIP-98 payload hash does not match payload');
  }
  return calculated;
}

function normalizeAbsoluteUrl(value: string): string {
  const normalized = value.trim();
  try {
    new URL(normalized);
  } catch {
    throw new Error('NIP-98 u tag must be an absolute URL');
  }
  return normalized;
}

function parseAbsoluteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeAbsoluteUrl(value);
  } catch {
    return null;
  }
}

function normalizeMethod(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw new Error('NIP-98 method tag must be an HTTP method');
  }
  return normalized;
}

function parseMethod(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeMethod(value);
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-98 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function isNostrEventShape(value: unknown): value is NostrEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<NostrEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.sig === 'string' &&
    typeof event.pubkey === 'string' &&
    typeof event.kind === 'number' &&
    typeof event.created_at === 'number' &&
    typeof event.content === 'string' &&
    Array.isArray(event.tags) &&
    event.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === 'string'))
  );
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
