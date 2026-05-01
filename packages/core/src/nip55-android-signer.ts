export const NIP55_NOSTRSIGNER_SCHEME = 'nostrsigner:';

export const NIP55_SIGNER_METHODS = [
  'get_public_key',
  'sign_event',
  'nip04_encrypt',
  'nip04_decrypt',
  'nip44_encrypt',
  'nip44_decrypt',
  'decrypt_zap_event'
] as const;

export type Nip55SignerMethod = (typeof NIP55_SIGNER_METHODS)[number];
export type Nip55ReturnType = 'signature' | 'event';
export type Nip55CompressionType = 'none' | 'gzip';

export interface Nip55Permission {
  readonly type: Nip55SignerMethod;
  readonly kind?: number;
}

export interface BuildNip55SignerUrlInput {
  readonly type: Nip55SignerMethod;
  readonly content?: string;
  readonly pubkey?: string;
  readonly callbackUrl?: string;
  readonly returnType?: Nip55ReturnType;
  readonly compressionType?: Nip55CompressionType;
  readonly currentUser?: string;
  readonly id?: string;
  readonly permissions?: readonly Nip55Permission[];
}

export interface Nip55SignerUrl {
  readonly type: Nip55SignerMethod | string | null;
  readonly content: string;
  readonly pubkey: string | null;
  readonly callbackUrl: string | null;
  readonly returnType: string | null;
  readonly compressionType: string | null;
  readonly currentUser: string | null;
  readonly id: string | null;
  readonly permissions: readonly Nip55Permission[];
}

export interface Nip55IntentRequest {
  readonly uri: string;
  readonly extras: Readonly<Record<string, string>>;
  readonly packageName?: string;
}

export interface Nip55SignerResult {
  readonly result: string | null;
  readonly event: string | null;
  readonly id: string | null;
  readonly packageName: string | null;
  readonly results: unknown;
  readonly rejected: boolean;
}

const CONTENT_RESOLVER_METHODS: Record<Nip55SignerMethod, string | null> = {
  get_public_key: null,
  sign_event: 'SIGN_EVENT',
  nip04_encrypt: 'NIP04_ENCRYPT',
  nip04_decrypt: 'NIP04_DECRYPT',
  nip44_encrypt: 'NIP44_ENCRYPT',
  nip44_decrypt: 'NIP44_DECRYPT',
  decrypt_zap_event: 'DECRYPT_ZAP_EVENT'
};

const SIGNER_METHODS = new Set<string>(NIP55_SIGNER_METHODS);

export function isNip55SignerMethod(value: string): value is Nip55SignerMethod {
  return SIGNER_METHODS.has(value);
}

export function buildNip55SignerUrl(input: BuildNip55SignerUrlInput): string {
  const params = new URLSearchParams();
  params.set('type', input.type);
  params.set('compressionType', input.compressionType ?? 'none');
  params.set('returnType', input.returnType ?? 'signature');
  setOptionalParam(params, 'pubkey', input.pubkey);
  setOptionalParam(params, 'callbackUrl', input.callbackUrl);
  setOptionalParam(params, 'current_user', input.currentUser);
  setOptionalParam(params, 'id', input.id);
  if (input.permissions?.length) {
    params.set('permissions', stringifyNip55Permissions(input.permissions));
  }

  const content = encodeURIComponent(input.content ?? '');
  const query = params.toString();
  return `${NIP55_NOSTRSIGNER_SCHEME}${content}${query ? `?${query}` : ''}`;
}

export function parseNip55SignerUrl(value: string): Nip55SignerUrl | null {
  if (!value.startsWith(NIP55_NOSTRSIGNER_SCHEME)) return null;
  const withoutScheme = value.slice(NIP55_NOSTRSIGNER_SCHEME.length);
  const queryStart = withoutScheme.indexOf('?');
  const encodedContent = queryStart === -1 ? withoutScheme : withoutScheme.slice(0, queryStart);
  const query = queryStart === -1 ? '' : withoutScheme.slice(queryStart + 1);
  const params = new URLSearchParams(query);
  const rawType = nonEmptyOrNull(params.get('type'));

  return {
    type: rawType && isNip55SignerMethod(rawType) ? rawType : rawType,
    content: safeDecodeURIComponent(encodedContent),
    pubkey: nonEmptyOrNull(params.get('pubkey')),
    callbackUrl: nonEmptyOrNull(params.get('callbackUrl')),
    returnType: nonEmptyOrNull(params.get('returnType')),
    compressionType: nonEmptyOrNull(params.get('compressionType')),
    currentUser: nonEmptyOrNull(params.get('current_user')),
    id: nonEmptyOrNull(params.get('id')),
    permissions: parseNip55Permissions(params.get('permissions') ?? '')
  };
}

