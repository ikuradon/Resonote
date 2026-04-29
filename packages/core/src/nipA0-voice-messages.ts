import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

import { buildNip92ImetaTag, parseNip92ImetaTag } from './nip92-media-attachments.js';

export const NIPA0_ROOT_VOICE_MESSAGE_KIND = 1222;
export const NIPA0_REPLY_VOICE_MESSAGE_KIND = 1244;
export const NIPA0_VOICE_MESSAGE_KINDS = [
  NIPA0_ROOT_VOICE_MESSAGE_KIND,
  NIPA0_REPLY_VOICE_MESSAGE_KIND
] as const;
export const NIPA0_RECOMMENDED_MEDIA_TYPE = 'audio/mp4';
export const NIPA0_RECOMMENDED_MAX_DURATION_SECONDS = 60;

export type NipA0VoiceMessageKind = (typeof NIPA0_VOICE_MESSAGE_KINDS)[number];
export type NipA0RootReferenceTagName = 'E' | 'A' | 'I';
export type NipA0ParentReferenceTagName = 'e' | 'a' | 'i';

export interface NipA0VoicePreviewInput {
  readonly mediaType?: string | null;
  readonly waveform?: readonly (number | string)[];
  readonly duration?: number | string | null;
}

export interface NipA0VoicePreview {
  readonly mediaType: string | null;
  readonly waveform: readonly number[];
  readonly duration: number | null;
  readonly tag: readonly string[] | null;
}

export interface NipA0RootReferenceInput {
  readonly tagName: NipA0RootReferenceTagName;
  readonly value: string;
  readonly kind: number | string;
  readonly relayHint?: string | null;
  readonly pubkey?: string | null;
  readonly pubkeyRelayHint?: string | null;
}

export interface NipA0ParentReferenceInput {
  readonly tagName: NipA0ParentReferenceTagName;
  readonly value: string;
  readonly kind: number | string;
  readonly relayHint?: string | null;
  readonly pubkey?: string | null;
  readonly pubkeyRelayHint?: string | null;
}

export interface NipA0Nip22Reference {
  readonly tagName: NipA0RootReferenceTagName | NipA0ParentReferenceTagName;
  readonly value: string;
  readonly kind: string;
  readonly relayHint: string | null;
  readonly pubkey: string | null;
}

