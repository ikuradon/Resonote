import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP56_REPORT_KIND = 1984;

export const NIP56_REPORT_TYPES = [
  'nudity',
  'malware',
  'profanity',
  'illegal',
  'spam',
  'impersonation',
  'other'
] as const;

export type Nip56ReportType = (typeof NIP56_REPORT_TYPES)[number];
export type Nip56ReportTargetKind = 'profile' | 'event' | 'blob';

export interface Nip56ReportTarget {
  readonly tagName: 'p' | 'e' | 'x';
  readonly targetKind: Nip56ReportTargetKind;
  readonly value: string;
  readonly reportType: Nip56ReportType;
}

export interface Nip56ReportSnapshot {
  readonly reporterPubkey: string | null;
  readonly createdAt: number | null;
  readonly content: string;
  readonly targets: readonly Nip56ReportTarget[];
  readonly reportedPubkeys: readonly string[];
  readonly mediaServers: readonly string[];
  readonly labelTags: readonly string[][];
}

export type BuildNip56ReportInput =
  | {
      readonly targetKind: 'profile';
      readonly pubkey: string;
      readonly reportType: Nip56ReportType;
      readonly content?: string;
      readonly tags?: readonly (readonly string[])[];
    }
  | {
      readonly targetKind: 'event';
      readonly pubkey: string;
      readonly eventId: string;
      readonly reportType: Nip56ReportType;
      readonly content?: string;
      readonly tags?: readonly (readonly string[])[];
    }
  | {
      readonly targetKind: 'blob';
      readonly blobHash: string;
      readonly eventId: string;
      readonly reportType: Nip56ReportType;
      readonly pubkey?: string;
      readonly mediaServers?: readonly string[];
      readonly content?: string;
      readonly tags?: readonly (readonly string[])[];
    };

const REPORT_TYPES = new Set<string>(NIP56_REPORT_TYPES);

export function isNip56ReportType(value: string): value is Nip56ReportType {
  return REPORT_TYPES.has(value);
}

export function buildNip56ReportEvent(input: BuildNip56ReportInput): EventParameters {
  const reportType = assertNip56ReportType(input.reportType);
  const tags: string[][] = [];

  if (input.targetKind === 'profile') {
    tags.push(['p', nonEmpty(input.pubkey, 'NIP-56 profile report pubkey'), reportType]);
  } else if (input.targetKind === 'event') {
    tags.push(['e', nonEmpty(input.eventId, 'NIP-56 event report id'), reportType]);
    tags.push(['p', nonEmpty(input.pubkey, 'NIP-56 event report pubkey')]);
  } else {
    tags.push(['x', nonEmpty(input.blobHash, 'NIP-56 blob report hash'), reportType]);
    tags.push(['e', nonEmpty(input.eventId, 'NIP-56 blob report event id'), reportType]);
    if (input.pubkey?.trim()) tags.push(['p', input.pubkey.trim()]);
    for (const server of input.mediaServers ?? []) {
      const normalized = server.trim();
      if (normalized) tags.push(['server', normalized]);
    }
  }

  tags.push(...copyTags(input.tags ?? []));

  return {
    kind: NIP56_REPORT_KIND,
    content: input.content ?? '',
    tags
  };
}

export function parseNip56ReportEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip56ReportSnapshot | null {
  if (event.kind !== NIP56_REPORT_KIND) return null;

  const targets = parseNip56ReportTargets(event.tags);
  if (targets.length === 0) return null;

  return {
    reporterPubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    content: event.content,
    targets,
    reportedPubkeys: parseReportedPubkeys(event.tags),
    mediaServers: parseMediaServers(event.tags),
    labelTags: event.tags.filter((tag) => tag[0] === 'l' || tag[0] === 'L').map((tag) => [...tag])
  };
}

export function parseNip56ReportTargets(tags: readonly (readonly string[])[]): Nip56ReportTarget[] {
  return tags.flatMap((tag) => {
    const tagName = tag[0];
    if (tagName !== 'p' && tagName !== 'e' && tagName !== 'x') return [];
    const value = tag[1]?.trim();
    const reportType = tag[2]?.trim();
    if (!value || !reportType || !isNip56ReportType(reportType)) return [];
    return [
      {
        tagName,
        targetKind: tagName === 'p' ? 'profile' : tagName === 'e' ? 'event' : 'blob',
        value,
        reportType
      }
    ];
  });
}

function parseReportedPubkeys(tags: readonly (readonly string[])[]): string[] {
  return [
    ...new Set(
      tags.filter((tag) => tag[0] === 'p' && Boolean(tag[1]?.trim())).map((tag) => tag[1].trim())
    )
  ];
}

function parseMediaServers(tags: readonly (readonly string[])[]): string[] {
  return [
    ...new Set(
      tags
        .filter((tag) => tag[0] === 'server' && Boolean(tag[1]?.trim()))
        .map((tag) => tag[1].trim())
    )
  ];
}

function assertNip56ReportType(value: string): Nip56ReportType {
  if (!isNip56ReportType(value)) {
    throw new Error(`Unsupported NIP-56 report type: ${value}`);
  }
  return value;
}

function nonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
