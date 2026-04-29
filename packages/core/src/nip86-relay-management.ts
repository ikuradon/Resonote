import type { EventParameters } from 'nostr-typedef';

import {
  buildNip98AuthorizationHeader,
  buildNip98HttpAuthEvent,
  hashNip98Payload
} from './nip98-http-auth.js';
import type { EventSigner } from './relay-session.js';

export const NIP86_CONTENT_TYPE = 'application/nostr+json+rpc';
export const NIP86_HTTP_METHOD = 'POST';
export const NIP86_METHODS = [
  'supportedmethods',
  'banpubkey',
  'unbanpubkey',
  'listbannedpubkeys',
  'allowpubkey',
  'unallowpubkey',
  'listallowedpubkeys',
  'listeventsneedingmoderation',
  'allowevent',
  'banevent',
  'listbannedevents',
  'changerelayname',
  'changerelaydescription',
  'changerelayicon',
  'allowkind',
  'disallowkind',
  'listallowedkinds',
  'blockip',
  'unblockip',
  'listblockedips'
] as const;

export type Nip86RelayManagementMethod = (typeof NIP86_METHODS)[number];
export type Nip86JsonPrimitive = string | number | boolean | null;
export type Nip86JsonValue =
  | Nip86JsonPrimitive
  | readonly Nip86JsonValue[]
  | { readonly [key: string]: Nip86JsonValue };

export interface Nip86ManagementRequest<
  Method extends Nip86RelayManagementMethod = Nip86RelayManagementMethod
> {
  readonly method: Method;
  readonly params: readonly Nip86JsonValue[];
}

export interface Nip86ManagementResponse<Result = Nip86JsonValue> {
  readonly result: Result | null;
  readonly error: string | null;
}

export interface Nip86PubkeyReason {
  readonly pubkey: string;
  readonly reason: string | null;
}

export interface Nip86EventReason {
  readonly id: string;
  readonly reason: string | null;
}

export interface Nip86BlockedIp {
  readonly ip: string;
  readonly reason: string | null;
}

export interface BuildNip86ManagementAuthEventInput {
  readonly relayUrl: string;
  readonly request: Nip86ManagementRequest;
  readonly createdAt?: number;
  readonly tags?: readonly (readonly string[])[];
  readonly content?: string;
}

export interface BuildNip86ManagementAuthorizationHeaderInput extends BuildNip86ManagementAuthEventInput {
  readonly signer: EventSigner;
}

export interface BuildNip86ManagementHttpRequestInput {
  readonly relayUrl: string;
  readonly request: Nip86ManagementRequest;
  readonly authorizationHeader?: string | null;
}

export interface Nip86ManagementHttpRequest {
  readonly url: string;
  readonly method: typeof NIP86_HTTP_METHOD;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly request: Nip86ManagementRequest;
}

const METHOD_SET = new Set<string>(NIP86_METHODS);
const HEX_64 = /^[0-9a-f]{64}$/i;

export function isNip86RelayManagementMethod(method: string): method is Nip86RelayManagementMethod {
  return METHOD_SET.has(method);
}

export function buildNip86ManagementRequest<
  Method extends Nip86RelayManagementMethod = Nip86RelayManagementMethod
>(method: Method, params: readonly Nip86JsonValue[] = []): Nip86ManagementRequest<Method> {
  assertNip86Method(method);
  return {
    method,
    params: params.map(assertJsonValue)
  };
}

export function buildNip86SupportedMethodsRequest(): Nip86ManagementRequest<'supportedmethods'> {
  return buildNip86ManagementRequest('supportedmethods');
}

export function buildNip86PubkeyRequest(
  method: 'banpubkey' | 'unbanpubkey' | 'allowpubkey' | 'unallowpubkey',
  pubkey: string,
  reason?: string | null
): Nip86ManagementRequest<typeof method> {
  return buildNip86ManagementRequest(
    method,
    appendOptionalReason(normalizeHex64(pubkey, 'pubkey'), reason)
  );
}

export function buildNip86ListPubkeysRequest(
  method: 'listbannedpubkeys' | 'listallowedpubkeys'
): Nip86ManagementRequest<typeof method> {
  return buildNip86ManagementRequest(method);
}

export function buildNip86ListEventsNeedingModerationRequest(): Nip86ManagementRequest<'listeventsneedingmoderation'> {
  return buildNip86ManagementRequest('listeventsneedingmoderation');
}

export function buildNip86EventRequest(
  method: 'allowevent' | 'banevent',
  id: string,
  reason?: string | null
): Nip86ManagementRequest<typeof method> {
  return buildNip86ManagementRequest(
    method,
    appendOptionalReason(normalizeHex64(id, 'event id'), reason)
  );
}

export function buildNip86ListBannedEventsRequest(): Nip86ManagementRequest<'listbannedevents'> {
  return buildNip86ManagementRequest('listbannedevents');
}

export function buildNip86RelayInfoRequest(
  method: 'changerelayname' | 'changerelaydescription' | 'changerelayicon',
  value: string
): Nip86ManagementRequest<typeof method> {
  const normalized =
    method === 'changerelayicon'
      ? normalizeAbsoluteUrl(value, 'relay icon URL')
      : normalizeNonEmpty(value, method === 'changerelayname' ? 'relay name' : 'relay description');
  return buildNip86ManagementRequest(method, [normalized]);
}

export function buildNip86KindRequest(
  method: 'allowkind' | 'disallowkind',
  kind: number
): Nip86ManagementRequest<typeof method> {
  return buildNip86ManagementRequest(method, [normalizeKind(kind)]);
}

export function buildNip86ListAllowedKindsRequest(): Nip86ManagementRequest<'listallowedkinds'> {
  return buildNip86ManagementRequest('listallowedkinds');
}

