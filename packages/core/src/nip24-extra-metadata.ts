import type { EventParameters } from 'nostr-typedef';

export const NIP24_PROFILE_METADATA_KIND = 0;
export const NIP24_CONTACT_LIST_KIND = 3;
export const NIP24_WEB_URL_TAG = 'r';
export const NIP24_EXTERNAL_ID_TAG = 'i';
export const NIP24_TITLE_TAG = 'title';
export const NIP24_HASHTAG_TAG = 't';

export interface Nip24Birthday {
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
}

export interface Nip24ProfileMetadata {
  readonly name?: string;
  readonly displayName?: string;
  readonly picture?: string;
  readonly about?: string;
  readonly nip05?: string;
  readonly website?: string;
  readonly banner?: string;
  readonly bot?: boolean;
  readonly birthday?: Nip24Birthday;
  readonly deprecated: {
    readonly displayName?: string;
    readonly username?: string;
  };
  readonly raw: Record<string, unknown>;
}

export interface BuildNip24ProfileMetadataInput {
  readonly name?: string | null;
  readonly displayName?: string | null;
  readonly picture?: string | null;
  readonly about?: string | null;
  readonly nip05?: string | null;
  readonly website?: string | null;
  readonly banner?: string | null;
  readonly bot?: boolean | null;
  readonly birthday?: Nip24Birthday | null;
  readonly extra?: Record<string, unknown>;
}

export interface Nip24DeprecatedRelayEntry {
  readonly relay: string;
  readonly read: boolean;
  readonly write: boolean;
}

export interface Nip24ExternalIdTag {
  readonly value: string;
  readonly hint: string | null;
}

export interface Nip24GenericTags {
  readonly webUrls: string[];
  readonly externalIds: Nip24ExternalIdTag[];
  readonly titles: string[];
  readonly hashtags: string[];
  readonly invalidHashtags: string[];
}

export function parseNip24ProfileMetadataJson(content: string): Nip24ProfileMetadata | null {
  const raw = parseJsonObject(content);
  if (!raw) return null;

  return {
    name: optionalString(raw.name),
    displayName: optionalString(raw.display_name),
    picture: optionalString(raw.picture),
    about: optionalString(raw.about),
    nip05: optionalString(raw.nip05),
    website: optionalString(raw.website),
    banner: optionalString(raw.banner),
    bot: typeof raw.bot === 'boolean' ? raw.bot : undefined,
    birthday: parseNip24Birthday(raw.birthday) ?? undefined,
    deprecated: {
      displayName: optionalString(raw.displayName),
      username: optionalString(raw.username)
    },
    raw
  };
}

export function buildNip24ProfileMetadata(
  input: BuildNip24ProfileMetadataInput
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...(input.extra ?? {}) };
  assignOptionalString(metadata, 'name', input.name);
  assignOptionalString(metadata, 'display_name', input.displayName);
  assignOptionalString(metadata, 'picture', input.picture);
  assignOptionalString(metadata, 'about', input.about);
  assignOptionalString(metadata, 'nip05', input.nip05);
  assignOptionalString(metadata, 'website', input.website);
  assignOptionalString(metadata, 'banner', input.banner);
  if (typeof input.bot === 'boolean') metadata.bot = input.bot;
  if (input.birthday) metadata.birthday = normalizeNip24Birthday(input.birthday);
  delete metadata.displayName;
  delete metadata.username;
  return metadata;
}

export function stringifyNip24ProfileMetadata(input: BuildNip24ProfileMetadataInput): string {
  return JSON.stringify(buildNip24ProfileMetadata(input));
}

export function parseNip24DeprecatedFollowRelayMapJson(
  content: string
): Nip24DeprecatedRelayEntry[] | null {
  const raw = parseJsonObject(content);
  if (!raw) return null;

  const entries: Nip24DeprecatedRelayEntry[] = [];
  for (const [relay, value] of Object.entries(raw)) {
    if (!relay.trim() || !isRecord(value)) continue;
    const read = typeof value.read === 'boolean' ? value.read : false;
    const write = typeof value.write === 'boolean' ? value.write : false;
    if (typeof value.read === 'boolean' || typeof value.write === 'boolean') {
      entries.push({ relay, read, write });
    }
  }
  return entries.length > 0 ? entries : null;
}