export interface BuildNipA0VoiceMessageInput extends NipA0VoicePreviewInput {
  readonly audioUrl: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNipA0VoiceReplyInput extends NipA0VoicePreviewInput {
  readonly audioUrl: string;
  readonly root: NipA0RootReferenceInput;
  readonly parent: NipA0ParentReferenceInput;
  readonly tags?: readonly (readonly string[])[];
}

export interface NipA0VoiceMessageSnapshot {
  readonly kind: NipA0VoiceMessageKind;
  readonly audioUrl: string;
  readonly preview: NipA0VoicePreview | null;
  readonly root: NipA0Nip22Reference | null;
  readonly parent: NipA0Nip22Reference | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNipA0VoiceMessageFilterInput {
  readonly kinds?: readonly NipA0VoiceMessageKind[];
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

const VOICE_KIND_SET = new Set<number>(NIPA0_VOICE_MESSAGE_KINDS);
const ROOT_TAGS = new Set<string>(['E', 'A', 'I']);
const PARENT_TAGS = new Set<string>(['e', 'a', 'i']);
const STRUCTURED_REPLY_TAGS = new Set(['E', 'A', 'I', 'K', 'P', 'e', 'a', 'i', 'k', 'p']);

export function isNipA0VoiceMessageKind(kind: number): kind is NipA0VoiceMessageKind {
  return VOICE_KIND_SET.has(kind);
}

export function buildNipA0VoiceMessage(input: BuildNipA0VoiceMessageInput): EventParameters {
  const audioUrl = normalizeNonEmpty(input.audioUrl, 'audio URL');
  return {
    kind: NIPA0_ROOT_VOICE_MESSAGE_KIND,
    content: audioUrl,
    tags: [...buildPreviewTags(audioUrl, input), ...copyTags(input.tags ?? [])]
  };
}

export function buildNipA0VoiceReply(input: BuildNipA0VoiceReplyInput): EventParameters {
  const audioUrl = normalizeNonEmpty(input.audioUrl, 'audio URL');
  return {
    kind: NIPA0_REPLY_VOICE_MESSAGE_KIND,
    content: audioUrl,
    tags: [
      ...buildNipA0RootReferenceTags(input.root),
      ...buildNipA0ParentReferenceTags(input.parent),
      ...buildPreviewTags(audioUrl, input),
      ...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_REPLY_TAGS.has(tag[0]))
    ]
  };
}

export function buildNipA0VoiceImetaTag(
  input: { readonly audioUrl: string } & NipA0VoicePreviewInput
): string[] {
  const fields = [];
  const waveform = normalizeOptionalWaveform(input.waveform);
  if (waveform) fields.push({ name: 'waveform', value: waveform.join(' ') });
  const duration = normalizeOptionalDuration(input.duration);
  if (duration) fields.push({ name: 'duration', value: duration });
  return buildNip92ImetaTag({
    url: input.audioUrl,
    mediaType: input.mediaType,
    fields
  });
}

export function buildNipA0RootReferenceTags(input: NipA0RootReferenceInput): string[][] {
  const tag = buildNip22ReferenceTag(input.tagName, input.value, input.relayHint, input.pubkey);
  const tags = [tag, ['K', normalizeKind(input.kind, 'root kind')]];
  const pubkey = input.pubkey?.trim();
  if (pubkey) {
    const relayHint = input.pubkeyRelayHint?.trim();
    tags.push(relayHint ? ['P', pubkey, relayHint] : ['P', pubkey]);
  }
  return tags;
}

export function buildNipA0ParentReferenceTags(input: NipA0ParentReferenceInput): string[][] {
  const tag = buildNip22ReferenceTag(input.tagName, input.value, input.relayHint, input.pubkey);
  const tags = [tag, ['k', normalizeKind(input.kind, 'parent kind')]];
  const pubkey = input.pubkey?.trim();
  if (pubkey) {
    const relayHint = input.pubkeyRelayHint?.trim();
    tags.push(relayHint ? ['p', pubkey, relayHint] : ['p', pubkey]);
  }
  return tags;
}

export function buildNipA0VoiceMessageFilter(
  input: BuildNipA0VoiceMessageFilterInput = {}
): Filter {
  const kinds = input.kinds?.length ? input.kinds : NIPA0_VOICE_MESSAGE_KINDS;
  const filter: Filter = {
    kinds: kinds.map((kind) => {
      assertVoiceKind(kind);
      return kind;
    })
  };
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeNonEmpty(author, 'author pubkey'));
  }
  if (input.since !== undefined && input.since !== null) {
    filter.since = normalizeTimestamp(input.since, 'filter since');
  }
  if (input.until !== undefined && input.until !== null) {
    filter.until = normalizeTimestamp(input.until, 'filter until');
  }
  if (input.limit !== undefined && input.limit !== null) {
    filter.limit = normalizePositiveInteger(input.limit, 'filter limit');
  }
  return filter;
}