export function buildNip86IpRequest(
  method: 'blockip' | 'unblockip',
  ip: string,
  reason?: string | null
): Nip86ManagementRequest<typeof method> {
  const params =
    method === 'blockip'
      ? appendOptionalReason(normalizeNonEmpty(ip, 'IP address'), reason)
      : [normalizeNonEmpty(ip, 'IP address')];
  return buildNip86ManagementRequest(method, params);
}

export function buildNip86ListBlockedIpsRequest(): Nip86ManagementRequest<'listblockedips'> {
  return buildNip86ManagementRequest('listblockedips');
}

export function stringifyNip86ManagementRequest(request: Nip86ManagementRequest): string {
  return JSON.stringify(buildNip86ManagementRequest(request.method, request.params));
}

export function hashNip86ManagementRequest(request: Nip86ManagementRequest): string {
  return hashNip98Payload(stringifyNip86ManagementRequest(request));
}

export function buildNip86ManagementAuthEvent(
  input: BuildNip86ManagementAuthEventInput
): EventParameters {
  const payload = stringifyNip86ManagementRequest(input.request);
  return buildNip98HttpAuthEvent({
    url: input.relayUrl,
    method: NIP86_HTTP_METHOD,
    payload,
    createdAt: input.createdAt,
    tags: input.tags,
    content: input.content
  });
}

export function buildNip86ManagementAuthorizationHeader(
  input: BuildNip86ManagementAuthorizationHeaderInput
): Promise<string> {
  const payload = stringifyNip86ManagementRequest(input.request);
  return buildNip98AuthorizationHeader({
    signer: input.signer,
    url: input.relayUrl,
    method: NIP86_HTTP_METHOD,
    payload,
    createdAt: input.createdAt,
    tags: input.tags,
    content: input.content
  });
}

export function buildNip86ManagementHttpRequest(
  input: BuildNip86ManagementHttpRequestInput
): Nip86ManagementHttpRequest {
  const authorization = input.authorizationHeader?.trim();
  return {
    url: normalizeAbsoluteUrl(input.relayUrl, 'relay URL'),
    method: NIP86_HTTP_METHOD,
    headers: authorization
      ? { 'content-type': NIP86_CONTENT_TYPE, authorization }
      : { 'content-type': NIP86_CONTENT_TYPE },
    body: stringifyNip86ManagementRequest(input.request),
    request: buildNip86ManagementRequest(input.request.method, input.request.params)
  };
}

export function parseNip86ManagementRequestJson(json: string): Nip86ManagementRequest | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { readonly method?: unknown; readonly params?: unknown };
    if (typeof record.method !== 'string' || !isNip86RelayManagementMethod(record.method)) {
      return null;
    }
    if (!Array.isArray(record.params)) return null;
    return buildNip86ManagementRequest(record.method, record.params.map(assertJsonValue));
  } catch {
    return null;
  }
}

export function parseNip86ManagementResponseJson(json: string): Nip86ManagementResponse | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as { readonly result?: unknown; readonly error?: unknown };
    const result = record.result === undefined ? null : assertJsonValue(record.result);
    const error =
      record.error === undefined || record.error === null
        ? null
        : normalizeNonEmpty(String(record.error), 'error message');
    return { result, error };
  } catch {
    return null;
  }
}

export function parseNip86PubkeyReasonList(value: unknown): Nip86PubkeyReason[] | null {
  return parseReasonList(value, 'pubkey');
}

export function parseNip86EventReasonList(value: unknown): Nip86EventReason[] | null {
  return parseReasonList(value, 'id');
}

export function parseNip86BlockedIpList(value: unknown): Nip86BlockedIp[] | null {
  return parseReasonList(value, 'ip');
}

function parseReasonList<T extends 'pubkey' | 'id' | 'ip'>(
  value: unknown,
  key: T
): ({ readonly reason: string | null } & Record<T, string>)[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const rawValue = record[key];
    if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
    if ((key === 'pubkey' || key === 'id') && !HEX_64.test(rawValue.trim())) return [];
    const reason =
      typeof record.reason === 'string' && record.reason.trim() ? record.reason.trim() : null;
    return [
      { [key]: rawValue.trim().toLowerCase(), reason } as {
        readonly reason: string | null;
      } & Record<T, string>
    ];
  });
  return parsed.length === value.length ? parsed : null;
}

function appendOptionalReason(value: string, reason: string | null | undefined): Nip86JsonValue[] {
  const normalizedReason = reason?.trim();
  return normalizedReason ? [value, normalizedReason] : [value];
}

function assertNip86Method(method: string): asserts method is Nip86RelayManagementMethod {
  if (!isNip86RelayManagementMethod(method)) {
    throw new Error(`NIP-86 method is not supported: ${method}`);
  }
}

function assertJsonValue(value: unknown): Nip86JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(assertJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        assertJsonValue(nested)
      ])
    );
  }
  throw new Error('NIP-86 params and result values must be JSON serializable');
}

function normalizeHex64(value: string, label: string): string {
  const normalized = normalizeNonEmpty(value, label).toLowerCase();
  if (!HEX_64.test(normalized)) {
    throw new Error(`NIP-86 ${label} must be a 32-byte lowercase hex value`);
  }
  return normalized;
}

function normalizeKind(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('NIP-86 kind must be a non-negative safe integer');
  }
  return value;
}

function normalizeAbsoluteUrl(value: string, label: string): string {
  const normalized = normalizeNonEmpty(value, label);
  try {
    new URL(normalized);
  } catch {
    throw new Error(`NIP-86 ${label} must be an absolute URL`);
  }
  return normalized;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-86 ${label} must be non-empty`);
  return normalized;
}
