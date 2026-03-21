import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMuteListMock,
  muteListState,
  hasNip44SupportMock,
  muteWordMock,
  unmuteUserMock,
  unmuteWordMock,
  getProfileDisplayMock,
} = vi.hoisted(() => {
  const muteListState = {
    mutedPubkeys: new Set<string>(['pubkey1', 'pubkey2']),
    mutedWords: ['spam', 'bad'],
  };
  return {
    getMuteListMock: vi.fn(() => muteListState),
    muteListState,
    hasNip44SupportMock: vi.fn(() => true),
    muteWordMock: vi.fn(async () => {}),
    unmuteUserMock: vi.fn(async () => {}),
    unmuteWordMock: vi.fn(async () => {}),
    getProfileDisplayMock: vi.fn((pubkey: string) => ({
      displayName: `User ${pubkey}`,
      profileHref: `/profile/${pubkey}`,
      formattedNip05: null,
    })),
  };
});

vi.mock('$shared/browser/mute.js', () => ({
  getMuteList: getMuteListMock,
  hasNip44Support: hasNip44SupportMock,
  muteWord: muteWordMock,
  unmuteUser: unmuteUserMock,
  unmuteWord: unmuteWordMock,
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: getProfileDisplayMock,
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

import { createMuteSettingsViewModel } from './mute-settings-view-model.svelte.js';

describe('createMuteSettingsViewModel', () => {
  beforeEach(() => {
    muteListState.mutedPubkeys = new Set<string>(['pubkey1', 'pubkey2']);
    muteListState.mutedWords = ['spam', 'bad'];
    getMuteListMock.mockReturnValue(muteListState);
    hasNip44SupportMock.mockReturnValue(true);
    muteWordMock.mockReset();
    unmuteUserMock.mockReset();
    unmuteWordMock.mockReset();
    getProfileDisplayMock.mockClear();
  });

  describe('initial state', () => {
    it('newMuteWord starts empty', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.newMuteWord).toBe('');
    });

    it('confirmDialog starts closed', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('nip44Supported reflects hasNip44Support()', () => {
      hasNip44SupportMock.mockReturnValue(false);
      const vm = createMuteSettingsViewModel();
      expect(vm.nip44Supported).toBe(false);
    });

    it('mutedUsers maps pubkeys to display entries', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.mutedUsers.length).toBe(2);
      expect(vm.mutedUsers[0].displayName).toBe('User pubkey1');
      expect(vm.mutedUsers[0].profileHref).toBe('/profile/pubkey1');
    });

    it('muteList is exposed directly', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.muteList).toBe(muteListState);
    });
  });

  describe('newMuteWord setter/getter', () => {
    it('can set newMuteWord', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'newword';
      expect(vm.newMuteWord).toBe('newword');
    });
  });

  describe('requestAddMuteWord', () => {
    it('does nothing when newMuteWord is empty', () => {
      const vm = createMuteSettingsViewModel();
      vm.requestAddMuteWord();
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('does nothing when newMuteWord is only whitespace', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = '   ';
      vm.requestAddMuteWord();
      expect(vm.confirmDialog.open).toBe(false);
    });

    it('opens confirm dialog with correct title', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.mute_word_add');
    });

    it('sets variant to default', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      expect(vm.confirmDialog.variant).toBe('default');
    });
  });

  describe('requestUnmuteUser', () => {
    it('opens confirm dialog with unmute title', () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteUser('pubkey1');
      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.unmute');
    });
  });

  describe('requestUnmuteWord', () => {
    it('opens confirm dialog with mute_word_remove title', () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteWord('spam');
      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.mute_word_remove');
    });
  });

  describe('cancelConfirmAction', () => {
    it('closes confirm dialog', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      expect(vm.confirmDialog.open).toBe(true);
      vm.cancelConfirmAction();
      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('confirmCurrentAction', () => {
    it('calls muteWord and resets newMuteWord', async () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      await vm.confirmCurrentAction();
      expect(muteWordMock).toHaveBeenCalledWith('testword');
      expect(vm.newMuteWord).toBe('');
    });

    it('calls unmuteUser on confirm', async () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteUser('pubkey1');
      await vm.confirmCurrentAction();
      expect(unmuteUserMock).toHaveBeenCalledWith('pubkey1');
    });

    it('calls unmuteWord on confirm', async () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteWord('spam');
      await vm.confirmCurrentAction();
      expect(unmuteWordMock).toHaveBeenCalledWith('spam');
    });

    it('closes dialog even when no action pending', async () => {
      const vm = createMuteSettingsViewModel();
      await vm.confirmCurrentAction();
      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('handleMuteWordKeydown', () => {
    it('calls requestAddMuteWord on Enter key', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'enterword';
      const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      vm.handleMuteWordKeydown(event);
      expect(vm.confirmDialog.open).toBe(true);
    });

    it('does nothing on non-Enter key', () => {
      const vm = createMuteSettingsViewModel();
      vm.newMuteWord = 'someword';
      const event = { key: 'a', preventDefault: vi.fn() } as unknown as KeyboardEvent;
      vm.handleMuteWordKeydown(event);
      expect(vm.confirmDialog.open).toBe(false);
    });
  });

  describe('confirmDialog labels', () => {
    it('confirmLabel is confirm.ok', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.confirmDialog.confirmLabel).toBe('confirm.ok');
    });

    it('cancelLabel is confirm.cancel', () => {
      const vm = createMuteSettingsViewModel();
      expect(vm.confirmDialog.cancelLabel).toBe('confirm.cancel');
    });
  });
});