export function buildNip55IntentRequest(
  input: BuildNip55SignerUrlInput & { readonly packageName?: string }
): Nip55IntentRequest {
  const extras: Record<string, string> = {
    type: input.type
  };
  setOptionalExtra(extras, 'pubkey', input.pubkey);
  setOptionalExtra(extras, 'current_user', input.currentUser);
  setOptionalExtra(extras, 'id', input.id);
  if (input.permissions?.length) {
    extras.permissions = stringifyNip55Permissions(input.permissions);
  }
  return {
    uri: `${NIP55_NOSTRSIGNER_SCHEME}${encodeURIComponent(input.content ?? '')}`,
    extras,
    ...(input.packageName?.trim() ? { packageName: input.packageName.trim() } : {})
  };
}

export function buildNip55ContentResolverUri(
  signerPackage: string,
  type: Exclude<Nip55SignerMethod, 'get_public_key'>
): string {
  const authority = nonEmpty(signerPackage, 'NIP-55 signer package');
  const method = CONTENT_RESOLVER_METHODS[type];
  if (!method) throw new Error(`NIP-55 content resolver does not support ${type}`);
  return `content://${authority}.${method}`;
}

export function buildNip55ContentResolverSelectionArgs(input: {
  readonly type: Exclude<Nip55SignerMethod, 'get_public_key'>;
  readonly content: string;
  readonly pubkey?: string;
  readonly currentUser: string;
}): string[] {
  return [
    input.content,
    input.type === 'sign_event' || input.type === 'decrypt_zap_event' ? '' : (input.pubkey ?? ''),
    input.currentUser
  ];
}

export function stringifyNip55Permissions(permissions: readonly Nip55Permission[]): string {
  return JSON.stringify(
    permissions.map((permission) => ({
      type: permission.type,
      ...(permission.kind !== undefined ? { kind: permission.kind } : {})
    }))
  );
}

export function parseNip55Permissions(value: string): Nip55Permission[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((permission) => {
      if (!permission || typeof permission !== 'object') return [];
      const type = (permission as { type?: unknown }).type;
      const kind = (permission as { kind?: unknown }).kind;
      if (typeof type !== 'string' || !isNip55SignerMethod(type)) return [];
      if (kind !== undefined && (typeof kind !== 'number' || !Number.isInteger(kind) || kind < 0)) {
        return [];
      }
      return [
        {
          type,
          ...(typeof kind === 'number' ? { kind } : {})
        }
      ];
    });
  } catch {
    return [];
  }
}

export function parseNip55SignerResultUrl(value: string): Nip55SignerResult | null {
  const url = parseUrl(value);
  if (!url) return null;
  return parseNip55SignerResultParams(url.searchParams);
}

export function parseNip55SignerResultParams(
  params: URLSearchParams | Readonly<Record<string, string | null | undefined>>
): Nip55SignerResult {
  const get = (key: string): string | null =>
    params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null);
  const results = parseResultList(get('results'));
  return {
    result: nonEmptyOrNull(get('result')),
    event: nonEmptyOrNull(get('event')),
    id: nonEmptyOrNull(get('id')),
    packageName: nonEmptyOrNull(get('package')),
    results,
    rejected: get('rejected') !== null
  };
}

function parseResultList(value: string | null): unknown {
  if (!value?.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function setOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value?.trim()) params.set(key, value.trim());
}

function setOptionalExtra(
  extras: Record<string, string>,
  key: string,
  value: string | undefined
): void {
  if (value?.trim()) extras[key] = value.trim();
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function nonEmptyOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