export function parseNipA0VoiceMessage(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): NipA0VoiceMessageSnapshot | null {
  if (!isNipA0VoiceMessageKind(event.kind)) return null;
  const audioUrl = event.content.trim();
  if (!audioUrl) return null;
  const root =
    event.kind === NIPA0_REPLY_VOICE_MESSAGE_KIND ? parseRootReference(event.tags) : null;
  const parent =
    event.kind === NIPA0_REPLY_VOICE_MESSAGE_KIND ? parseParentReference(event.tags) : null;
  if (event.kind === NIPA0_REPLY_VOICE_MESSAGE_KIND && (!root || !parent)) return null;
  return {
    kind: event.kind,
    audioUrl,
    preview: parseNipA0VoicePreview(event.tags, audioUrl),
    root,
    parent,
    customTags: copyTags(event.tags).filter((tag) => !isStructuredTag(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNipA0VoicePreview(
  tags: readonly (readonly string[])[],
  audioUrl: string
): NipA0VoicePreview | null {
  const imeta = tags.map(parseNip92ImetaTag).find((attachment) => attachment?.url === audioUrl);
  if (!imeta) return null;
  const waveform = firstImetaFieldValue(imeta.fields, 'waveform');
  const duration = firstImetaFieldValue(imeta.fields, 'duration');
  return {
    mediaType: imeta.mediaType,
    waveform: parseWaveform(waveform),
    duration: parseDuration(duration),
    tag: imeta.tag
  };
}

function buildPreviewTags(audioUrl: string, input: NipA0VoicePreviewInput): string[][] {
  if (!hasPreviewMetadata(input)) return [];
  return [buildNipA0VoiceImetaTag({ ...input, audioUrl })];
}

function hasPreviewMetadata(input: NipA0VoicePreviewInput): boolean {
  return Boolean(
    input.mediaType?.trim() ||
    input.waveform?.length ||
    (input.duration !== undefined && input.duration !== null && String(input.duration).trim())
  );
}

function buildNip22ReferenceTag(
  tagName: NipA0RootReferenceTagName | NipA0ParentReferenceTagName,
  value: string,
  relayHint: string | null | undefined,
  pubkey: string | null | undefined
): string[] {
  const tag = [tagName, normalizeNonEmpty(value, `${tagName} reference`)];
  const normalizedRelay = relayHint?.trim();
  const normalizedPubkey = pubkey?.trim();
  if (normalizedPubkey) return [tagName, tag[1], normalizedRelay || '', normalizedPubkey];
  if (normalizedRelay) return [tagName, tag[1], normalizedRelay];
  return tag;
}

function parseRootReference(tags: readonly (readonly string[])[]): NipA0Nip22Reference | null {
  const tag = tags.find((candidate) => ROOT_TAGS.has(candidate[0]));
  const kind = firstTagValue(tags, 'K');
  if (!tag || !kind || !tag[1]?.trim()) return null;
  return {
    tagName: tag[0] as NipA0RootReferenceTagName,
    value: tag[1].trim(),
    kind,
    relayHint: tag[2]?.trim() || null,
    pubkey: tag[3]?.trim() || firstTagValue(tags, 'P')
  };
}

function parseParentReference(tags: readonly (readonly string[])[]): NipA0Nip22Reference | null {
  const tag = tags.find((candidate) => PARENT_TAGS.has(candidate[0]));
  const kind = firstTagValue(tags, 'k');
  if (!tag || !kind || !tag[1]?.trim()) return null;
  return {
    tagName: tag[0] as NipA0ParentReferenceTagName,
    value: tag[1].trim(),
    kind,
    relayHint: tag[2]?.trim() || null,
    pubkey: tag[3]?.trim() || firstTagValue(tags, 'p')
  };
}

function firstImetaFieldValue(
  fields: readonly { readonly name: string; readonly value: string }[],
  name: string
): string | null {
  return fields.find((field) => field.name === name)?.value ?? null;
}

function normalizeOptionalWaveform(
  values: readonly (number | string)[] | undefined
): number[] | null {
  if (!values?.length) return null;
  return values.map((value) => normalizeWaveformValue(value));
}

function normalizeWaveformValue(value: number | string): number {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('NIP-A0 waveform values must be integers from 0 to 100');
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('NIP-A0 waveform values must be integers from 0 to 100');
  }
  return parsed;
}

function parseWaveform(value: string | null): number[] {
  if (!value) return [];
  return value.split(/\s+/).flatMap((part) => {
    if (!/^\d+$/.test(part)) return [];
    const parsed = Number(part);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 100 ? [parsed] : [];
  });
}

function normalizeOptionalDuration(value: number | string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('NIP-A0 duration must be a non-negative finite number of seconds');
  }
  return normalized;
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function isStructuredTag(tagName: string): boolean {
  return tagName === 'imeta' || STRUCTURED_REPLY_TAGS.has(tagName);
}

function assertVoiceKind(kind: number): asserts kind is NipA0VoiceMessageKind {
  if (!isNipA0VoiceMessageKind(kind)) {
    throw new Error(`Unsupported NIP-A0 voice message kind: ${kind}`);
  }
}

function normalizeKind(value: number | string, label: string): string {
  const normalized = String(value).trim();
  if (!/^\d+$|^[A-Za-z][A-Za-z0-9:._-]*$/.test(normalized)) {
    throw new Error(`NIP-A0 ${label} must not be empty`);
  }
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-A0 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-A0 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-A0 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