export function buildNip24WebUrlTag(url: string): string[] {
  return [NIP24_WEB_URL_TAG, normalizeNonEmpty(url, 'web URL')];
}

export function buildNip24ExternalIdTag(value: string, hint?: string | null): string[] {
  const normalizedValue = normalizeNonEmpty(value, 'external id');
  const normalizedHint = hint?.trim();
  return normalizedHint
    ? [NIP24_EXTERNAL_ID_TAG, normalizedValue, normalizedHint]
    : [NIP24_EXTERNAL_ID_TAG, normalizedValue];
}

export function buildNip24TitleTag(title: string): string[] {
  return [NIP24_TITLE_TAG, normalizeNonEmpty(title, 'title')];
}

export function buildNip24HashtagTag(hashtag: string): string[] {
  const normalized = normalizeNip24Hashtag(hashtag);
  return [NIP24_HASHTAG_TAG, normalized];
}

export function normalizeNip24Hashtag(hashtag: string): string {
  const normalized = hashtag.trim().replace(/^#/, '').toLowerCase();
  if (!normalized) throw new Error('NIP-24 hashtag must not be empty');
  return normalized;
}

export function parseNip24GenericTags(event: Pick<EventParameters, 'tags'>): Nip24GenericTags {
  const webUrls: string[] = [];
  const externalIds: Nip24ExternalIdTag[] = [];
  const titles: string[] = [];
  const hashtags: string[] = [];
  const invalidHashtags: string[] = [];

  for (const tag of event.tags ?? []) {
    const value = tag[1]?.trim();
    if (!value) continue;
    if (tag[0] === NIP24_WEB_URL_TAG) {
      webUrls.push(value);
      continue;
    }
    if (tag[0] === NIP24_EXTERNAL_ID_TAG) {
      externalIds.push({ value, hint: tag[2]?.trim() || null });
      continue;
    }
    if (tag[0] === NIP24_TITLE_TAG) {
      titles.push(value);
      continue;
    }
    if (tag[0] === NIP24_HASHTAG_TAG) {
      if (value === value.toLowerCase()) {
        hashtags.push(value);
      } else {
        invalidHashtags.push(value);
      }
    }
  }

  return { webUrls, externalIds, titles, hashtags, invalidHashtags };
}

export function isNip24ProfileMetadataEvent(event: Pick<EventParameters, 'kind'>): boolean {
  return event.kind === NIP24_PROFILE_METADATA_KIND;
}

export function isNip24ContactListEvent(event: Pick<EventParameters, 'kind'>): boolean {
  return event.kind === NIP24_CONTACT_LIST_KIND;
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function assignOptionalString(
  metadata: Record<string, unknown>,
  key: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) metadata[key] = normalized;
}

function parseNip24Birthday(value: unknown): Nip24Birthday | null {
  if (!isRecord(value)) return null;
  const birthday = normalizeNip24Birthday({
    year: value.year,
    month: value.month,
    day: value.day
  });
  return Object.keys(birthday).length > 0 ? birthday : null;
}

function normalizeNip24Birthday(value: {
  readonly year?: unknown;
  readonly month?: unknown;
  readonly day?: unknown;
}): Nip24Birthday {
  const birthday: { year?: number; month?: number; day?: number } = {};
  if (isSafeIntegerInRange(value.year, 0, 9999)) birthday.year = value.year;
  if (isSafeIntegerInRange(value.month, 1, 12)) birthday.month = value.month;
  if (isSafeIntegerInRange(value.day, 1, 31)) birthday.day = value.day;
  return birthday;
}

function isSafeIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-24 ${label} must not be empty`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
