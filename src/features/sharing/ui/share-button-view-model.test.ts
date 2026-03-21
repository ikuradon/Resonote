import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  playerState,
  copyToClipboardMock,
  sendShareMock,
  buildDefaultShareContentMock,
  buildResonoteShareUrlMock,
  logErrorMock
} = vi.hoisted(() => ({
  authState: { loggedIn: true, pubkey: 'me' },
  playerState: { position: 30_000 },
  copyToClipboardMock: vi.fn(async () => true),
  sendShareMock: vi.fn(async () => {}),
  buildDefaultShareContentMock: vi.fn(
    (openUrl: string, pageUrl: string) => `${openUrl}\n${pageUrl}`
  ),
  buildResonoteShareUrlMock: vi.fn(
    (_origin: string, _contentId: unknown, _relays: string[], positionSec?: number) =>
      positionSec
        ? `https://resonote.example/link?t=${positionSec}`
        : 'https://resonote.example/link'
  ),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/browser/player.js', () => ({
  getPlayer: () => playerState
}));

vi.mock('$shared/browser/clipboard.js', () => ({
  copyToClipboard: copyToClipboardMock
}));

vi.mock('../application/share-actions.js', () => ({
  sendShare: sendShareMock
}));

vi.mock('../domain/share-link.js', () => ({
  buildDefaultShareContent: buildDefaultShareContentMock,
  buildResonoteShareUrl: buildResonoteShareUrlMock
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.example']
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    error: logErrorMock
  })
}));

// Set up window global for node test environment
const mockLocation = {
  href: 'https://resonote.pages.dev/spotify/track/track-42',
  origin: 'https://resonote.pages.dev'
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = { location: mockLocation };

import { createShareButtonViewModel } from './share-button-view-model.svelte.js';

const contentId = { platform: 'spotify', type: 'track', id: 'track-42' };
const provider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-42', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-42'
};

function makeVm() {
  return createShareButtonViewModel({
    getContentId: () => contentId,
    getProvider: () => provider
  });
}

