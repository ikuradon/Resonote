import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { getAuth } from '$shared/browser/auth.js';
import { copyToClipboard } from '$shared/browser/clipboard.js';
import { getPlayer } from '$shared/browser/player.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';
import { sendShare } from '../application/share-actions.js';
import { buildDefaultShareContent, buildResonoteShareUrl } from '../domain/share-link.js';

const log = createLogger('share-button-vm');

export type ShareModalState = 'closed' | 'menu' | 'post';

interface ShareButtonViewModelOptions {
  getContentId: () => ContentId;
  getProvider: () => ContentProvider;
}

interface ShareButtonState {
  modalState: ShareModalState;
  content: string;
  emojiTags: string[][];
  sending: boolean;
  copiedLink: boolean;
  copiedTimedLink: boolean;
}

export function createShareButtonViewModel(options: ShareButtonViewModelOptions) {
  const auth = getAuth();
  const player = getPlayer();
  let state = $state<ShareButtonState>({
    modalState: 'closed',
    content: '',
    emojiTags: [],
    sending: false,
    copiedLink: false,
    copiedTimedLink: false
  });

  function positionSec(): number {
    return Math.floor(player.position / 1000);
  }

  function resetCopiedFlags(): void {
    state.copiedLink = false;
    state.copiedTimedLink = false;
  }

  function openMenu(): void {
    state.modalState = 'menu';
  }

  function closeModal(): void {
    state.modalState = 'closed';
    state.content = '';
    state.emojiTags = [];
    resetCopiedFlags();
  }

  function openPostForm(): void {
    state.content = buildDefaultShareContent(
      options.getProvider().openUrl(options.getContentId()),
      window.location.href
    );
    state.emojiTags = [];
    state.modalState = 'post';
  }

  function buildLink(withTime = false): string {
    return buildResonoteShareUrl(
      window.location.origin,
      options.getContentId(),
      DEFAULT_RELAYS,
      withTime ? positionSec() : undefined
    );
  }

  async function copyLink(withTime: boolean): Promise<void> {
    const ok = await copyToClipboard(buildLink(withTime));
    if (!ok) {
      log.error('Failed to copy link', { withTime });
      return;
    }

    if (withTime) {
      state.copiedTimedLink = true;
      setTimeout(() => {
        state.copiedTimedLink = false;
      }, 2000);
      return;
    }

    state.copiedLink = true;
    setTimeout(() => {
      state.copiedLink = false;
    }, 2000);
  }

  async function copyResonoteLink(): Promise<void> {
    await copyLink(false);
  }

  async function copyTimedLink(): Promise<void> {
    await copyLink(true);
  }

  async function share(): Promise<void> {
    const trimmed = state.content.trim();
    if (!auth.loggedIn || !trimmed) return;

    state.sending = true;
    try {
      await sendShare({
        content: trimmed,
        contentId: options.getContentId(),
        provider: options.getProvider(),
        emojiTags: state.emojiTags.length > 0 ? state.emojiTags : undefined
      });
      closeModal();
    } catch (error) {
      log.error('Failed to share', error);
    } finally {
      state.sending = false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (state.modalState !== 'closed' && event.key === 'Escape') {
      closeModal();
    }
  }

  return {
    get modalState() {
      return state.modalState;
    },
    get content() {
      return state.content;
    },
    set content(value: string) {
      state.content = value;
    },
    get emojiTags() {
      return state.emojiTags;
    },
    set emojiTags(value: string[][]) {
      state.emojiTags = value;
    },
    get sending() {
      return state.sending;
    },
    get copiedLink() {
      return state.copiedLink;
    },
    get copiedTimedLink() {
      return state.copiedTimedLink;
    },
    get loggedIn() {
      return auth.loggedIn;
    },
    get positionSec() {
      return positionSec();
    },
    get showTimedLink() {
      return positionSec() > 0;
    },
    openMenu,
    closeModal,
    openPostForm,
    copyResonoteLink,
    copyTimedLink,
    share,
    handleKeydown
  };
}
