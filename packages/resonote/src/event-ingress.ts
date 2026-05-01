import { type RelayEventValidationFailureReason, validateRelayEvent } from '@auftakt/core';
import type { Event as NostrEvent } from 'nostr-typedef';

export interface QuarantineRecord {
  readonly relayUrl: string;
  readonly eventId: string | null;
  readonly reason: RelayEventValidationFailureReason;
  readonly rawEvent: unknown;
}

export type RelayEventIngressResult =
  | { readonly ok: true; readonly event: NostrEvent; readonly stored: boolean }
  | { readonly ok: false; readonly reason: RelayEventValidationFailureReason };

function getRawEventId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const id = (event as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export async function ingestRelayEvent(input: {
  readonly relayUrl: string;
  readonly event: unknown;
  readonly materialize: (event: NostrEvent, relayUrl: string) => Promise<boolean>;
  readonly quarantine: (record: QuarantineRecord) => Promise<void> | void;
}): Promise<RelayEventIngressResult> {
  const validation = await validateRelayEvent(input.event);
  if (!validation.ok) {
    await input.quarantine({
      relayUrl: input.relayUrl,
      eventId: getRawEventId(input.event),
      reason: validation.reason,
      rawEvent: input.event
    });
    return validation;
  }

  const stored = await input.materialize(validation.event, input.relayUrl);
  return { ok: true, event: validation.event, stored };
}
