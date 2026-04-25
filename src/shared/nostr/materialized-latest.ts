import { fetchBackwardFirst } from '$shared/nostr/query.js';

export interface MaterializedLatestEvent {
  readonly tags: string[][];
  readonly content: string;
  readonly created_at: number;
}

export async function fetchMaterializedLatestEvent(
  pubkey: string,
  kind: number
): Promise<MaterializedLatestEvent | null> {
  const event = await fetchBackwardFirst<MaterializedLatestEvent>(
    [{ kinds: [kind], authors: [pubkey], limit: 1 }],
    { timeoutMs: 10_000 }
  );
  return event ? { tags: event.tags, content: event.content, created_at: event.created_at } : null;
}
