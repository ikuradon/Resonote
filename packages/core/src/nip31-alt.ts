import type { EventParameters } from 'nostr-typedef';

export const NIP31_ALT_TAG = 'alt';

export function parseNip31AltTag(event: Pick<EventParameters, 'tags'>): string | null {
  const alt = event.tags?.find((tag) => tag[0] === NIP31_ALT_TAG)?.[1];
  return typeof alt === 'string' && alt.trim() ? alt : null;
}

export function buildNip31AltTag(summary: string): string[] {
  const normalized = summary.trim();
  if (!normalized) {
    throw new Error('NIP-31 alt tag summary must not be empty');
  }
  return [NIP31_ALT_TAG, normalized];
}

export function appendNip31AltTag(
  tags: readonly (readonly string[])[],
  summary: string
): string[][] {
  const altTag = buildNip31AltTag(summary);
  return [...tags.filter((tag) => tag[0] !== NIP31_ALT_TAG).map((tag) => [...tag]), altTag];
}

export function withNip31AltTag(event: EventParameters, summary: string): EventParameters {
  return {
    ...event,
    tags: appendNip31AltTag(event.tags ?? [], summary)
  };
}
