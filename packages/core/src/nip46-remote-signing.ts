import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import { normalizeRelayUrl } from './relay-selection.js';

export const NIP46_REMOTE_SIGNING_KIND = 24133;
export const NIP46_BUNKER_SCHEME = 'bunker:';
export const NIP46_NOSTRCONNECT_SCHEME = 'nostrconnect:';
export const NIP46_AUTH_CHALLENGE_RESULT = 'auth_url';

export const NIP46_METHODS = [
  'connect',
  'sign_event',
  'ping',
  'get_public_key',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  'switch_relays'
] as const;

export type Nip46Method = (typeof NIP46_METHODS)[number];

export interface Nip46Permission {
  readonly method: Nip46Method | string;
  readonly parameter?: string;
}

export interface Nip46BunkerUrl {
  readonly remoteSignerPubkey: string;
  readonly relays: readonly string[];
  readonly secret: string | null;
}

export interface BuildNip46BunkerUrlInput {
  readonly remoteSignerPubkey: string;
  readonly relays: readonly string[];
  readonly secret?: string;
}

export interface Nip46NostrConnectUrl {
  readonly clientPubkey: string;
  readonly relays: readonly string[];
  readonly secret: string;
  readonly permissions: readonly Nip46Permission[];
  readonly name: string | null;
  readonly url: string | null;
  readonly image: string | null;
}

export interface BuildNip46NostrConnectUrlInput {
  readonly clientPubkey: string;
  readonly relays: readonly string[];
  readonly secret: string;
  readonly permissions?: readonly Nip46Permission[];
  readonly name?: string;
  readonly url?: string;
  readonly image?: string;
}

export interface Nip46UnsignedEvent {
  readonly kind: number;
  readonly content: string;
  readonly tags: readonly (readonly string[])[];
  readonly created_at: number;
}

export interface Nip46RequestPayload {
  readonly id: string;
  readonly method: Nip46Method | string;
  readonly params: readonly string[];
}

export interface Nip46ResponsePayload {
  readonly id: string;
  readonly result: string | null;
  readonly error?: string;
}

