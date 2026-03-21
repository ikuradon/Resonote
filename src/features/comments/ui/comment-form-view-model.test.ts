import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, playerState, formatPositionMock, sendCommentMock, logErrorMock } = vi.hoisted(
  () => ({
    authState: { loggedIn: true, pubkey: 'me' },
    playerState: { position: 10_000 },
    formatPositionMock: vi.fn((ms: number) => `${Math.floor(ms / 1000)}s`),
    sendCommentMock: vi.fn(async () => {}),
    logErrorMock: vi.fn()
  })
);

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/browser/player.js', () => ({
  getPlayer: () => playerState
}));

vi.mock('$shared/nostr/events.js', () => ({
  formatPosition: formatPositionMock
}));

vi.mock('../application/comment-actions.js', () => ({
  sendComment: sendCommentMock
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string) => key
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    error: logErrorMock
  })
}));

import { createCommentFormViewModel } from './comment-form-view-model.svelte.js';

const contentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const provider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

function makeVm() {
  return createCommentFormViewModel({
    getContentId: () => contentId,
    getProvider: () => provider
  });
}

describe('createCommentFormViewModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState.loggedIn = true;
    authState.pubkey = 'me';
    playerState.position = 10_000;
    sendCommentMock.mockReset();
    logErrorMock.mockReset();
    formatPositionMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should have empty content, sending=false, attachPosition=true', () => {
      const vm = makeVm();
      expect(vm.content).toBe('');
      expect(vm.sending).toBe(false);
      expect(vm.flying).toBe(false);
      expect(vm.busy).toBe(false);
      expect(vm.effectiveAttach).toBe(true);
    });

    it('should reflect loggedIn from auth', () => {
      authState.loggedIn = false;
      const vm = makeVm();
      expect(vm.loggedIn).toBe(false);
    });

    it('should compute hasPosition and positionLabel from player', () => {
      playerState.position = 5_000;
      const vm = makeVm();
      expect(vm.hasPosition).toBe(true);
      expect(vm.positionLabel).toBe('5s');
    });

    it('should have hasPosition=false and positionLabel=null when position=0', () => {
      playerState.position = 0;
      const vm = makeVm();
      expect(vm.hasPosition).toBe(false);
      expect(vm.positionLabel).toBeNull();
    });

    it('should show timed placeholder when position is attached', () => {
      const vm = makeVm();
      expect(vm.placeholder).toBe('comment.placeholder.timed');
    });

    it('should show cwEnabled=false and cwReason="" initially', () => {
      const vm = makeVm();
      expect(vm.cwEnabled).toBe(false);
      expect(vm.cwReason).toBe('');
    });
  });

  describe('selectTimedComment / selectGeneralComment', () => {
    it('selectGeneralComment sets effectiveAttach to false', () => {
      const vm = makeVm();
      vm.selectGeneralComment();
      expect(vm.effectiveAttach).toBe(false);
    });

    it('selectGeneralComment changes placeholder to general', () => {
      const vm = makeVm();
      vm.selectGeneralComment();
      expect(vm.placeholder).toBe('comment.placeholder.general');
    });

    it('selectTimedComment restores effectiveAttach to true when position > 0', () => {
      const vm = makeVm();
      vm.selectGeneralComment();
      vm.selectTimedComment();
      expect(vm.effectiveAttach).toBe(true);
    });

    it('effectiveAttach stays false even after selectTimedComment when position=0', () => {
      playerState.position = 0;
      const vm = makeVm();
      vm.selectTimedComment();
      expect(vm.effectiveAttach).toBe(false);
    });
  });

  describe('toggleContentWarning', () => {
    it('should toggle cwEnabled', () => {
      const vm = makeVm();
      vm.toggleContentWarning();
      expect(vm.cwEnabled).toBe(true);
      vm.toggleContentWarning();
      expect(vm.cwEnabled).toBe(false);
    });

    it('should clear cwReason when disabling CW', () => {
      const vm = makeVm();
      vm.toggleContentWarning();
      vm.cwReason = 'NSFW';
      vm.toggleContentWarning();
      expect(vm.cwReason).toBe('');
    });
  });

  describe('submit', () => {
    it('returns skipped when content is empty', async () => {
      const vm = makeVm();
      vm.content = '';
      const result = await vm.submit();
      expect(result).toBe('skipped');
      expect(sendCommentMock).not.toHaveBeenCalled();
    });

    it('returns skipped when content is only whitespace', async () => {
      const vm = makeVm();
      vm.content = '   ';
      const result = await vm.submit();
      expect(result).toBe('skipped');
    });

    it('returns skipped when not logged in', async () => {
      authState.loggedIn = false;
      const vm = makeVm();
      vm.content = 'hello';
      const result = await vm.submit();
      expect(result).toBe('skipped');
      expect(sendCommentMock).not.toHaveBeenCalled();
    });

    it('calls sendComment with trimmed content and positionMs when effectiveAttach=true', async () => {
      playerState.position = 15_000;
      const vm = makeVm();
      vm.content = '  hello  ';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      const result = await submitPromise;

      expect(result).toBe('sent');
      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'hello',
          contentId,
          provider,
          positionMs: 15_000
        })
      );
    });

    it('calls sendComment with positionMs=undefined when effectiveAttach=false', async () => {
      const vm = makeVm();
      vm.selectGeneralComment();
      vm.content = 'general comment';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          positionMs: undefined
        })
      );
    });

    it('passes emojiTags to sendComment when set', async () => {
      const vm = makeVm();
      vm.content = 'hi';
      vm.emojiTags = [['emoji', 'star', 'https://example.com/star.png']];

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          emojiTags: [['emoji', 'star', 'https://example.com/star.png']]
        })
      );
    });

    it('passes undefined emojiTags when none set', async () => {
      const vm = makeVm();
      vm.content = 'hi';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({ emojiTags: undefined })
      );
    });

    it('passes contentWarning when cwEnabled', async () => {
      const vm = makeVm();
      vm.toggleContentWarning();
      vm.cwReason = 'NSFW';
      vm.content = 'sensitive post';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({ contentWarning: 'NSFW' })
      );
    });

    it('passes undefined contentWarning when cwEnabled=false', async () => {
      const vm = makeVm();
      vm.content = 'normal post';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(sendCommentMock).toHaveBeenCalledWith(
        expect.objectContaining({ contentWarning: undefined })
      );
    });

    it('resets content, emojiTags, cwEnabled, cwReason after successful send', async () => {
      const vm = makeVm();
      vm.content = 'hello';
      vm.emojiTags = [['emoji', 'x', 'url']];
      vm.toggleContentWarning();
      vm.cwReason = 'reason';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      await submitPromise;

      expect(vm.content).toBe('');
      expect(vm.emojiTags).toEqual([]);
      expect(vm.cwEnabled).toBe(false);
      expect(vm.cwReason).toBe('');
    });

    it('returns failed and logs error when sendComment throws', async () => {
      sendCommentMock.mockRejectedValueOnce(new Error('network error'));
      const vm = makeVm();
      vm.content = 'hello';

      const submitPromise = vm.submit();
      await vi.runAllTimersAsync();
      const result = await submitPromise;

      expect(result).toBe('failed');
      expect(logErrorMock).toHaveBeenCalledWith('Failed to send comment', expect.any(Error));
    });
  });
});
