import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP85_USER_ASSERTION_KIND = 30382;
export const NIP85_EVENT_ASSERTION_KIND = 30383;
export const NIP85_ADDRESS_ASSERTION_KIND = 30384;
export const NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND = 30385;
export const NIP85_TRUSTED_PROVIDER_LIST_KIND = 10040;

export const NIP85_ASSERTION_KINDS = [
  NIP85_USER_ASSERTION_KIND,
  NIP85_EVENT_ASSERTION_KIND,
  NIP85_ADDRESS_ASSERTION_KIND,
  NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND
] as const;

export const NIP85_USER_RESULT_TAGS = [
  'followers',
  'rank',
  'first_created_at',
  'post_cnt',
  'reply_cnt',
  'reactions_cnt',
  'zap_amt_recd',
  'zap_amt_sent',
  'zap_cnt_recd',
  'zap_cnt_sent',
  'zap_avg_amt_day_recd',
  'zap_avg_amt_day_sent',
  'reports_cnt_recd',
  'reports_cnt_sent',
  't',
  'active_hours_start',
  'active_hours_end'
] as const;

export const NIP85_EVENT_RESULT_TAGS = [
  'rank',
  'comment_cnt',
  'quote_cnt',
  'repost_cnt',
  'reaction_cnt',
  'zap_cnt',
  'zap_amount'
] as const;

export const NIP85_ADDRESS_RESULT_TAGS = NIP85_EVENT_RESULT_TAGS;
export const NIP85_EXTERNAL_IDENTIFIER_RESULT_TAGS = [
  'rank',
  'comment_cnt',
  'reaction_cnt'
] as const;

export type Nip85AssertionKind = (typeof NIP85_ASSERTION_KINDS)[number];
export type Nip85SubjectType = 'user' | 'event' | 'address' | 'external';

export interface Nip85AssertionResultInput {
  readonly name: string;
  readonly value: string | number;
}

export interface Nip85AssertionResult {
  readonly name: string;
  readonly value: string;
  readonly numericValue: number | null;
}