export interface Nip46RemoteSigningEnvelope {
  readonly senderPubkey: string | null;
  readonly recipientPubkeys: readonly string[];
  readonly encryptedContent: string;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

export interface BuildNip46RemoteSigningEventInput {
  readonly recipientPubkey: string;
  readonly encryptedContent: string;
  readonly tags?: readonly (readonly string[])[];
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

export function buildNip46BunkerUrl(input: BuildNip46BunkerUrlInput): string {
  const remoteSignerPubkey = assertHexPubkey(input.remoteSignerPubkey, 'remote signer pubkey');
  const relays = normalizeRequiredRelays(input.relays, 'NIP-46 bunker URL');
  const url = new URL(`${NIP46_BUNKER_SCHEME}//${remoteSignerPubkey}`);
  for (const relay of relays) url.searchParams.append('relay', relay);
  if (input.secret?.trim()) url.searchParams.set('secret', input.secret.trim());
  return url.toString();
}

export function parseNip46BunkerUrl(value: string): Nip46BunkerUrl | null {
  const url = parseUrl(value);
  if (!url || url.protocol !== NIP46_BUNKER_SCHEME) return null;

  const remoteSignerPubkey = normalizeHexPubkey(url.hostname);
  if (!remoteSignerPubkey) return null;

  const relays = normalizeRelayList(url.searchParams.getAll('relay'));
  if (relays.length === 0) return null;

  return {
    remoteSignerPubkey,
    relays,
    secret: nonEmptyOrNull(url.searchParams.get('secret'))
  };
}

export function buildNip46NostrConnectUrl(input: BuildNip46NostrConnectUrlInput): string {
  const clientPubkey = assertHexPubkey(input.clientPubkey, 'client pubkey');
  const relays = normalizeRequiredRelays(input.relays, 'NIP-46 nostrconnect URL');
  const secret = nonEmpty(input.secret, 'NIP-46 nostrconnect secret');
  const url = new URL(`${NIP46_NOSTRCONNECT_SCHEME}//${clientPubkey}`);
  for (const relay of relays) url.searchParams.append('relay', relay);
  url.searchParams.set('secret', secret);

  const permissions = stringifyNip46Permissions(input.permissions ?? []);
  if (permissions) url.searchParams.set('perms', permissions);
  if (input.name?.trim()) url.searchParams.set('name', input.name.trim());
  if (input.url?.trim()) url.searchParams.set('url', input.url.trim());
  if (input.image?.trim()) url.searchParams.set('image', input.image.trim());
  return url.toString();
}

export function parseNip46NostrConnectUrl(value: string): Nip46NostrConnectUrl | null {
  const url = parseUrl(value);
  if (!url || url.protocol !== NIP46_NOSTRCONNECT_SCHEME) return null;

  const clientPubkey = normalizeHexPubkey(url.hostname);
  if (!clientPubkey) return null;

  const relays = normalizeRelayList(url.searchParams.getAll('relay'));
  const secret = nonEmptyOrNull(url.searchParams.get('secret'));
  if (relays.length === 0 || !secret) return null;

  return {
    clientPubkey,
    relays,
    secret,
    permissions: parseNip46Permissions(url.searchParams.get('perms') ?? ''),
    name: nonEmptyOrNull(url.searchParams.get('name')),
    url: nonEmptyOrNull(url.searchParams.get('url')),
    image: nonEmptyOrNull(url.searchParams.get('image'))
  };
}

export function stringifyNip46Permission(permission: Nip46Permission): string {
  const method = nonEmpty(permission.method, 'NIP-46 permission method');
  const parameter = permission.parameter?.trim();
  return parameter ? `${method}:${parameter}` : method;
}

export function parseNip46Permission(value: string): Nip46Permission | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const separator = trimmed.indexOf(':');
  if (separator === -1) return { method: trimmed };
  const method = trimmed.slice(0, separator).trim();
  const parameter = trimmed.slice(separator + 1).trim();
  if (!method) return null;
  return parameter ? { method, parameter } : { method };
}

export function stringifyNip46Permissions(permissions: readonly Nip46Permission[]): string {
  return permissions.map(stringifyNip46Permission).join(',');
}

export function parseNip46Permissions(value: string): Nip46Permission[] {
  return value
    .split(',')
    .map(parseNip46Permission)
    .filter((permission): permission is Nip46Permission => permission !== null);
}

export function buildNip46RequestPayload(input: Nip46RequestPayload): Nip46RequestPayload {
  return {
    id: nonEmpty(input.id, 'NIP-46 request id'),
    method: nonEmpty(input.method, 'NIP-46 request method'),
    params: input.params.map((param) => String(param))
  };
}

export function buildNip46ConnectRequest(input: {
  readonly id: string;
  readonly remoteSignerPubkey: string;
  readonly secret?: string;
  readonly permissions?: readonly Nip46Permission[];
}): Nip46RequestPayload {
  const params = [assertHexPubkey(input.remoteSignerPubkey, 'remote signer pubkey')];
  const secret = input.secret?.trim();
  const permissions = stringifyNip46Permissions(input.permissions ?? []);
  if (secret || permissions) params.push(secret ?? '');
  if (permissions) params.push(permissions);
  return buildNip46RequestPayload({ id: input.id, method: 'connect', params });
}

export function buildNip46SignEventRequest(input: {
  readonly id: string;
  readonly event: Nip46UnsignedEvent;
}): Nip46RequestPayload {
  return buildNip46RequestPayload({
    id: input.id,
    method: 'sign_event',
    params: [JSON.stringify(normalizeUnsignedEvent(input.event))]
  });
}

export function buildNip46SimpleRequest(
  id: string,
  method: Extract<Nip46Method, 'ping' | 'get_public_key' | 'switch_relays'>
): Nip46RequestPayload {
  return buildNip46RequestPayload({ id, method, params: [] });
}

export function stringifyNip46RequestPayload(payload: Nip46RequestPayload): string {
  return JSON.stringify(buildNip46RequestPayload(payload));
}

export function parseNip46RequestPayloadJson(value: string): Nip46RequestPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<Nip46RequestPayload>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.method !== 'string') return null;
    if (
      !Array.isArray(parsed.params) ||
      !parsed.params.every((param) => typeof param === 'string')
    ) {
      return null;
    }
    return buildNip46RequestPayload({
      id: parsed.id,
      method: parsed.method,
      params: parsed.params
    });
  } catch {
    return null;
  }
}

