/**
 * Application-layer action for sharing content as a kind:1 note.
 */

import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { castSigned } from '$shared/nostr/client.js';
import { buildShare } from '$shared/nostr/events.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('share-actions');

export interface ShareParams {
  content: string;
  contentId: ContentId;
  provider: ContentProvider;
  emojiTags?: string[][];
}

export async function sendShare(params: ShareParams): Promise<void> {
  const eventParams = buildShare(
    params.content,
    params.contentId,
    params.provider,
    params.emojiTags
  );
  log.info('Sharing as kind:1', { contentLength: params.content.length });
  await castSigned(eventParams);
  log.info('Shared successfully');
}
