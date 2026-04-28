import type { EventParameters } from 'nostr-typedef';

export const NIP36_CONTENT_WARNING_TAG = 'content-warning';

export function buildNip36ContentWarningTag(reason?: string): string[] {
  const normalized = reason?.trim();
  return normalized ? [NIP36_CONTENT_WARNING_TAG, normalized] : [NIP36_CONTENT_WARNING_TAG];
}

export function parseNip36ContentWarning(
  event: Pick<EventParameters, 'tags'>
): { reason: string | null } | null {
  const tag = event.tags?.find((candidate) => candidate[0] === NIP36_CONTENT_WARNING_TAG);
  if (!tag) return null;
  const reason = tag[1]?.trim();
  return { reason: reason ? reason : null };
}

export function hasNip36ContentWarning(event: Pick<EventParameters, 'tags'>): boolean {
  return parseNip36ContentWarning(event) !== null;
}
