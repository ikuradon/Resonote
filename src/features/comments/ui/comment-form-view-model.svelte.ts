import { neventEncode } from '@auftakt/core';

import { getAuth } from '$shared/browser/auth.js';
import { getPlayer } from '$shared/browser/player.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { t } from '$shared/i18n/t.js';
import { containsPrivateKey } from '$shared/nostr/content-parser.js';
import { formatPosition } from '$shared/nostr/events.js';
import { createLogger } from '$shared/utils/logger.js';

import { sendComment } from '../application/comment-actions.js';

const log = createLogger('comment-form-vm');

interface CommentFormViewModelOptions {
  getContentId: () => ContentId;
  getProvider: () => ContentProvider;
  getActiveTab?: () => 'flow' | 'shout' | 'info';
}

export type CommentSubmitResult =
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'position_required'
  | 'private_key_blocked';

export function createCommentFormViewModel(options: CommentFormViewModelOptions) {
  const auth = getAuth();
  const player = getPlayer();

  let content = $state('');
  let sending = $state(false);
  let flying = $state(false);
  let emojiTags = $state<string[][]>([]);
  let cwEnabled = $state(false);
  let cwReason = $state('');

  let busy = $derived(sending || flying);
  let hasPosition = $derived(player.position > 0);
  let positionLabel = $derived(hasPosition ? formatPosition(player.position) : null);
  let effectiveAttach = $derived((options.getActiveTab?.() ?? 'flow') === 'flow' && hasPosition);
  let placeholder = $derived(
    (options.getActiveTab?.() ?? 'flow') === 'flow'
      ? t('comment.placeholder.flow')
      : t('comment.placeholder.shout')
  );

  function toggleContentWarning(): void {
    cwEnabled = !cwEnabled;
    if (!cwEnabled) {
      cwReason = '';
    }
  }

  async function submit(): Promise<CommentSubmitResult> {
    const trimmed = content.trim();
    if (!trimmed || !auth.loggedIn) return 'skipped';

    if (containsPrivateKey(trimmed)) {
      return 'private_key_blocked';
    }

    if ((options.getActiveTab?.() ?? 'flow') === 'flow' && !hasPosition) {
      return 'position_required';
    }

    flying = true;
    try {
      const posMs = effectiveAttach ? player.position : undefined;
      const tags = emojiTags.length > 0 ? emojiTags : undefined;
      await new Promise((resolve) => setTimeout(resolve, 400));
      sending = true;
      flying = false;
      await sendComment({
        content: trimmed,
        contentId: options.getContentId(),
        provider: options.getProvider(),
        positionMs: posMs,
        emojiTags: tags,
        contentWarning: cwEnabled ? cwReason : undefined
      });
      content = '';
      emojiTags = [];
      cwEnabled = false;
      cwReason = '';
      return 'sent';
    } catch (error) {
      log.error('Failed to send comment', error);
      return 'failed';
    } finally {
      sending = false;
      flying = false;
    }
  }

  return {
    get loggedIn() {
      return auth.loggedIn;
    },
    get content() {
      return content;
    },
    set content(value: string) {
      content = value;
    },
    get emojiTags() {
      return emojiTags;
    },
    set emojiTags(value: string[][]) {
      emojiTags = value;
    },
    get sending() {
      return sending;
    },
    get flying() {
      return flying;
    },
    get busy() {
      return busy;
    },
    get hasPosition() {
      return hasPosition;
    },
    get positionLabel() {
      return positionLabel;
    },
    get effectiveAttach() {
      return effectiveAttach;
    },
    get cwEnabled() {
      return cwEnabled;
    },
    get cwReason() {
      return cwReason;
    },
    set cwReason(value: string) {
      cwReason = value;
    },
    get placeholder() {
      return placeholder;
    },
    toggleContentWarning,
    submit,
    insertQuote(eventId: string, authorPubkey: string): void {
      const nevent = neventEncode({ id: eventId, relays: [], author: authorPubkey });
      const quoteText = `nostr:${nevent}`;
      const prefix = content && !content.endsWith('\n') && !content.endsWith(' ') ? '\n' : '';
      content = `${content + prefix + quoteText} `;
    }
  };
}
