import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP13_NONCE_TAG = 'nonce';

export interface Nip13Nonce {
  readonly nonce: string;
  readonly difficulty: number | null;
}

export interface Nip13ProofOfWorkValidation {
  readonly ok: boolean;
  readonly difficulty: number;
  readonly claimedDifficulty: number | null;
  readonly requiredDifficulty: number;
  readonly reason: 'valid' | 'invalid-id' | 'insufficient-work' | 'insufficient-commitment';
}

const HEX_EVENT_ID = /^[0-9a-f]{64}$/i;

export function buildNip13NonceTag(nonce: string | number, difficulty: number): string[] {
  const normalizedNonce = String(nonce).trim();
  if (!normalizedNonce) throw new Error('NIP-13 nonce must not be empty');
  assertValidDifficulty(difficulty, 'difficulty');
  return [NIP13_NONCE_TAG, normalizedNonce, String(difficulty)];
}

export function parseNip13Nonce(event: Pick<EventParameters, 'tags'>): Nip13Nonce | null {
  const tag = event.tags?.find((entry) => entry[0] === NIP13_NONCE_TAG);
  const nonce = tag?.[1]?.trim();
  if (!tag || !nonce) return null;

  return {
    nonce,
    difficulty: parseNip13Difficulty(tag[2])
  };
}

export function parseNip13Difficulty(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return null;

  const difficulty = Number(normalized);
  return Number.isSafeInteger(difficulty) && difficulty >= 0 && difficulty <= 256
    ? difficulty
    : null;
}

export function countNip13LeadingZeroBits(hex: string): number {
  const normalized = hex.trim();
  if (!/^[0-9a-f]+$/i.test(normalized)) {
    throw new Error('NIP-13 hex value must contain only hexadecimal characters');
  }

  let count = 0;
  for (const char of normalized) {
    const nibble = Number.parseInt(char, 16);
    if (nibble === 0) {
      count += 4;
      continue;
    }
    return count + Math.clz32(nibble) - 28;
  }
  return count;
}

export function calculateNip13EventDifficulty(event: Pick<NostrEvent, 'id'>): number | null {
  const normalized = event.id.trim();
  if (!HEX_EVENT_ID.test(normalized)) return null;
  return countNip13LeadingZeroBits(normalized);
}

export function validateNip13ProofOfWork(
  event: Pick<NostrEvent, 'id' | 'tags'>,
  requiredDifficulty = parseNip13Nonce(event)?.difficulty ?? 0
): Nip13ProofOfWorkValidation {
  assertValidDifficulty(requiredDifficulty, 'required difficulty');
  const difficulty = calculateNip13EventDifficulty(event);
  const claimedDifficulty = parseNip13Nonce(event)?.difficulty ?? null;

  if (difficulty === null) {
    return {
      ok: false,
      difficulty: 0,
      claimedDifficulty,
      requiredDifficulty,
      reason: 'invalid-id'
    };
  }

  if (difficulty < requiredDifficulty) {
    return {
      ok: false,
      difficulty,
      claimedDifficulty,
      requiredDifficulty,
      reason: 'insufficient-work'
    };
  }

  if (claimedDifficulty === null || claimedDifficulty < requiredDifficulty) {
    return {
      ok: false,
      difficulty,
      claimedDifficulty,
      requiredDifficulty,
      reason: 'insufficient-commitment'
    };
  }

  return {
    ok: true,
    difficulty,
    claimedDifficulty,
    requiredDifficulty,
    reason: 'valid'
  };
}

export function hasNip13ProofOfWork(
  event: Pick<NostrEvent, 'id' | 'tags'>,
  requiredDifficulty?: number
): boolean {
  return validateNip13ProofOfWork(event, requiredDifficulty).ok;
}

function assertValidDifficulty(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 256) {
    throw new Error(`NIP-13 ${label} must be an integer between 0 and 256`);
  }
}
