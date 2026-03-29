import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getMuteListMock,
  muteListState,
  hasNip44SupportMock,
  muteWordMock,
  unmuteUserMock,
  unmuteWordMock,
  getProfileDisplayMock,
  authState
} = vi.hoisted(() => {
  const muteListState = {
    mutedPubkeys: new Set<string>(['pubkey1', 'pubkey2']),
    mutedWords: ['spam', 'bad'],
    encryptionScheme: 'nip44' as const
  };
  const authState = { canWrite: true, loggedIn: true, pubkey: 'test' };
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
      formattedNip05: null
    })),
    authState
  };
});

vi.mock('$shared/browser/auth.js', () => ({
  getAuth: () => authState
}));

vi.mock('$shared/browser/mute.js', () => ({
  getMuteList: getMuteListMock,
  hasNip44Support: hasNip44SupportMock,
  hasEncryptionSupport: hasNip44SupportMock,
  muteWord: muteWordMock,
  unmuteUser: unmuteUserMock,
  unmuteWord: unmuteWordMock
}));

vi.mock('$shared/browser/profile.js', () => ({
  getProfileDisplay: getProfileDisplayMock
}));

vi.mock('$shared/i18n/t.js', () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  }
}));

import { createMuteSettingsViewModel } from './mute-settings-view-model.svelte.js';

describe('createMuteSettingsViewModel', () => {
  beforeEach(() => {
    muteListState.mutedPubkeys = new Set<string>(['pubkey1', 'pubkey2']);
    muteListState.mutedWords = ['spam', 'bad'];
    getMuteListMock.mockReturnValue(muteListState);
    hasNip44SupportMock.mockReturnValue(true);
    authState.canWrite = true;
    authState.loggedIn = true;
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

    it('canEdit is true when canWrite and nip44Supported', () => {
      authState.canWrite = true;
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();
      expect(vm.canEdit).toBe(true);
    });

    it('canEdit is false when canWrite is false', () => {
      authState.canWrite = false;
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();
      expect(vm.canEdit).toBe(false);
    });

    it('canEdit is false when nip44 not supported', () => {
      authState.canWrite = true;
      hasNip44SupportMock.mockReturnValue(false);
      const vm = createMuteSettingsViewModel();
      expect(vm.canEdit).toBe(false);
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
      expect(muteWordMock).toHaveBeenCalledWith('testword', undefined);
      expect(vm.newMuteWord).toBe('');
    });

    it('calls unmuteUser on confirm', async () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteUser('pubkey1');
      await vm.confirmCurrentAction();
      expect(unmuteUserMock).toHaveBeenCalledWith('pubkey1', undefined);
    });

    it('calls unmuteWord on confirm', async () => {
      const vm = createMuteSettingsViewModel();
      vm.requestUnmuteWord('spam');
      await vm.confirmCurrentAction();
      expect(unmuteWordMock).toHaveBeenCalledWith('spam', undefined);
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

  describe('NIP-04 → NIP-44 encryption scheme dialog', () => {
    it('shows scheme confirmation when encryptionScheme is nip04 and NIP-44 is available', async () => {
      muteListState.encryptionScheme = 'nip04' as 'nip44';
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();

      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      // First dialog: operation confirmation
      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.mute_word_add');

      // Confirm the operation → triggers scheme dialog
      await vm.confirmCurrentAction();
      expect(vm.confirmDialog.open).toBe(true);
      expect(vm.confirmDialog.title).toBe('confirm.encryption_scheme');

      // Confirm NIP-44 conversion
      await vm.confirmCurrentAction();
      expect(muteWordMock).toHaveBeenCalledWith('testword', 'nip44');

      // Restore
      muteListState.encryptionScheme = 'nip44' as const;
    });

    it('saves with NIP-04 when user cancels scheme dialog', async () => {
      muteListState.encryptionScheme = 'nip04' as 'nip44';
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();

      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      // First dialog: operation confirmation
      await vm.confirmCurrentAction();
      // Second dialog: scheme confirmation
      expect(vm.confirmDialog.title).toBe('confirm.encryption_scheme');

      // Cancel → keep NIP-04
      vm.cancelConfirmAction();
      expect(muteWordMock).toHaveBeenCalledWith('testword', 'nip04');

      // Restore
      muteListState.encryptionScheme = 'nip44' as const;
    });

    it('skips scheme dialog when encryptionScheme is nip44', async () => {
      muteListState.encryptionScheme = 'nip44' as const;
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();

      vm.newMuteWord = 'testword';
      vm.requestAddMuteWord();
      await vm.confirmCurrentAction();
      // No scheme dialog — muteWord called directly
      expect(muteWordMock).toHaveBeenCalledWith('testword', undefined);
    });

    it('canEdit is false when encryptionScheme is undecryptable', () => {
      muteListState.encryptionScheme = 'undecryptable' as 'nip44';
      hasNip44SupportMock.mockReturnValue(true);
      const vm = createMuteSettingsViewModel();
      expect(vm.canEdit).toBe(false);

      // Restore
      muteListState.encryptionScheme = 'nip44' as const;
    });
  });
});
