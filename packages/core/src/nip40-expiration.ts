import type { EventParameters } from 'nostr-typedef';

export const NIP40_EXPIRATION_TAG = 'expiration';

export function buildNip40ExpirationTag(expiresAt: number): string[] {
  assertValidNip40Timestamp(expiresAt, 'expiration timestamp');
  return [NIP40_EXPIRATION_TAG, String(expiresAt)];
}

export function parseNip40Expiration(event: Pick<EventParameters, 'tags'>): number | null {
  const raw = event.tags?.find((tag) => tag[0] === NIP40_EXPIRATION_TAG)?.[1]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;

  const expiresAt = Number(raw);
  return Number.isSafeInteger(expiresAt) ? expiresAt : null;
}

export function hasNip40Expiration(event: Pick<EventParameters, 'tags'>): boolean {
  return parseNip40Expiration(event) !== null;
}

export function isNip40Expired(
  event: Pick<EventParameters, 'tags'>,
  now = Math.floor(Date.now() / 1000)
): boolean {
  assertValidNip40Timestamp(now, 'current timestamp');
  const expiresAt = parseNip40Expiration(event);
  return expiresAt !== null && expiresAt <= now;
}

function assertValidNip40Timestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-40 ${label} must be a non-negative safe integer`);
  }
}
