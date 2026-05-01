import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP32_LABEL_KIND = 1985;
export const NIP32_NAMESPACE_TAG = 'L';
export const NIP32_LABEL_TAG = 'l';
export const NIP32_IMPLIED_NAMESPACE = 'ugc';

export type Nip32LabelTargetTagName = 'e' | 'p' | 'a' | 'r' | 't';

export interface Nip32LabelInput {
  readonly value: string;
  readonly namespace?: string | null;
}

export interface Nip32LabelTargetInput {
  readonly tagName: Nip32LabelTargetTagName;
  readonly value: string;
  readonly relayHint?: string | null;
}

export interface Nip32Label {
  readonly value: string;
  readonly namespace: string;
  readonly namespaceDeclared: boolean;
}

export interface Nip32LabelTarget {
  readonly tagName: Nip32LabelTargetTagName;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface Nip32LabelEventSnapshot {
  readonly labelerPubkey: string | null;
  readonly createdAt: number | null;
  readonly content: string;
  readonly namespaces: readonly string[];
  readonly labels: readonly Nip32Label[];
  readonly targets: readonly Nip32LabelTarget[];
}

export interface BuildNip32LabelEventInput {
  readonly labels: readonly Nip32LabelInput[];
  readonly targets: readonly Nip32LabelTargetInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

const TARGET_TAGS = new Set<string>(['e', 'p', 'a', 'r', 't']);

export function buildNip32NamespaceTag(namespace: string): string[] {
  return [NIP32_NAMESPACE_TAG, normalizeNonEmpty(namespace, 'namespace')];
}

export function buildNip32LabelTag(input: Nip32LabelInput): string[] {
  const value = normalizeNonEmpty(input.value, 'label');
  const namespace = normalizeNamespace(input.namespace);
  return [NIP32_LABEL_TAG, value, namespace];
}

export function buildNip32LabelTargetTag(input: Nip32LabelTargetInput): string[] {
  if (!isNip32LabelTargetTagName(input.tagName)) {
    throw new Error(`Unsupported NIP-32 label target tag: ${input.tagName}`);
  }
  const value = normalizeNonEmpty(input.value, 'target value');
  const relayHint = input.relayHint?.trim();
  return relayHint && (input.tagName === 'e' || input.tagName === 'p')
    ? [input.tagName, value, relayHint]
    : [input.tagName, value];
}

export function buildNip32LabelEvent(input: BuildNip32LabelEventInput): EventParameters {
  if (input.labels.length === 0) throw new Error('NIP-32 label event requires at least one label');
  if (input.targets.length === 0)
    throw new Error('NIP-32 label event requires at least one target');

  const labelTags = input.labels.map(buildNip32LabelTag);
  const namespaces = unique(labelTags.map((tag) => tag[2]));
  const tags = [
    ...namespaces.map(buildNip32NamespaceTag),
    ...labelTags,
    ...input.targets.map(buildNip32LabelTargetTag),
    ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIP32_NAMESPACE_TAG)
  ];

  return {
    kind: NIP32_LABEL_KIND,
    content: input.content ?? '',
    tags
  };
}

export function parseNip32LabelEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip32LabelEventSnapshot | null {
  if (event.kind !== NIP32_LABEL_KIND) return null;
  const labels = parseNip32Labels(event.tags);
  const targets = parseNip32LabelTargets(event.tags);
  if (labels.length === 0 || targets.length === 0) return null;

  return {
    labelerPubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    content: event.content,
    namespaces: parseNip32Namespaces(event.tags),
    labels,
    targets
  };
}

export function parseNip32SelfReportedLabels(
  event: Pick<NostrEvent, 'kind' | 'tags'>
): Nip32Label[] {
  if (event.kind === NIP32_LABEL_KIND) return [];
  return parseNip32Labels(event.tags);
}

export function appendNip32SelfLabelTags(
  tags: readonly (readonly string[])[],
  labels: readonly Nip32LabelInput[]
): string[][] {
  if (labels.length === 0) return copyTags(tags);
  const labelTags = labels.map(buildNip32LabelTag);
  const existingNamespaces = new Set(parseNip32Namespaces(tags));
  const namespaceTags = unique(labelTags.map((tag) => tag[2]))
    .filter((namespace) => !existingNamespaces.has(namespace))
    .map(buildNip32NamespaceTag);
  return [...copyTags(tags), ...namespaceTags, ...labelTags];
}

export function parseNip32Namespaces(tags: readonly (readonly string[])[]): string[] {
  return unique(
    tags
      .filter((tag) => tag[0] === NIP32_NAMESPACE_TAG)
      .map((tag) => tag[1]?.trim())
      .filter((value): value is string => Boolean(value))
  );
}

export function parseNip32Labels(tags: readonly (readonly string[])[]): Nip32Label[] {
  const namespaces = parseNip32Namespaces(tags);
  const declared = new Set(namespaces);
  const noExplicitNamespaces = namespaces.length === 0;

  return tags.flatMap((tag) => {
    if (tag[0] !== NIP32_LABEL_TAG) return [];
    const value = tag[1]?.trim();
    if (!value) return [];
    const namespace = normalizeNamespace(tag[2]);
    return [
      {
        value,
        namespace,
        namespaceDeclared:
          noExplicitNamespaces && namespace === NIP32_IMPLIED_NAMESPACE
            ? true
            : declared.has(namespace)
      }
    ];
  });
}

export function parseNip32LabelTargets(tags: readonly (readonly string[])[]): Nip32LabelTarget[] {
  return tags.flatMap((tag) => {
    const tagName = tag[0];
    if (!isNip32LabelTargetTagName(tagName)) return [];
    const value = tag[1]?.trim();
    if (!value) return [];
    return [
      {
        tagName,
        value,
        relayHint: tag[2]?.trim() || null
      }
    ];
  });
}

export function isNip32LabelTargetTagName(value: string): value is Nip32LabelTargetTagName {
  return TARGET_TAGS.has(value);
}

function normalizeNamespace(namespace: string | null | undefined): string {
  return namespace?.trim() || NIP32_IMPLIED_NAMESPACE;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-32 ${label} must not be empty`);
  return normalized;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