describe('createShareButtonViewModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState.loggedIn = true;
    authState.pubkey = 'me';
    playerState.position = 30_000;
    copyToClipboardMock.mockReset().mockResolvedValue(true);
    sendShareMock.mockReset();
    buildDefaultShareContentMock.mockClear();
    buildResonoteShareUrlMock.mockClear();
    logErrorMock.mockReset();

    // Reset mock location values
    mockLocation.href = 'https://resonote.pages.dev/spotify/track/track-42';
    mockLocation.origin = 'https://resonote.pages.dev';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with modalState=closed', () => {
      const vm = makeVm();
      expect(vm.modalState).toBe('closed');
    });

    it('should have empty content and emojiTags', () => {
      const vm = makeVm();
      expect(vm.content).toBe('');
      expect(vm.emojiTags).toEqual([]);
    });

    it('should have sending=false, copiedLink=false, copiedTimedLink=false', () => {
      const vm = makeVm();
      expect(vm.sending).toBe(false);
      expect(vm.copiedLink).toBe(false);
      expect(vm.copiedTimedLink).toBe(false);
    });

    it('should reflect loggedIn from auth', () => {
      authState.loggedIn = false;
      const vm = makeVm();
      expect(vm.loggedIn).toBe(false);
    });

    it('positionSec should be floor of position/1000', () => {
      playerState.position = 30_500;
      const vm = makeVm();
      expect(vm.positionSec).toBe(30);
    });

    it('showTimedLink should be true when positionSec > 0', () => {
      playerState.position = 5_000;
      const vm = makeVm();
      expect(vm.showTimedLink).toBe(true);
    });

    it('showTimedLink should be false when position=0', () => {
      playerState.position = 0;
      const vm = makeVm();
      expect(vm.showTimedLink).toBe(false);
    });
  });

  describe('openMenu / closeModal', () => {
    it('openMenu sets modalState to menu', () => {
      const vm = makeVm();
      vm.openMenu();
      expect(vm.modalState).toBe('menu');
    });

    it('closeModal resets state to closed', () => {
      const vm = makeVm();
      vm.openMenu();
      vm.content = 'draft';
      vm.emojiTags = [['emoji', 'x', 'url']];
      vm.closeModal();
      expect(vm.modalState).toBe('closed');
      expect(vm.content).toBe('');
      expect(vm.emojiTags).toEqual([]);
    });
  });

  describe('openPostForm', () => {
    it('sets modalState to post and populates content', () => {
      const vm = makeVm();
      vm.openPostForm();
      expect(vm.modalState).toBe('post');
      expect(buildDefaultShareContentMock).toHaveBeenCalledWith(
        'https://open.spotify.com/track/track-42',
        mockLocation.href
      );
      expect(vm.content).toBe(`https://open.spotify.com/track/track-42\n${mockLocation.href}`);
    });

    it('resets emojiTags when opening post form', () => {
      const vm = makeVm();
      vm.emojiTags = [['emoji', 'star', 'url']];
      vm.openPostForm();
      expect(vm.emojiTags).toEqual([]);
    });
  });

  describe('copyResonoteLink', () => {
    it('calls buildResonoteShareUrl without time param', async () => {
      const vm = makeVm();
      await vm.copyResonoteLink();
      expect(buildResonoteShareUrlMock).toHaveBeenCalledWith(
        mockLocation.origin,
        contentId,
        ['wss://relay.example'],
        undefined
      );
    });

    it('sets copiedLink=true after successful copy', async () => {
      const vm = makeVm();
      await vm.copyResonoteLink();
      expect(vm.copiedLink).toBe(true);
    });

    it('resets copiedLink to false after 2 seconds', async () => {
      const vm = makeVm();
      await vm.copyResonoteLink();
      expect(vm.copiedLink).toBe(true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(vm.copiedLink).toBe(false);
    });

    it('does not set copiedLink when copy fails', async () => {
      copyToClipboardMock.mockResolvedValueOnce(false);
      const vm = makeVm();
      await vm.copyResonoteLink();
      expect(vm.copiedLink).toBe(false);
      expect(logErrorMock).toHaveBeenCalledWith(
        'Failed to copy link',
        expect.objectContaining({ withTime: false })
      );
    });
  });

  describe('copyTimedLink', () => {
    it('calls buildResonoteShareUrl with positionSec', async () => {
      playerState.position = 30_000;
      const vm = makeVm();
      await vm.copyTimedLink();
      expect(buildResonoteShareUrlMock).toHaveBeenCalledWith(
        mockLocation.origin,
        contentId,
        ['wss://relay.example'],
        30
      );
    });

    it('sets copiedTimedLink=true after successful copy', async () => {
      const vm = makeVm();
      await vm.copyTimedLink();
      expect(vm.copiedTimedLink).toBe(true);
    });

    it('resets copiedTimedLink to false after 2 seconds', async () => {
      const vm = makeVm();
      await vm.copyTimedLink();
      expect(vm.copiedTimedLink).toBe(true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(vm.copiedTimedLink).toBe(false);
    });

    it('does not set copiedTimedLink when copy fails', async () => {
      copyToClipboardMock.mockResolvedValueOnce(false);
      const vm = makeVm();
      await vm.copyTimedLink();
      expect(vm.copiedTimedLink).toBe(false);
    });
  });

  describe('share', () => {
    it('does nothing when not logged in', async () => {
      authState.loggedIn = false;
      const vm = makeVm();
      vm.content = 'hello';
      await vm.share();
      expect(sendShareMock).not.toHaveBeenCalled();
    });

    it('does nothing when content is empty', async () => {
      const vm = makeVm();
      vm.content = '';
      await vm.share();
      expect(sendShareMock).not.toHaveBeenCalled();
    });

    it('does nothing when content is only whitespace', async () => {
      const vm = makeVm();
      vm.content = '   ';
      await vm.share();
      expect(sendShareMock).not.toHaveBeenCalled();
    });

    it('calls sendShare with trimmed content and closes modal on success', async () => {
      const vm = makeVm();
      vm.openPostForm();
      vm.content = '  My share  ';
      await vm.share();
      expect(sendShareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'My share',
          contentId,
          provider
        })
      );
      expect(vm.modalState).toBe('closed');
    });

    it('passes emojiTags when set', async () => {
      const vm = makeVm();
      vm.content = 'hi';
      vm.emojiTags = [['emoji', 'fire', 'https://example.com/fire.png']];
      await vm.share();
      expect(sendShareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          emojiTags: [['emoji', 'fire', 'https://example.com/fire.png']]
        })
      );
    });

    it('passes undefined emojiTags when none set', async () => {
      const vm = makeVm();
      vm.content = 'hi';
      await vm.share();
      expect(sendShareMock).toHaveBeenCalledWith(expect.objectContaining({ emojiTags: undefined }));
    });

    it('logs error and does not close modal when sendShare throws', async () => {
      sendShareMock.mockRejectedValueOnce(new Error('network error'));
      const vm = makeVm();
      vm.openMenu();
      vm.content = 'hello';
      await vm.share();
      expect(logErrorMock).toHaveBeenCalledWith('Failed to share', expect.any(Error));
      expect(vm.modalState).toBe('menu');
    });
  });

  describe('handleKeydown', () => {
    function keyEvent(key: string): KeyboardEvent {
      return { key } as KeyboardEvent;
    }

    it('closes modal on Escape when modalState is not closed', () => {
      const vm = makeVm();
      vm.openMenu();
      vm.handleKeydown(keyEvent('Escape'));
      expect(vm.modalState).toBe('closed');
    });

    it('does nothing on Escape when modalState is closed', () => {
      const vm = makeVm();
      vm.handleKeydown(keyEvent('Escape'));
      expect(vm.modalState).toBe('closed');
    });

    it('does nothing on non-Escape key', () => {
      const vm = makeVm();
      vm.openMenu();
      vm.handleKeydown(keyEvent('Enter'));
      expect(vm.modalState).toBe('menu');
    });
  });
});
