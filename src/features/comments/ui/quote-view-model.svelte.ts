/**
 * Reactive view-model for a quoted event (nevent/note).
 * Fetches the event via cachedFetchById and resolves author display.
 */

import { cachedFetchById } from '$shared/nostr/cached-query.js';
import { getDisplayName, fetchProfile } from '$shared/browser/profile.js';
import { COMMENT_KIND } from '$shared/nostr/events.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('quote-vm');

export type QuoteStatus = 'loading' | 'loaded' | 'not-found';

export interface QuoteData {
  eventId: string;
  pubkey: string;
  content: string;
  createdAt: number;
  isComment: boolean;
  /** Content warning reason. null = no CW. Empty string = CW without reason. */
  contentWarning: string | null;
}

export function createQuoteViewModel(eventId: string) {
  let status = $state<QuoteStatus>('loading');
  let data = $state<QuoteData | null>(null);
  let authorName = $state<string>('');

  async function load() {
    try {
      const event = await cachedFetchById(eventId);
      if (!event) {
        status = 'not-found';
        return;
      }

      const cwTag = event.tags.find((t) => t[0] === 'content-warning');
      data = {
        eventId: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        isComment: event.kind === COMMENT_KIND,
        contentWarning: cwTag ? (cwTag[1] ?? '') : null
      };

      authorName = getDisplayName(event.pubkey);
      status = 'loaded';

      // Fetch profile in background for display name resolution
      fetchProfile(event.pubkey)
        .then(() => {
          authorName = getDisplayName(event.pubkey);
        })
        .catch(() => {});
    } catch (err) {
      log.warn('Failed to load quoted event', { eventId, error: err });
      status = 'not-found';
    }
  }

  load();

  return {
    get status() {
      return status;
    },
    get data() {
      return data;
    },
    get authorName() {
      return authorName;
    }
  };
}
