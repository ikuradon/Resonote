import { getAuth } from '$shared/browser/auth.js';
import {
  getMuteList,
  hasNip44Support,
  muteWord,
  unmuteUser,
  unmuteWord
} from '$shared/browser/mute.js';
import { getProfileDisplay } from '$shared/browser/profile.js';
import { t } from '$shared/i18n/t.js';

type ConfirmVariant = 'danger' | 'default';

interface ConfirmAction {
  title: string;
  message: string;
  variant: ConfirmVariant;
  action: () => Promise<void>;
}

interface ConfirmDialogBinding {
  open: boolean;
  title: string;
  message: string;
  variant: ConfirmVariant;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

interface MutedUserEntry {
  pubkey: string;
  displayName: string;
  profileHref: string;
}

export function createMuteSettingsViewModel() {
  const auth = getAuth();
  const muteList = getMuteList();

  let newMuteWord = $state('');
  let confirmAction = $state<ConfirmAction | null>(null);

  let nip44Supported = $derived(hasNip44Support());
  let canEdit = $derived(auth.canWrite && nip44Supported);
  let confirmDialog = $derived.by<ConfirmDialogBinding>(() => ({
    open: confirmAction !== null,
    title: confirmAction?.title ?? '',
    message: confirmAction?.message ?? '',
    variant: confirmAction?.variant ?? 'default',
    confirmLabel: t('confirm.ok'),
    cancelLabel: t('confirm.cancel'),
    onConfirm: confirmCurrentAction,
    onCancel: cancelConfirmAction
  }));
  let mutedUsers = $derived.by(() =>
    [...muteList.mutedPubkeys].map<MutedUserEntry>((pubkey) => {
      const display = getProfileDisplay(pubkey);
      return {
        pubkey,
        displayName: display.displayName,
        profileHref: display.profileHref
      };
    })
  );

  function requestAddMuteWord(): void {
    const word = newMuteWord.trim();
    if (!word) return;

    const before = muteList.mutedWords.length;
    confirmAction = {
      title: t('confirm.mute_word_add'),
      message: t('confirm.mute_word_add.detail', { before, after: before + 1 }),
      variant: 'default',
      action: async () => {
        await muteWord(word);
        newMuteWord = '';
      }
    };
  }

  function requestUnmuteUser(pubkey: string): void {
    const before = muteList.mutedPubkeys.size;
    confirmAction = {
      title: t('confirm.unmute'),
      message: t('confirm.unmute.detail', { before, after: before - 1 }),
      variant: 'default',
      action: async () => {
        await unmuteUser(pubkey);
      }
    };
  }

  function requestUnmuteWord(word: string): void {
    const before = muteList.mutedWords.length;
    confirmAction = {
      title: t('confirm.mute_word_remove'),
      message: t('confirm.mute_word_remove.detail', { before, after: before - 1 }),
      variant: 'default',
      action: async () => {
        await unmuteWord(word);
      }
    };
  }

  function handleMuteWordKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    requestAddMuteWord();
  }

  async function confirmCurrentAction(): Promise<void> {
    const action = confirmAction?.action;
    confirmAction = null;
    if (action) await action();
  }

  function cancelConfirmAction(): void {
    confirmAction = null;
  }

  return {
    muteList,
    get newMuteWord() {
      return newMuteWord;
    },
    set newMuteWord(value: string) {
      newMuteWord = value;
    },
    get nip44Supported() {
      return nip44Supported;
    },
    get canEdit() {
      return canEdit;
    },
    get mutedUsers() {
      return mutedUsers;
    },
    get confirmDialog() {
      return confirmDialog;
    },
    requestAddMuteWord,
    requestUnmuteUser,
    requestUnmuteWord,
    handleMuteWordKeydown,
    confirmCurrentAction,
    cancelConfirmAction
  };
}