export interface BuildNip85AssertionEventInput {
  readonly kind: Nip85AssertionKind;
  readonly subject: string;
  readonly results?: readonly Nip85AssertionResultInput[];
  readonly subjectRelayHint?: string | null;
  readonly identifierKinds?: readonly string[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export type BuildNip85SubjectAssertionInput = Omit<BuildNip85AssertionEventInput, 'kind'>;

export interface Nip85AssertionSnapshot {
  readonly kind: Nip85AssertionKind;
  readonly subjectType: Nip85SubjectType;
  readonly subject: string;
  readonly subjectRelayHint: string | null;
  readonly identifierKinds: readonly string[];
  readonly results: readonly Nip85AssertionResult[];
  readonly content: string;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip85TrustedProviderInput {
  readonly assertionKind: Nip85AssertionKind;
  readonly resultTag: string;
  readonly servicePubkey: string;
  readonly relayHint: string;
}

export interface Nip85TrustedProvider {
  readonly assertionKind: Nip85AssertionKind;
  readonly resultTag: string;
  readonly tagName: string;
  readonly servicePubkey: string;
  readonly relayHint: string | null;
}

export interface BuildNip85TrustedProviderListInput {
  readonly providers?: readonly Nip85TrustedProviderInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip85TrustedProviderListSnapshot {
  readonly providers: readonly Nip85TrustedProvider[];
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

const ASSERTION_KIND_SET = new Set<number>(NIP85_ASSERTION_KINDS);
const RESULT_TAGS_BY_KIND: Record<Nip85AssertionKind, readonly string[]> = {
  [NIP85_USER_ASSERTION_KIND]: NIP85_USER_RESULT_TAGS,
  [NIP85_EVENT_ASSERTION_KIND]: NIP85_EVENT_RESULT_TAGS,
  [NIP85_ADDRESS_ASSERTION_KIND]: NIP85_ADDRESS_RESULT_TAGS,
  [NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND]: NIP85_EXTERNAL_IDENTIFIER_RESULT_TAGS
};
const ALL_RESULT_TAGS = new Set<string>([
  ...NIP85_USER_RESULT_TAGS,
  ...NIP85_EVENT_RESULT_TAGS,
  ...NIP85_EXTERNAL_IDENTIFIER_RESULT_TAGS
]);
const ASSERTION_STRUCTURED_TAGS = new Set(['d', 'p', 'e', 'a', 'k', ...ALL_RESULT_TAGS]);

export function isNip85AssertionKind(kind: number): kind is Nip85AssertionKind {
  return ASSERTION_KIND_SET.has(kind);
}

export function nip85SubjectTypeForKind(kind: Nip85AssertionKind): Nip85SubjectType {
  if (kind === NIP85_USER_ASSERTION_KIND) return 'user';
  if (kind === NIP85_EVENT_ASSERTION_KIND) return 'event';
  if (kind === NIP85_ADDRESS_ASSERTION_KIND) return 'address';
  return 'external';
}

export function isNip85ResultTagAllowed(kind: Nip85AssertionKind, tagName: string): boolean {
  return RESULT_TAGS_BY_KIND[kind].includes(tagName);
}

export function buildNip85UserAssertion(input: BuildNip85SubjectAssertionInput): EventParameters {
  return buildNip85AssertionEvent({ ...input, kind: NIP85_USER_ASSERTION_KIND });
}

export function buildNip85EventAssertion(input: BuildNip85SubjectAssertionInput): EventParameters {
  return buildNip85AssertionEvent({ ...input, kind: NIP85_EVENT_ASSERTION_KIND });
}

export function buildNip85AddressAssertion(
  input: BuildNip85SubjectAssertionInput
): EventParameters {
  return buildNip85AssertionEvent({ ...input, kind: NIP85_ADDRESS_ASSERTION_KIND });
}

export function buildNip85ExternalIdentifierAssertion(
  input: BuildNip85SubjectAssertionInput
): EventParameters {
  return buildNip85AssertionEvent({
    ...input,
    kind: NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND
  });
}

export function buildNip85AssertionEvent(input: BuildNip85AssertionEventInput): EventParameters {
  assertNip85AssertionKind(input.kind);
  const subject = normalizeNonEmpty(input.subject, 'assertion subject');
  const tags: string[][] = [['d', subject]];
  const subjectHintTag = buildNip85SubjectRelayHintTag(input.kind, {
    subject,
    relayHint: input.subjectRelayHint
  });
  if (subjectHintTag) tags.push(subjectHintTag);
  if (input.kind === NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND) {
    tags.push(...(input.identifierKinds ?? []).map(buildNip85IdentifierKindTag));
  }
  tags.push(...(input.results ?? []).map((result) => buildNip85ResultTag(input.kind, result)));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !ASSERTION_STRUCTURED_TAGS.has(tag[0])));

  return {
    kind: input.kind,
    content: input.content ?? '',
    tags
  };
}

export function buildNip85ResultTag(
  kind: Nip85AssertionKind,
  input: Nip85AssertionResultInput
): string[] {
  assertNip85ResultTagAllowed(kind, input.name);
  return [input.name, normalizeResultValue(input.value, input.name)];
}

export function buildNip85IdentifierKindTag(identifierKind: string): string[] {
  return ['k', normalizeNonEmpty(identifierKind, 'NIP-73 identifier kind')];
}

export function buildNip85TrustedProviderList(
  input: BuildNip85TrustedProviderListInput = {}
): EventParameters {
  const providerTags = (input.providers ?? []).map(buildNip85TrustedProviderTag);
  return {
    kind: NIP85_TRUSTED_PROVIDER_LIST_KIND,
    content: input.content ?? '',
    tags: [
      ...providerTags,
      ...copyTags(input.tags ?? []).filter((tag) => !parseNip85TrustedProviderTag(tag))
    ]
  };
}

export function buildNip85TrustedProviderTag(input: Nip85TrustedProviderInput): string[] {
  assertNip85AssertionKind(input.assertionKind);
  assertNip85ResultTagAllowed(input.assertionKind, input.resultTag);
  return [
    `${input.assertionKind}:${input.resultTag}`,
    normalizeNonEmpty(input.servicePubkey, 'trusted provider service pubkey'),
    normalizeNonEmpty(input.relayHint, 'trusted provider relay hint')
  ];
}

export function stringifyNip85TrustedProviderTags(
  providers: readonly Nip85TrustedProviderInput[]
): string {
  return JSON.stringify(providers.map(buildNip85TrustedProviderTag));
}

export function parseNip85AssertionEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip85AssertionSnapshot | null {
  if (!isNip85AssertionKind(event.kind)) return null;
  const subject = firstTagValue(event.tags, 'd');
  if (!subject) return null;

  return {
    kind: event.kind,
    subjectType: nip85SubjectTypeForKind(event.kind),
    subject,
    subjectRelayHint: parseNip85SubjectRelayHint(event.kind, subject, event.tags),
    identifierKinds:
      event.kind === NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND
        ? parseTagValues(event.tags, 'k')
        : [],
    results: parseNip85AssertionResults(event.kind, event.tags),
    content: event.content,
    customTags: copyTags(event.tags).filter((tag) => !ASSERTION_STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip85AssertionResults(
  kind: Nip85AssertionKind,
  tags: readonly (readonly string[])[]
): Nip85AssertionResult[] {
  return tags.flatMap((tag) => {
    const tagName = tag[0];
    const value = tag[1]?.trim();
    if (!value || !isNip85ResultTagAllowed(kind, tagName)) return [];
    return [{ name: tagName, value, numericValue: parseInteger(value) }];
  });
}

export function parseNip85TrustedProviderList(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip85TrustedProviderListSnapshot | null {
  if (event.kind !== NIP85_TRUSTED_PROVIDER_LIST_KIND) return null;
  return {
    providers: parseNip85TrustedProviderTags(event.tags),
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    customTags: copyTags(event.tags).filter((tag) => !parseNip85TrustedProviderTag(tag))
  };
}

export function parseNip85TrustedProviderTags(
  tags: readonly (readonly string[])[]
): Nip85TrustedProvider[] {
  return tags.flatMap((tag) => {
    const provider = parseNip85TrustedProviderTag(tag);
    return provider ? [provider] : [];
  });
}

export function parseNip85TrustedProviderTag(tag: readonly string[]): Nip85TrustedProvider | null {
  const [kindText, resultTag, ...extra] = tag[0]?.split(':') ?? [];
  if (extra.length > 0 || !kindText || !resultTag) return null;
  const kind = parseKind(kindText);
  if (kind === null || !isNip85AssertionKind(kind) || !isNip85ResultTagAllowed(kind, resultTag)) {
    return null;
  }
  const servicePubkey = tag[1]?.trim();
  if (!servicePubkey) return null;
  return {
    assertionKind: kind,
    resultTag,
    tagName: `${kind}:${resultTag}`,
    servicePubkey,
    relayHint: tag[2]?.trim() || null
  };
}

export function parseNip85TrustedProviderTagsJson(
  plaintext: string
): Nip85TrustedProvider[] | null {
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return null;
    const tags: string[][] = [];
    for (const item of parsed) {
      if (!Array.isArray(item) || item.some((value) => typeof value !== 'string')) return null;
      tags.push([...item]);
    }
    return parseNip85TrustedProviderTags(tags);
  } catch {
    return null;
  }
}

function buildNip85SubjectRelayHintTag(
  kind: Nip85AssertionKind,
  input: { readonly subject: string; readonly relayHint?: string | null }
): string[] | null {
  const relayHint = input.relayHint?.trim();
  if (!relayHint) return null;
  if (kind === NIP85_USER_ASSERTION_KIND) return ['p', input.subject, relayHint];
  if (kind === NIP85_EVENT_ASSERTION_KIND) return ['e', input.subject, relayHint];
  if (kind === NIP85_ADDRESS_ASSERTION_KIND) return ['a', input.subject, relayHint];
  return null;
}

function parseNip85SubjectRelayHint(
  kind: Nip85AssertionKind,
  subject: string,
  tags: readonly (readonly string[])[]
): string | null {
  const tagName =
    kind === NIP85_USER_ASSERTION_KIND
      ? 'p'
      : kind === NIP85_EVENT_ASSERTION_KIND
        ? 'e'
        : kind === NIP85_ADDRESS_ASSERTION_KIND
          ? 'a'
          : null;
  if (!tagName) return null;
  return tags.find((tag) => tag[0] === tagName && tag[1]?.trim() === subject)?.[2]?.trim() || null;
}

function assertNip85AssertionKind(kind: number): asserts kind is Nip85AssertionKind {
  if (!isNip85AssertionKind(kind)) {
    throw new Error(`NIP-85 unsupported assertion kind: ${kind}`);
  }
}

function assertNip85ResultTagAllowed(kind: Nip85AssertionKind, tagName: string): void {
  if (!isNip85ResultTagAllowed(kind, tagName)) {
    throw new Error(`NIP-85 unsupported result tag ${tagName} for kind:${kind}`);
  }
}

function normalizeResultValue(value: string | number, label: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`NIP-85 ${label} result must be a safe integer`);
    }
    return String(value);
  }
  return normalizeNonEmpty(value, `${label} result`);
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

function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseKind(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-85 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
