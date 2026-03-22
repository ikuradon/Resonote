import { getAuth } from '$shared/browser/auth.js';
import { getPlayer } from '$shared/browser/player.js';
import { formatPosition } from '$shared/nostr/events.js';
import { containsPrivateKey } from '$shared/nostr/content-parser.js';
import { neventEncode } from 'nostr-tools/nip19';
import { createLogger } from '$shared/utils/logger.js';
import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { t } from '$shared/i18n/t.js';
import { toastError } from '$shared/browser/toast.js';
import { sendComment } from '../application/comment-actions.js';

const log = createLogger('comment-form-vm');

interface CommentFormViewModelOptions {
  getContentId: () => ContentId;
  getProvider: () => ContentProvider;
}

export type CommentSubmitResult = 'sent' | 'failed' | 'skipped';

export function createCommentFormViewModel(options: CommentFormViewModelOptions) {
  const auth = getAuth();
  const player = getPlayer();

  let content = $state('');
  let sending = $state(false);
  let flying = $state(false);
  let emojiTags = $state<string[][]>([]);
  let attachPosition = $state(true);
  let cwEnabled = $state(false);
  let cwReason = $state('');

  let busy = $derived(sending || flying);
  let hasPosition = $derived(player.position > 0);
  let positionLabel = $derived(hasPosition ? formatPosition(player.position) : null);
  let effectiveAttach = $derived(attachPosition && hasPosition);
  let placeholder = $derived(
    effectiveAttach ? t('comment.placeholder.timed') : t('comment.placeholder.general')
  );

  function selectTimedComment(): void {
    attachPosition = true;
  }

  function selectGeneralComment(): void {
    attachPosition = false;
  }

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
      toastError(t('comment.error.contains_private_key'));
      return 'failed';
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
    selectTimedComment,
    selectGeneralComment,
    toggleContentWarning,
    submit,
    insertQuote(eventId: string, authorPubkey: string): void {
      const nevent = neventEncode({ id: eventId, relays: [], author: authorPubkey });
      const quoteText = `nostr:${nevent}`;
      const prefix = content && !content.endsWith('\n') && !content.endsWith(' ') ? '\n' : '';
      content = content + prefix + quoteText + ' ';
    }
  };
}