export function buildNip46ResponsePayload(input: Nip46ResponsePayload): Nip46ResponsePayload {
  const error = input.error?.trim();
  return {
    id: nonEmpty(input.id, 'NIP-46 response id'),
    result: input.result,
    ...(error ? { error } : {})
  };
}

export function stringifyNip46ResponsePayload(payload: Nip46ResponsePayload): string {
  return JSON.stringify(buildNip46ResponsePayload(payload));
}

export function parseNip46ResponsePayloadJson(value: string): Nip46ResponsePayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<Nip46ResponsePayload>;
    if (!parsed || typeof parsed.id !== 'string') return null;
    if (parsed.result !== null && typeof parsed.result !== 'string') return null;
    if (parsed.error !== undefined && typeof parsed.error !== 'string') return null;
    return buildNip46ResponsePayload({
      id: parsed.id,
      result: parsed.result ?? null,
      error: parsed.error
    });
  } catch {
    return null;
  }
}

export function isNip46AuthChallenge(
  payload: Pick<Nip46ResponsePayload, 'result' | 'error'>
): boolean {
  return payload.result === NIP46_AUTH_CHALLENGE_RESULT && Boolean(payload.error?.trim());
}

export function buildNip46RemoteSigningEvent(
  input: BuildNip46RemoteSigningEventInput
): EventParameters {
  const recipientPubkey = assertHexPubkey(input.recipientPubkey, 'recipient pubkey');
  return {
    kind: NIP46_REMOTE_SIGNING_KIND,
    content: input.encryptedContent,
    tags: [['p', recipientPubkey], ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== 'p')]
  };
}

export function parseNip46RemoteSigningEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip46RemoteSigningEnvelope | null {
  if (event.kind !== NIP46_REMOTE_SIGNING_KIND) return null;
  const recipientPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => normalizeHexPubkey(tag[1]))
        .filter((pubkey): pubkey is string => pubkey !== null)
    )
  ];
  if (recipientPubkeys.length === 0) return null;
  return {
    senderPubkey: normalizeHexPubkey(event.pubkey) ?? null,
    recipientPubkeys,
    encryptedContent: event.content,
    createdAt: event.created_at ?? null,
    customTags: event.tags.filter((tag) => tag[0] !== 'p').map((tag) => [...tag])
  };
}

function normalizeUnsignedEvent(event: Nip46UnsignedEvent): Nip46UnsignedEvent {
  return {
    kind: event.kind,
    content: event.content,
    tags: event.tags.map((tag) => [...tag]),
    created_at: event.created_at
  };
}

function normalizeRequiredRelays(relays: readonly string[], label: string): string[] {
  const normalized = normalizeRelayList(relays);
  if (normalized.length === 0) {
    throw new Error(`${label} must include at least one relay`);
  }
  return normalized;
}

function normalizeRelayList(relays: readonly string[]): string[] {
  return [
    ...new Set(
      relays
        .map((relay) => normalizeRelayUrl(relay))
        .filter((relay): relay is string => relay !== null)
    )
  ];
}

function assertHexPubkey(value: string, label: string): string {
  const pubkey = normalizeHexPubkey(value);
  if (!pubkey) throw new Error(`NIP-46 ${label} must be 64 hex characters`);
  return pubkey;
}

function normalizeHexPubkey(value: string | undefined | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && HEX_PUBKEY.test(normalized) ? normalized : null;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function nonEmptyOrNull(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
